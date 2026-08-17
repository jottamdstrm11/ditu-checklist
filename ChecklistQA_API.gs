/**
 * Dashboard Monitoreo QA — Apps Script API
 * Spreadsheet: Checklist de Agosto (y meses anteriores)
 *
 * INSTRUCCIONES DE DEPLOY:
 * 1. Abre el Google Sheets del Checklist
 * 2. Extensiones → Apps Script
 * 3. Pega este código (reemplaza todo lo que haya)
 * 4. Guarda (Ctrl+S)
 * 5. Implementar → Nueva implementación
 *    - Tipo: Aplicación web
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Todos (o "Cualquier usuario de Google" si es interno)
 * 6. Copia la URL que aparece y pégala en el campo "Apps Script URL" del dashboard
 */

// ─── Configuración ───────────────────────────────────────────────────────────

// IDs de los spreadsheets con datos (agrega todos los meses que tengas)
const SPREADSHEETS = [
  {
    id:  '13i-z12lQCvhwE1RLka1LFdHBNaZ7yHiaHq1tysrLHOg',
    mes: 'Agosto 2026',
  },
  // Agrega aquí los meses anteriores cuando los tengas, por ejemplo:
  // { id: 'TU_ID_JULIO',     mes: 'Julio 2026' },
  // { id: 'TU_ID_JUNIO',     mes: 'Junio 2026' },
];

// Hojas que contienen registros de monitoreo (se detectan automáticamente
// si empiezan con el prefijo del mes, ej: "Ago.", "Jul.", etc.)
// También se leen las hojas fijas de abajo:
const HOJAS_FIJAS = ['Monitoreo', 'Soporte', 'Compilado_Final'];

// Columnas esperadas (ajusta si tus hojas tienen otro orden)
// El script las detecta por nombre de cabecera automáticamente.
const COL_MAP = {
  id:           ['id', 'ID'],
  run_id:       ['run_id', 'Run ID', 'RunID'],
  numero_item:  ['numero_item', 'Número', 'Nro', '#'],
  nombre_item:  ['nombre_item', 'Nombre', 'Ítem', 'Item', 'Nombre del ítem'],
  seccion:      ['seccion', 'Sección', 'Seccion', 'Section'],
  estado:       ['estado', 'Estado', 'Status', 'Result'],
  dispositivo:  ['dispositivo', 'Dispositivo', 'Device'],
  observacion:  ['observacion', 'Observación', 'Observacion', 'Obs', 'Comentario'],
  created_at:   ['created_at', 'Fecha', 'Date', 'Timestamp', 'Fecha/Hora'],
};

// ─── Entry point ─────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    const params   = e ? e.parameter : {};
    const desde    = params.desde    || '';   // YYYY-MM-DD
    const hasta    = params.hasta    || '';
    const estado   = params.estado   || '';
    const disp     = params.dispositivo || '';
    const limit    = parseInt(params.limit  || '0', 10);  // 0 = sin límite

    const rows = readAllData(desde, hasta, estado, disp, limit);

    const output = JSON.stringify({ ok: true, total: rows.length, data: rows });
    return ContentService
      .createTextOutput(output)
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    const output = JSON.stringify({ ok: false, error: err.message });
    return ContentService
      .createTextOutput(output)
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── Leer todos los spreadsheets ─────────────────────────────────────────────

function readAllData(desde, hasta, estadoFilter, dispFilter, limit) {
  const allRows = [];

  for (const cfg of SPREADSHEETS) {
    let ss;
    try {
      ss = SpreadsheetApp.openById(cfg.id);
    } catch (e) {
      Logger.log('No se pudo abrir spreadsheet ' + cfg.id + ': ' + e.message);
      continue;
    }

    const sheets = ss.getSheets();
    for (const sheet of sheets) {
      const name = sheet.getName();

      // Solo procesar hojas de monitoreo (las fijas o las que tienen prefijo de día)
      const esFija = HOJAS_FIJAS.includes(name);
      const esDia  = /^(Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic)\.\d+$/i.test(name);

      if (!esFija && !esDia) continue;

      const rows = readSheet(sheet, desde, hasta, estadoFilter, dispFilter, cfg.mes);
      allRows.push(...rows);
    }
  }

  // Ordenar por fecha descendente
  allRows.sort((a, b) => {
    const da = a.created_at || '';
    const db = b.created_at || '';
    return db.localeCompare(da);
  });

  return limit > 0 ? allRows.slice(0, limit) : allRows;
}

// ─── Leer una hoja ────────────────────────────────────────────────────────────

function readSheet(sheet, desde, hasta, estadoFilter, dispFilter, mes) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0].map(h => String(h).trim());
  const colIdx  = buildColIndex(headers);

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    // Saltar filas completamente vacías
    if (row.every(c => c === '' || c === null || c === undefined)) continue;

    const record = {};
    for (const [field, idx] of Object.entries(colIdx)) {
      let val = idx >= 0 ? row[idx] : '';
      // Formatear fechas
      if (field === 'created_at' && val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      } else if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      }
      record[field] = String(val ?? '').trim();
    }

    // Si no hay fecha, intentar inferirla del nombre de hoja (ej: "Ago.16" → 2026-08-16)
    if (!record.created_at && sheet.getName().match(/^(\w{3})\.(\d+)$/i)) {
      record.created_at = inferDateFromSheetName(sheet.getName());
    }

    // Normalizar estado
    record.estado = normalizeEstado(record.estado);
    if (!record.estado) continue;   // fila sin estado válido → saltar

    // Agregar mes de origen
    record.mes = mes;

    // Filtros del lado servidor
    if (desde && record.created_at && record.created_at < desde) continue;
    if (hasta && record.created_at && record.created_at > hasta) continue;
    if (estadoFilter && record.estado !== estadoFilter) continue;
    if (dispFilter   && record.dispositivo !== dispFilter) continue;

    rows.push(record);
  }

  return rows;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildColIndex(headers) {
  const idx = {};
  for (const [field, candidates] of Object.entries(COL_MAP)) {
    idx[field] = -1;
    for (const cand of candidates) {
      const found = headers.findIndex(
        h => h.toLowerCase() === cand.toLowerCase()
      );
      if (found >= 0) { idx[field] = found; break; }
    }
  }
  return idx;
}

const ESTADO_MAP = {
  'pass':           'PASS',
  'aprobado':       'PASS',
  'ok':             'PASS',
  'fail':           'FAIL',
  'fallo':          'FAIL',
  'fallido':        'FAIL',
  'error':          'FAIL',
  'n/a':            'N/A',
  'na':             'N/A',
  'no aplica':      'N/A',
  'unable to test': 'UNABLE TO TEST',
  'unable':         'UNABLE TO TEST',
  'no probado':     'UNABLE TO TEST',
};

function normalizeEstado(raw) {
  if (!raw) return '';
  const key = raw.trim().toLowerCase();
  return ESTADO_MAP[key] || (raw.trim().toUpperCase() || '');
}

const MES_NUM = {
  ene:'01', feb:'02', mar:'03', abr:'04', may:'05', jun:'06',
  jul:'07', ago:'08', sep:'09', oct:'10', nov:'11', dic:'12',
};

function inferDateFromSheetName(name) {
  const m = name.match(/^(\w{3})\.(\d+)$/i);
  if (!m) return '';
  const mes = MES_NUM[m[1].toLowerCase()] || '01';
  const dia = String(m[2]).padStart(2, '0');
  const now  = new Date();
  return `${now.getFullYear()}-${mes}-${dia}`;
}

// ─── Test manual (ejecutar desde el editor para probar) ───────────────────────
function testDoGet() {
  const resultado = readAllData('', '', '', '', 20);
  Logger.log('Total filas: ' + resultado.length);
  Logger.log(JSON.stringify(resultado.slice(0, 3), null, 2));
}
