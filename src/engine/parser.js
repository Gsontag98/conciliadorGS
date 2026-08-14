import * as XLSX from 'xlsx';

function processRawMatrix(data) {
  if (!data || data.length === 0) return [];

  // Find header row
  let headerRowIdx = -1;
  const targetKeywords = ['DATA', 'VALOR', 'HISTORICO', 'DEBITO', 'CREDITO', 'LANÇAMENTO'];
  
  for (let i = 0; i < Math.min(data.length, 20); i++) {
    const row = data[i];
    if (!Array.isArray(row)) continue;
    
    let matches = 0;
    let nonEmpty = 0;
    
    for (const cell of row) {
      if (cell !== undefined && cell !== null && cell !== '') {
        nonEmpty++;
        const cellStr = String(cell).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (targetKeywords.some(k => cellStr.includes(k))) {
          matches++;
        }
      }
    }
    
    if (matches >= 1 && nonEmpty >= 2) { // At least 1 keyword and 2 non-empty cells
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    // Fallback: assume first row with at least 2 columns is header
    for (let i = 0; i < data.length; i++) {
      if (Array.isArray(data[i]) && data[i].filter(c => c !== undefined && c !== null && c !== '').length >= 2) {
        headerRowIdx = i;
        break;
      }
    }
  }

  if (headerRowIdx === -1) return [];

  const headers = data[headerRowIdx].map(h => String(h || '').trim());
  const rows = [];

  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!Array.isArray(row)) continue;
    
    const isEmpty = row.every(c => c === undefined || c === null || c === '');
    if (isEmpty) continue;

    const rowObj = {};
    for (let j = 0; j < headers.length; j++) {
      if (headers[j]) {
        rowObj[headers[j]] = row[j];
      }
    }
    
    // Store array version too for unstructured access
    rowObj.__rawArray = row;
    rows.push(rowObj);
  }

  return rows;
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
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed) {
      const { y, m, d } = parsed;
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null;
  }

  const str = String(val).trim();
  
  // DD/MM/YYYY
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

  // Fallback
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return null;
}

export function parseAmount(val) {
  if (val === null || val === undefined || val === '') return 0;
  
  if (typeof val === 'number') return Math.round(val * 100) / 100;

  let str = String(val).trim().toUpperCase();
  
  // Handle Debito/Credito indicators
  let multiplier = 1;
  if (str.endsWith('D') || str.endsWith('-')) {
    multiplier = -1;
    str = str.replace(/[D\-]$/, '').trim();
  } else if (str.endsWith('C') || str.endsWith('+')) {
    str = str.replace(/[C\+]$/, '').trim();
  }

  // Strip R$ and other chars
  str = str.replace(/^R\$\s*/, '').replace(/[^\d,\.\-]/g, '');

  // Handle Brazilian format (1.234,56 -> 1234.56)
  if (str.includes(',') && str.includes('.')) {
    // check which is the decimal separator
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
  
  return Math.round((parsed * multiplier) * 100) / 100;
}
