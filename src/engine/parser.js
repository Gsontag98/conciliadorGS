import * as XLSX from 'xlsx';

/**
 * Robustly parses a matrix of rows to find headers and data rows for accounting reports.
 */
function processRawMatrix(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return { headers: [], rows: [], rawMatrix: [] };
  }

  // Filter out completely empty rows
  const cleanData = data.filter(row => Array.isArray(row) && row.some(c => c !== null && c !== undefined && String(c).trim() !== ''));
  if (cleanData.length === 0) return { headers: [], rows: [], rawMatrix: [] };

  // Calculate max row width across all rows
  let maxCols = 0;
  for (const row of cleanData) {
    if (row.length > maxCols) maxCols = row.length;
  }

  // Keywords that strictly indicate a header column
  const headerKeywords = ['DATA', 'DT', 'VALOR', 'VLR', 'HISTORICO', 'HIST', 'DEBITO', 'DEB', 'CREDITO', 'CRED', 'LANCAMENTO', 'LCTO', 'DOCUMENTO', 'DOC', 'SALDO', 'MOVIMENTO', 'COMPLEMENTO', 'FORNECEDOR', 'NOME', 'DESCRICAO'];
  // Keywords that disqualify a row from being a table header (e.g. summaries or footers)
  const excludeKeywords = ['TOTAL GERAL', 'TOTAL DO DIA', 'TOTAL DA CONTA', 'SUBTOTAL', 'SALDO ANTERIOR', 'SALDO ATUAL', 'SALDO FINAL', 'DEMONSTRATIVO', 'LIVRO RAZAO', 'EMPRESA:', 'PERIODO:'];

  let headerRowIdx = -1;
  let bestHeaderScore = 0;

  // Scan only the top 40 rows for header
  const scanLimit = Math.min(cleanData.length, 40);

  for (let i = 0; i < scanLimit; i++) {
    const row = cleanData[i];
    const rowText = row.map(c => String(c || '')).join(' ').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Skip if it contains strong footer/header metadata keywords
    if (excludeKeywords.some(k => rowText.includes(k))) {
      continue;
    }

    let keywordCount = 0;
    let textCells = 0;

    for (const cell of row) {
      if (cell !== undefined && cell !== null && String(cell).trim() !== '') {
        const cellStr = String(cell).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        textCells++;
        if (headerKeywords.some(k => cellStr === k || cellStr.startsWith(k) || cellStr.endsWith(k))) {
          keywordCount += 2;
        } else if (headerKeywords.some(k => cellStr.includes(k))) {
          keywordCount += 1;
        }
      }
    }

    // A valid header row should have multiple keywords and at least 2 non-empty cells
    if (keywordCount >= 3 && keywordCount > bestHeaderScore) {
      // Check if there are data rows AFTER this candidate
      if (i < cleanData.length - 1) {
        bestHeaderScore = keywordCount;
        headerRowIdx = i;
      }
    }
  }

  // Fallback 1: if no strong header found, find first row with at least 3 non-empty string cells
  if (headerRowIdx === -1) {
    for (let i = 0; i < scanLimit; i++) {
      const row = cleanData[i];
      const nonEmpties = row.filter(c => c !== undefined && c !== null && String(c).trim() !== '');
      if (nonEmpties.length >= 3 && nonEmpties.every(c => typeof c === 'string' && isNaN(Number(c.replace(',', '.'))))) {
        headerRowIdx = i;
        break;
      }
    }
  }

  // Fallback 2: Look for the first row right before the first date-containing row
  if (headerRowIdx === -1) {
    for (let i = 0; i < cleanData.length; i++) {
      const row = cleanData[i];
      const hasDate = row.some(c => parseDate(c) !== null);
      if (hasDate) {
        headerRowIdx = Math.max(0, i - 1);
        break;
      }
    }
  }

  // Ultimate fallback
  if (headerRowIdx === -1) {
    headerRowIdx = 0;
  }

  // Build unique header names with padding to maxCols
  const rawHeaders = cleanData[headerRowIdx] || [];
  const headers = [];
  const seenHeaders = {};

  for (let j = 0; j < maxCols; j++) {
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

  // Extract data rows
  const rows = [];
  const ignoreRowKeywords = ['TOTAL GERAL', 'TOTAL DO DIA', 'TOTAL DA CONTA', 'SUBTOTAL', 'SALDO ATUAL', 'SALDO FINAL', 'TRANSPORTE', 'A TRANSPORTAR'];

  for (let i = headerRowIdx + 1; i < cleanData.length; i++) {
    const row = cleanData[i];
    if (!Array.isArray(row)) continue;

    const nonEmpties = row.filter(c => c !== undefined && c !== null && String(c).trim() !== '');
    if (nonEmpties.length === 0) continue;

    // Check for total/footer row
    const rowText = row.map(c => String(c || '')).join(' ').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (ignoreRowKeywords.some(k => rowText.includes(k))) {
      continue;
    }

    const rowObj = {};
    for (let j = 0; j < headers.length; j++) {
      rowObj[headers[j]] = row[j] !== undefined ? row[j] : null;
    }
    rowObj.__rawArray = row;
    rows.push(rowObj);
  }

  return { headers, rows, rawMatrix: cleanData, headerRowIdx };
}

export function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {
          type: 'array',
          cellDates: true,
          raw: false,
          dateNF: 'yyyy-mm-dd'
        });

        const sheets = {};
        const sheetNames = workbook.SheetNames;

        for (const name of sheetNames) {
          const sheet = workbook.Sheets[name];
          // Use defval: null to prevent sparse array issues
          const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
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
  if (val === null || val === undefined || val === '') return null;

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val.toISOString().split('T')[0];
  }

  if (typeof val === 'number') {
    try {
      const parsed = XLSX.SSF.parse_date_code(val);
      if (parsed) {
        const { y, m, d } = parsed;
        if (y >= 1990 && y <= 2050) {
          return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
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
    const day = parseInt(d, 10);
    const month = parseInt(m, 10);
    const year = parseInt(y, 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1990 && year <= 2050) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (isoMatch) {
    const [_, y, m, d] = isoMatch;
    const year = parseInt(y, 10);
    const month = parseInt(m, 10);
    const day = parseInt(d, 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1990 && year <= 2050) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

export function parseAmount(val) {
  if (val === null || val === undefined || val === '') return 0;

  if (typeof val === 'number') return Math.abs(Math.round(val * 100) / 100);

  let str = String(val).trim().toUpperCase();

  // Negative accounting format: (1.234,56)
  if (str.startsWith('(') && str.endsWith(')')) {
    str = str.slice(1, -1);
  }

  // Remove D/C indicator
  str = str.replace(/[DC\+\-]$/, '').trim();

  // Strip R$ and non-numeric chars except comma, period, minus
  str = str.replace(/^R\$\s*/, '').replace(/[^\d,\.\-]/g, '');

  // Handle Brazilian format: 1.234,56 -> 1234.56
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
