-- =====================================================================
-- Opción C — Resultados compactos para Dashboard y Analytics
-- =====================================================================
-- QUÉ HACE
--   Devuelve los resultados de checklist de un cliente en un rango de
--   fechas, YA DEDUPLICADOS (1 fila por run × ítem × dispositivo, con
--   prioridad FAIL > UNABLE TO TEST > N/A > PASS, igual que la app),
--   en un JSON compacto: los textos repetidos (runs, dispositivos, ítems,
--   estados) van una sola vez y cada resultado va como 4 números.
--   Reemplaza ~200 consultas de 1.000 filas por unas pocas respuestas.
--
-- QUÉ NO HACE
--   · No modifica datos, tablas, índices ni policies (solo SELECT).
--   · SECURITY INVOKER: se ejecuta con los permisos de quien la llama,
--     así que RLS aplica exactamente igual que en las consultas actuales.
--
-- CÓMO REVERTIR
--   DROP FUNCTION IF EXISTS public.qa_results_compact(uuid, text, text);
--   (La app detecta que no existe y vuelve sola a la carga por lotes.)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.qa_results_compact(
  p_cliente uuid,
  p_desde   text,   -- 'YYYY-MM-DD' inclusive
  p_hasta   text    -- 'YYYY-MM-DD' inclusive
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH u AS (
    SELECT id
    FROM checklist_runs
    WHERE (p_cliente IS NULL OR cliente_id = p_cliente)
      AND left(fecha::text, 10) BETWEEN p_desde AND p_hasta
  ),
  d AS (
    -- Misma deduplicación que la app: por (run, ítem, dispositivo),
    -- gana el estado más grave; en empate, el registro más antiguo por id
    SELECT DISTINCT ON (r.run_id, r.numero_item, r.dispositivo)
           r.run_id, r.dispositivo, r.numero_item, r.nombre_item, r.seccion, r.estado
    FROM checklist_results r
    JOIN u ON u.id = r.run_id
    ORDER BY r.run_id, r.numero_item, r.dispositivo,
             CASE r.estado WHEN 'FAIL' THEN 3 WHEN 'UNABLE TO TEST' THEN 2
                           WHEN 'N/A' THEN 1 WHEN 'PASS' THEN 0 ELSE -1 END DESC,
             r.id
  ),
  rn AS (SELECT run_id, (row_number() OVER (ORDER BY run_id)) - 1 AS i
         FROM (SELECT DISTINCT run_id FROM d) x),
  dv AS (SELECT dispositivo, (row_number() OVER (ORDER BY dispositivo)) - 1 AS i
         FROM (SELECT DISTINCT dispositivo FROM d) x),
  it AS (SELECT numero_item, nombre_item, seccion,
                (row_number() OVER (ORDER BY numero_item, nombre_item, seccion)) - 1 AS i
         FROM (SELECT DISTINCT numero_item, nombre_item, seccion FROM d) x),
  es AS (SELECT estado, (row_number() OVER (ORDER BY estado NULLS LAST)) - 1 AS i
         FROM (SELECT DISTINCT estado FROM d) x)
  SELECT json_build_object(
    'runs',    (SELECT coalesce(json_agg(run_id ORDER BY i), '[]'::json) FROM rn),
    'devs',    (SELECT coalesce(json_agg(dispositivo ORDER BY i), '[]'::json) FROM dv),
    'items',   (SELECT coalesce(json_agg(json_build_array(numero_item, nombre_item, seccion) ORDER BY i), '[]'::json) FROM it),
    'estados', (SELECT coalesce(json_agg(estado ORDER BY i), '[]'::json) FROM es),
    'rows',    (SELECT coalesce(json_agg(json_build_array(rn.i, dv.i, it.i, es.i)), '[]'::json)
                FROM d
                JOIN rn ON rn.run_id = d.run_id
                JOIN dv ON dv.dispositivo = d.dispositivo
                JOIN it ON it.numero_item = d.numero_item
                       AND it.nombre_item = d.nombre_item
                       AND it.seccion     = d.seccion
                JOIN es ON es.estado IS NOT DISTINCT FROM d.estado)
  );
$$;

-- Permiso para llamar la función (solo esta función; no cambia policies)
GRANT EXECUTE ON FUNCTION public.qa_results_compact(uuid, text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- PRUEBA (solo lectura) — después de crearla, verifica que responde:
--   SELECT json_array_length(qa_results_compact(NULL, '2026-11-01', '2026-11-07') -> 'rows') AS filas;
-- ---------------------------------------------------------------------
