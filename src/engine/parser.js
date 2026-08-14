import * as XLSX from 'xlsx';

function processRawMatrix(data) {
  if (!data || data.length === 0) return { headers: [], rows: [] };

  // Find header row: scan first 50 rows
  let headerRowIdx = -1;
  let maxKeywordMatches = 0;
  const targetKeywords = ['DATA', 'DT', 'VALOR', 'VLR', 'HIST', 'DEB', 'CRED', 'LANC', 'LCTO', 'DOC', 'SALDO', 'MOV', 'COMPLEMENTO', 'FORNECEDOR'];

  for (let i = 0; i < Math.min(data.length, 50); i++) {
    const row = data[i];
    if (!Array.isArray(row)) continue;

    let matches = 0;
    let nonEmpty = 0;

    for (const cell of row) {
      if (cell !== undefined && cell !== null && String(cell).trim() !== '') {
        nonEmpty++;
        const cellStr = String(cell).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (targetKeywords.some(k => cellStr.includes(k))) {
          matches++;
        }
      }
    }

    if (matches >= 2 && matches > maxKeywordMatches) {
      maxKeywordMatches = matches;
      headerRowIdx = i;
    } else if (matches >= 1 && nonEmpty >= 2 && headerRowIdx === -1) {
      headerRowIdx = i;
      maxKeywordMatches = matches;
    }
  }

  // Fallback: first row with at least 3 non-empty cells
  if (headerRowIdx === -1) {
    for (let i = 0; i < Math.min(data.length, 30); i++) {
      if (Array.isArray(data[i]) && data[i].filter(c => c !== undefined && c !== null && String(c).trim() !== '').length >= 3) {
        headerRowIdx = i;
        break;
      }
    }
  }

  // Ultimate fallback: row 0
  if (headerRowIdx === -1) {
    headerRowIdx = 0;
  }

  const rawHeaders = data[headerRowIdx] || [];
  const headers = [];
  const seenHeaders = {};

  for (let j = 0; j < rawHeaders.length; j++) {
    let h = String(rawHeaders[j] || '').trim();
    if (!h) h = `Coluna_${j + 1}`;
    if (seenHeaders[h]) {
      seenHeaders[h]++;
      h = `${h}_${seenHeaders[h]}`;
    } else {
      seenHeaders[h] = 1;
    }
    headers.push(h);
  }

  const rows = [];
  const ignoreKeywords = ['TOTAL', 'SALDO ANTERIOR', 'SALDO ATUAL', 'SALDO FINAL', 'TRANSPORTE', 'A TRANSPORTAR', 'SUBTOTAL'];

  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!Array.isArray(row)) continue;

    const nonEmptyCells = row.filter(c => c !== undefined && c !== null && String(c).trim() !== '');
    if (nonEmptyCells.length === 0) continue;

    // Check if this row is a total/summary row
    const firstNonEmpty = String(nonEmptyCells[0] || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (ignoreKeywords.some(k => firstNonEmpty.startsWith(k) || firstNonEmpty === k)) {
      continue;
    }

    const rowObj = {};
    for (let j = 0; j < headers.length; j++) {
      rowObj[headers[j]] = row[j] !== undefined ? row[j] : null;
    }

    rowObj.__rawArray = row;
    rows.push(rowObj);
  }

  return { headers, rows };
}

export function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });

        const sheets = {};
        const sheetNames = workbook.SheetNames;

        for (const name of sheetNames) {
          const sheet = workbook.Sheets[name];
          const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
          sheets[name] = processRawMatrix(rawData);
        }

        resolve({ sheets, sheetNames });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

export function parseDate(val) {
  if (!val) return null;

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val.toISOString().split('T')[0];
  }

  if (typeof val === 'number') {
    // Excel date code
    try {
      const parsed = XLSX.SSF.parse_date_code(val);
      if (parsed) {
        const { y, m, d } = parsed;
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    } catch {
      // ignore
    }
    return null;
  }

  const str = String(val).trim();

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const brMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (brMatch) {
    let [_, d, m, y] = brMatch;
    if (y.length === 2) y = '20' + y;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (isoMatch) {
    const [_, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Fallback Date parse
  const d = new Date(str);
  if (!isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2100) {
    return d.toISOString().split('T')[0];
  }

  return null;
}

export function parseAmount(val) {
  if (val === null || val === undefined || val === '') return 0;

  if (typeof val === 'number') return Math.abs(Math.round(val * 100) / 100);

  let str = String(val).trim().toUpperCase();

  // Handle Debit/Credit indicators or negative parentheses: (1.234,56)
  if (str.startsWith('(') && str.endsWith(')')) {
    str = str.slice(1, -1);
  }

  str = str.replace(/[DC\+\-]$/, '').trim();

  // Strip R$ and noise
  str = str.replace(/^R\$\s*/, '').replace(/[^\d,\.]/g, '');

  // Handle Brazilian format (1.234,56 -> 1234.56)
  if (str.includes(',') && str.includes('.')) {
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    if (lastComma > lastDot) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }

  const parsed = parseFloat(str);
  if (isNaN(parsed)) return 0;

  return Math.abs(Math.round(parsed * 100) / 100);
}
