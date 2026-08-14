/**
 * PARSER ENGINE
 * Handles Excel file parsing (.xlsx / .xls), sheet detection, header auto-discovery,
 * date normalization, and financial amount parsing.
 */

const ExcelParser = (function () {

  /**
   * Parses an Excel file (File object) using SheetJS
   * Returns a promise resolving to { sheets: { sheetName: [rows] }, sheetNames: [] }
   */
  function parseFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = function (e) {
        try {
          const data = new Uint8Array(e.target.result);
          if (typeof XLSX === 'undefined') {
            throw new Error('Biblioteca SheetJS (XLSX) não carregada.');
          }

          const workbook = XLSX.read(data, {
            type: 'array',
            cellDates: true,
            dateNF: 'yyyy-mm-dd'
          });

          const result = {
            sheetNames: workbook.SheetNames,
            sheets: {}
          };

          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            // Convert to 2D array matrix first to intelligently find headers
            const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
            result.sheets[sheetName] = processRawMatrix(matrix);
          });

          resolve(result);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = function (err) {
        reject(err);
      };

      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Processes a raw matrix (2D array) from Excel to find the header row
   * and clean up the dataset (skipping header titles like "RELATÓRIO DO RAZÃO DOMÍNIO")
   */
  function processRawMatrix(matrix) {
    if (!matrix || matrix.length === 0) return { headers: [], rows: [] };

    // Find the header row (first row with at least 2 non-empty text cells)
    let headerIndex = -1;
    for (let r = 0; r < Math.min( matrix.length, 25); r++) {
      const row = matrix[r];
      if (!row || !Array.isArray(row)) continue;

      const nonEmptyCount = row.filter(cell => cell !== null && cell !== undefined && String(cell).trim() !== '').length;
      if (nonEmptyCount >= 2) {
        // Check if row contains keywords like DATA, VALOR, HISTÓRICO, DÉBITO, CRÉDITO, DOCUMENTO
        const rowStr = row.join(' ').toUpperCase();
        if (rowStr.includes('DATA') || rowStr.includes('VALOR') || rowStr.includes('HISTORICO') || rowStr.includes('DEBITO') || rowStr.includes('CREDITO') || rowStr.includes('LANÇAMENTO')) {
          headerIndex = r;
          break;
        }
        if (headerIndex === -1 && nonEmptyCount >= 3) {
          headerIndex = r;
        }
      }
    }

    if (headerIndex === -1) headerIndex = 0;

    const rawHeaders = matrix[headerIndex] || [];
    const headers = rawHeaders.map((h, colIdx) => {
      const title = String(h || '').trim();
      return title ? title : `Coluna ${colIdx + 1}`;
    });

    const rows = [];
    for (let r = headerIndex + 1; r < matrix.length; r++) {
      const rowArr = matrix[r];
      if (!rowArr || !Array.isArray(rowArr)) continue;

      const rowObj = {};
      let hasData = false;

      headers.forEach((h, colIdx) => {
        const val = rowArr[colIdx] !== undefined ? rowArr[colIdx] : '';
        rowObj[h] = val;
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          hasData = true;
        }
      });

      if (hasData) {
        rows.push(rowObj);
      }
    }

    return { headers, rows };
  }

  /**
   * Helper to parse Excel dates (Date object, string, or Excel serial number)
   * Returns a ISO date string 'YYYY-MM-DD' or null if invalid
   */
  function parseDate(val) {
    if (val === null || val === undefined || val === '') return null;

    if (val instanceof Date) {
      if (isNaN(val.getTime())) return null;
      return val.toISOString().split('T')[0];
    }

    // If numerical Excel date serial number (e.g. 45123)
    if (typeof val === 'number') {
      const dateObj = XLSX.SSF.parse_date_code(val);
      if (dateObj) {
        const y = dateObj.y;
        const m = String(dateObj.m).padStart(2, '0');
        const d = String(dateObj.d).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }

    const str = String(val).trim();

    // Check Brazilian format DD/MM/YYYY or DD-MM-YYYY
    const brMatch = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})$/);
    if (brMatch) {
      let day = parseInt(brMatch[1], 10);
      let month = parseInt(brMatch[2], 10);
      let year = parseInt(brMatch[3], 10);
      if (year < 100) year += 2000; // handle 2-digit years

      const yStr = String(year);
      const mStr = String(month).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      return `${yStr}-${mStr}-${dStr}`;
    }

    // Check ISO format YYYY-MM-DD
    const isoMatch = str.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if (isoMatch) {
      return `${isoMatch[1]}-${String(isoMatch[2]).padStart(2, '0')}-${String(isoMatch[3]).padStart(2, '0')}`;
    }

    // Fallback Date parse
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }

    return null;
  }

  /**
   * Helper to parse monetary amounts (handles 'R$', BR punctuation '1.234,56', etc.)
   */
  function parseAmount(val) {
    if (val === null || val === undefined || val === '') return 0.0;
    if (typeof val === 'number') return isNaN(val) ? 0.0 : val;

    let str = String(val).trim();

    // Check if debit indicator like "C" (Credit) or "D" (Debit) or negative sign
    let isNegative = false;
    if (str.endsWith('D') || str.endsWith('d') || str.startsWith('-')) {
      isNegative = true;
    }

    // Clean formatting symbols
    str = str.replace(/[R\$\s]/gi, '');

    // Convert Brazilian notation 1.234,56 to JS float 1234.56
    if (str.includes(',') && str.includes('.')) {
      // e.g. 1.234,56 -> 1234.56
      str = str.replace(/\./g, '').replace(',', '.');
    } else if (str.includes(',')) {
      // e.g. 1234,56 -> 1234.56
      str = str.replace(',', '.');
    }

    // Remove any remaining non-numeric chars except '.' and '-'
    str = str.replace(/[^0-9\.-]/g, '');

    let num = parseFloat(str);
    if (isNaN(num)) return 0.0;

    if (isNegative && num > 0) num = -num;

    // Round to 2 decimal places to prevent floating point inaccuracy
    return Math.round(num * 100) / 100;
  }

  return {
    parseFile,
    parseDate,
    parseAmount
  };

})();
