import * as XLSX from 'xlsx';

/**
 * Ensures a worksheet has a valid `!ref` range by scanning its cell keys.
 * Crucial for Domínio .xls exports where !ref is omitted or malformed.
 */
function ensureSheetRef(sheet) {
  if (!sheet) return;
  const keys = Object.keys(sheet).filter(k => !k.startsWith('!'));
  if (keys.length === 0) return;

  let minR = Infinity, maxR = 0, minC = Infinity, maxC = 0;
  for (const k of keys) {
    try {
      const decoded = XLSX.utils.decode_cell(k);
      if (decoded.r < minR) minR = decoded.r;
      if (decoded.r > maxR) maxR = decoded.r;
      if (decoded.c < minC) minC = decoded.c;
      if (decoded.c > maxC) maxC = decoded.c;
    } catch {}
  }

  if (minR !== Infinity) {
    sheet['!ref'] = XLSX.utils.encode_range({
      s: { r: minR, c: minC },
      e: { r: maxR, c: maxC }
    });
  }
}

function isBinaryExcel(u8) {
  if (!u8 || u8.length < 4) return false;
  // OLE2 / BIFF8 (.xls): D0 CF 11 E0
  if (u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0) return true;
  // ZIP / XLSX (.xlsx): 50 4B
  if (u8[0] === 0x50 && u8[1] === 0x4B) return true;
  return false;
}

function parseHtmlTable(htmlText) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    const rows = [];

    const trElements = doc.querySelectorAll('tr');
    trElements.forEach(tr => {
      const row = [];
      const cells = tr.querySelectorAll('td, th');
      cells.forEach(cell => {
        const text = (cell.textContent || '').replace(/\u00a0/g, ' ').trim();
        const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
        row.push(text);
        for (let c = 1; c < colspan; c++) {
          row.push(null);
        }
      });
      if (row.some(c => c !== null && c !== '')) {
        rows.push(row);
      }
    });

    return rows;
  } catch (e) {
    console.warn('HTML table parsing failed:', e);
    return [];
  }
}

function parseXmlSpreadsheet(xmlText) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const rows = [];

    const rowElements = doc.querySelectorAll('Row');
    rowElements.forEach(rowEl => {
      const row = [];
      const cellElements = rowEl.querySelectorAll('Cell');
      cellElements.forEach(cellEl => {
        const indexAttr = cellEl.getAttribute('ss:Index');
        if (indexAttr) {
          const targetIdx = parseInt(indexAttr, 10) - 1;
          while (row.length < targetIdx) row.push(null);
        }
        const dataEl = cellEl.querySelector('Data');
        const text = dataEl ? (dataEl.textContent || '').trim() : '';
        row.push(text);
      });
      if (row.some(c => c !== null && c !== '')) {
        rows.push(row);
      }
    });

    return rows;
  } catch (e) {
    console.warn('XML spreadsheet parsing failed:', e);
    return [];
  }
}

function parseDelimitedText(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  const sample = lines.slice(0, 5).join('\n');
  const countSemi = (sample.match(/;/g) || []).length;
  const countTab = (sample.match(/\t/g) || []).length;
  const countComma = (sample.match(/,/g) || []).length;

  let delimiter = ';';
  if (countTab > countSemi && countTab > countComma) delimiter = '\t';
  else if (countComma > countSemi && countComma > countTab) delimiter = ',';

  return lines.map(line => {
    const row = [];
    let insideQuotes = false;
    let currentCell = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === delimiter && !insideQuotes) {
        row.push(currentCell.trim());
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    row.push(currentCell.trim());
    return row;
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    if (file.arrayBuffer) {
      file.arrayBuffer().then(resolve).catch(() => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });
    } else {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    }
  });
}

function readFileAsBinaryString(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result || '');
    reader.onerror = () => resolve('');
    reader.readAsBinaryString(file);
  });
}

function readAsTextWithEncoding(file, encoding = 'windows-1252') {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result || '');
    reader.onerror = () => resolve('');
    reader.readAsText(file, encoding);
  });
}

/**
 * Transaction Anchor Algorithm:
 * Scans the raw matrix to find where data rows begin,
 * then accurately pinpoints the header row and maps all columns.
 */
export function processRawMatrix(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return { headers: [], rows: [], rawMatrix: [], samples: {}, headerRowIdx: 0 };
  }

  // Filter out completely empty rows
  const cleanData = data.filter(row => Array.isArray(row) && row.some(c => c !== null && c !== undefined && String(c).trim() !== ''));
  if (cleanData.length === 0) return { headers: [], rows: [], rawMatrix: [], samples: {}, headerRowIdx: 0 };

  let maxCols = 0;
  for (const row of cleanData) {
    if (row.length > maxCols) maxCols = row.length;
  }

  // 1. Transaction Anchor Search: find the first row that has a valid date in column 0 or 1
  let firstTransactionRowIdx = -1;
  let dateColIdx = 0;

  for (let i = 0; i < cleanData.length; i++) {
    const row = cleanData[i];
    if (parseDate(row[0])) {
      firstTransactionRowIdx = i;
      dateColIdx = 0;
      break;
    } else if (parseDate(row[1])) {
      firstTransactionRowIdx = i;
      dateColIdx = 1;
      break;
    }
  }

  // 2. Locate Header Row: look backwards from firstTransactionRowIdx for a row with header keywords
  let headerRowIdx = -1;
  const headerKeywords = ['DATA', 'DT', 'VALOR', 'VLR', 'HISTORICO', 'HIST', 'DEBITO', 'DEB', 'CREDITO', 'CRED', 'LANCAMENTO', 'LCTO', 'DOCUMENTO', 'DOC', 'SALDO', 'MOVIMENTO', 'LOTE'];

  if (firstTransactionRowIdx > 0) {
    for (let i = firstTransactionRowIdx - 1; i >= 0; i--) {
      const row = cleanData[i];
      let matches = 0;
      for (const cell of row) {
        if (cell !== null && cell !== undefined && String(cell).trim() !== '') {
          const cellStr = String(cell).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (headerKeywords.some(k => cellStr === k || cellStr.startsWith(k) || cellStr.includes(k))) {
            matches++;
          }
        }
      }
      if (matches >= 2) {
        headerRowIdx = i;
        break;
      }
    }
  }

  // Fallback if not found by looking backwards: scan top 25 rows
  if (headerRowIdx === -1) {
    let bestScore = 0;
    for (let i = 0; i < Math.min(cleanData.length, 25); i++) {
      const row = cleanData[i];
      let matches = 0;
      for (const cell of row) {
        if (cell !== null && cell !== undefined && String(cell).trim() !== '') {
          const cellStr = String(cell).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (headerKeywords.some(k => cellStr === k || cellStr.startsWith(k) || cellStr.includes(k))) {
            matches++;
          }
        }
      }
      if (matches >= 2 && matches > bestScore) {
        bestScore = matches;
        headerRowIdx = i;
      }
    }
  }

  if (headerRowIdx === -1) {
    headerRowIdx = firstTransactionRowIdx > 0 ? firstTransactionRowIdx - 1 : 0;
  }

  // 3. Build descriptive header names
  const rawHeaders = cleanData[headerRowIdx] || [];
  const headers = [];
  const seenHeaders = {};
  const samples = {};

  const scanStart = firstTransactionRowIdx !== -1 ? firstTransactionRowIdx : headerRowIdx + 1;
  for (let j = 0; j < maxCols; j++) {
    let sampleVal = null;
    for (let i = scanStart; i < Math.min(cleanData.length, scanStart + 20); i++) {
      const cell = cleanData[i]?.[j];
      if (cell !== null && cell !== undefined && String(cell).trim() !== '') {
        sampleVal = String(cell).trim();
        break;
      }
    }
    samples[j] = sampleVal;
  }

  const defaultDominioCols = {
    0: 'Data',
    1: 'Lote',
    2: 'Histórico',
    7: 'Cta.C.Part.',
    8: 'Débito',
    9: 'Crédito',
    12: 'Saldo-Exercício'
  };

  for (let j = 0; j < maxCols; j++) {
    let h = String(rawHeaders[j] || '').trim();

    if (!h) {
      if (defaultDominioCols[j] && samples[j]) {
        h = defaultDominioCols[j];
      } else {
        h = `Coluna_${j + 1}`;
      }
    }

    if (seenHeaders[h]) {
      seenHeaders[h]++;
      h = `${h}_${seenHeaders[h]}`;
    } else {
      seenHeaders[h] = 1;
    }
    headers.push(h);
  }

  // 4. Extract data rows
  const rows = [];
  const ignoreRowKeywords = ['TOTAL GERAL', 'TOTAL DO DIA', 'TOTAL DA CONTA', 'SUBTOTAL', 'SALDO ATUAL', 'SALDO FINAL', 'TRANSPORTE', 'A TRANSPORTAR'];

  for (let i = headerRowIdx + 1; i < cleanData.length; i++) {
    const row = cleanData[i];
    if (!Array.isArray(row)) continue;

    const nonEmpties = row.filter(c => c !== undefined && c !== null && String(c).trim() !== '');
    if (nonEmpties.length === 0) continue;

    const rowText = row.map(c => String(c || '')).join(' ').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (ignoreRowKeywords.some(k => rowText.includes(k))) {
      continue;
    }

    const rowObj = {};
    for (let j = 0; j < headers.length; j++) {
      rowObj[headers[j]] = row[j] !== undefined ? row[j] : null;
    }
    rowObj.__rawArray = row;
    rowObj.__originalRowIdx = i + 1;
    rows.push(rowObj);
  }

  if (rows.length === 0 && cleanData.length > 0) {
    for (let i = 0; i < cleanData.length; i++) {
      const row = cleanData[i];
      const rowObj = {};
      for (let j = 0; j < headers.length; j++) {
        rowObj[headers[j]] = row[j] !== undefined ? row[j] : null;
      }
      rowObj.__rawArray = row;
      rowObj.__originalRowIdx = i + 1;
      rows.push(rowObj);
    }
  }

  return {
    headers,
    rows,
    rawMatrix: cleanData,
    samples,
    headerRowIdx,
    firstTransactionRowIdx,
    dateColIdx
  };
}

export async function parseFile(file) {
  const sheets = {};
  let sheetNames = [];

  const arrayBuffer = await readFileAsArrayBuffer(file);
  const bytes = new Uint8Array(arrayBuffer);
  const isBinary = isBinaryExcel(bytes);

  // Strategy 1: Binary parsing for XLSX / XLS
  if (isBinary) {
    try {
      const workbook = XLSX.read(bytes, { type: 'array' });
      if (workbook && workbook.SheetNames && workbook.SheetNames.length > 0) {
        sheetNames = workbook.SheetNames;
        for (const name of sheetNames) {
          const sheet = workbook.Sheets[name];
          if (sheet) {
            ensureSheetRef(sheet);
            const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
            if (Array.isArray(rawData) && rawData.length > 0) {
              const processed = processRawMatrix(rawData);
              if (processed.rawMatrix.length > 0) {
                sheets[name] = processed;
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('SheetJS array read error, trying binary string:', err);
    }

    // Binary string fallback
    if (Object.keys(sheets).length === 0) {
      try {
        const binStr = await readFileAsBinaryString(file);
        const workbook = XLSX.read(binStr, { type: 'binary' });
        if (workbook && workbook.SheetNames && workbook.SheetNames.length > 0) {
          sheetNames = workbook.SheetNames;
          for (const name of sheetNames) {
            const sheet = workbook.Sheets[name];
            if (sheet) {
              ensureSheetRef(sheet);
              const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
              if (Array.isArray(rawData) && rawData.length > 0) {
                const processed = processRawMatrix(rawData);
                if (processed.rawMatrix.length > 0) {
                  sheets[name] = processed;
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('SheetJS binary string read error:', err);
      }
    }
  }

  // Strategy 2: Text parsing for HTML / XML / CSV ONLY if NOT a binary file
  if (!isBinary && Object.keys(sheets).length === 0) {
    let text = await readAsTextWithEncoding(file, 'windows-1252');
    if (!text || text.length === 0) {
      text = await readAsTextWithEncoding(file, 'utf-8');
    }

    if (text && text.length > 0) {
      if (text.includes('<table') || text.includes('<TABLE') || text.includes('<html') || text.includes('<HTML') || text.includes('<tr') || text.includes('<TR')) {
        const htmlMatrix = parseHtmlTable(text);
        if (htmlMatrix.length > 0) {
          sheets['Razão'] = processRawMatrix(htmlMatrix);
          sheetNames = ['Razão'];
        }
      } else if (text.includes('<?xml') && text.includes('<Workbook')) {
        const xmlMatrix = parseXmlSpreadsheet(text);
        if (xmlMatrix.length > 0) {
          sheets['Razão'] = processRawMatrix(xmlMatrix);
          sheetNames = ['Razão'];
        }
      } else {
        const csvMatrix = parseDelimitedText(text);
        if (csvMatrix.length > 0) {
          sheets['Razão'] = processRawMatrix(csvMatrix);
          sheetNames = ['Razão'];
        }
      }
    }
  }

  return { sheets, sheetNames: Object.keys(sheets) };
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

  if (str.startsWith('(') && str.endsWith(')')) {
    str = str.slice(1, -1);
  }

  str = str.replace(/[DC\+\-]$/, '').trim();
  str = str.replace(/^R\$\s*/, '').replace(/[^\d,\.\-]/g, '');

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
