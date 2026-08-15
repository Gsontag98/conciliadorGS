import * as XLSX from 'xlsx';

function isBinaryExcel(u8) {
  if (!u8 || u8.length < 4) return false;
  // OLE2 / BIFF8 (.xls): D0 CF 11 E0
  if (u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0) return true;
  // ZIP / XLSX (.xlsx): 50 4B
  if (u8[0] === 0x50 && u8[1] === 0x4B) return true;
  return false;
}

/**
 * Universal worksheet extractor:
 * 1. Tries standard sheet_to_json.
 * 2. If empty or failed, scans all cell coordinates manually to reconstruct rows.
 */
function getSheetDataMatrix(sheet, diag) {
  if (!sheet) return [];

  let rawData = [];
  try {
    rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
    if (Array.isArray(rawData) && rawData.length > 0) {
      diag?.log(`[SHEET_TO_JSON] ${rawData.length} linhas obtidas via sheet_to_json.`);
      return rawData;
    }
  } catch (e) {
    diag?.log(`[AVISO] sheet_to_json direto falhou: ${e.message}`);
  }

  // Fallback: iterate over all cell keys
  const keys = Object.keys(sheet).filter(k => !k.startsWith('!'));
  diag?.log(`[RECUPERAÇÃO] Tentando reconstruir planilha a partir de ${keys.length} células isoladas...`);

  if (keys.length === 0) return [];

  let minR = Infinity, maxR = 0, minC = Infinity, maxC = 0;
  const cellMap = {};

  for (const k of keys) {
    try {
      const decoded = XLSX.utils.decode_cell(k);
      if (decoded.r < minR) minR = decoded.r;
      if (decoded.r > maxR) maxR = decoded.r;
      if (decoded.c < minC) minC = decoded.c;
      if (decoded.c > maxC) maxC = decoded.c;
      const cell = sheet[k];
      cellMap[`${decoded.r},${decoded.c}`] = cell ? (cell.w !== undefined && cell.w !== '' ? cell.w : cell.v) : null;
    } catch {}
  }

  if (minR === Infinity) return [];

  const rangeStr = XLSX.utils.encode_range({
    s: { r: minR, c: minC },
    e: { r: maxR, c: maxC }
  });
  sheet['!ref'] = rangeStr;
  diag?.log(`[REF RECONSTRUÍDO] ${rangeStr}: linhas ${minR + 1} a ${maxR + 1}, colunas ${minC + 1} a ${maxC + 1}`);

  rawData = [];
  for (let r = minR; r <= maxR; r++) {
    const row = [];
    for (let c = minC; c <= maxC; c++) {
      row.push(cellMap[`${r},${c}`] !== undefined ? cellMap[`${r},${c}`] : null);
    }
    if (row.some(val => val !== null && val !== undefined && String(val).trim() !== '')) {
      rawData.push(row);
    }
  }

  diag?.log(`[MATRIZ CONSTRUÍDA] ${rawData.length} linhas montadas.`);
  return rawData;
}

function parseHtmlTable(htmlText, diag) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    const rows = [];

    const trElements = doc.querySelectorAll('tr');
    diag?.log(`[HTML] ${trElements.length} tags <tr> encontradas no documento.`);

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

    diag?.log(`[HTML] ${rows.length} linhas não-vazias extraídas da tabela HTML.`);
    return rows;
  } catch (e) {
    diag?.log(`[ERRO HTML] Falha ao processar tabela HTML: ${e.message}`);
    return [];
  }
}

function parseXmlSpreadsheet(xmlText, diag) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const rows = [];

    const rowElements = doc.querySelectorAll('Row');
    diag?.log(`[XML] ${rowElements.length} elementos <Row> encontrados.`);

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

    diag?.log(`[XML] ${rows.length} linhas extraídas do XML.`);
    return rows;
  } catch (e) {
    diag?.log(`[ERRO XML] Falha ao processar XML: ${e.message}`);
    return [];
  }
}

function parseDelimitedText(text, diag) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  const sample = lines.slice(0, 5).join('\n');
  const countSemi = (sample.match(/;/g) || []).length;
  const countTab = (sample.match(/\t/g) || []).length;
  const countComma = (sample.match(/,/g) || []).length;

  let delimiter = ';';
  if (countTab > countSemi && countTab > countComma) delimiter = '\t';
  else if (countComma > countSemi && countComma > countTab) delimiter = ',';

  diag?.log(`[TEXTO] Delimitador detectado: '${delimiter === '\t' ? '\\t (Tab)' : delimiter}' em ${lines.length} linhas.`);

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

function getHexPreview(u8, length = 32) {
  const slice = u8.slice(0, Math.min(u8.length, length));
  const hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  const ascii = Array.from(slice).map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
  return { hex, ascii };
}

function identifyFileType(u8, textSample) {
  if (u8 && u8.length >= 4) {
    if (u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0) {
      return { type: 'BIFF8_XLS', name: 'Microsoft Excel 97-2003 (.xls binário / OLE2)' };
    }
    if (u8[0] === 0x50 && u8[1] === 0x4B) {
      return { type: 'ZIP_XLSX', name: 'Microsoft Excel OpenXML (.xlsx / ZIP)' };
    }
  }

  if (textSample) {
    const trimmed = textSample.trim();
    if (trimmed.includes('<table') || trimmed.includes('<TABLE') || trimmed.includes('<html') || trimmed.includes('<HTML') || trimmed.includes('<tr') || trimmed.includes('<TR')) {
      return { type: 'HTML_TABLE', name: 'Relatório formatado em Tabela HTML' };
    }
    if (trimmed.startsWith('<?xml') || trimmed.includes('<Workbook')) {
      return { type: 'XML_2003', name: 'Microsoft XML Spreadsheet 2003' };
    }
    if (trimmed.includes(';') || trimmed.includes('\t') || trimmed.includes(',')) {
      return { type: 'DELIMITED_TEXT', name: 'Texto Delimitado (CSV / TSV)' };
    }
  }

  return { type: 'UNKNOWN', name: 'Formato não identificado' };
}

/**
 * Transaction Anchor Algorithm:
 * Scans the raw matrix to find where data rows begin,
 * then accurately pinpoints the header row and maps all columns.
 */
export function processRawMatrix(data, diag) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    diag?.log(`[MATRIZ] Matriz de dados vazia ou nula.`);
    return { headers: [], rows: [], rawMatrix: [], samples: {}, headerRowIdx: 0 };
  }

  // Filter out completely empty rows
  const cleanData = data.filter(row => Array.isArray(row) && row.some(c => c !== null && c !== undefined && String(c).trim() !== ''));
  if (cleanData.length === 0) {
    diag?.log(`[MATRIZ] Nenhuma linha com conteúdo encontrada.`);
    return { headers: [], rows: [], rawMatrix: [], samples: {}, headerRowIdx: 0 };
  }

  let maxCols = 0;
  for (const row of cleanData) {
    if (row.length > maxCols) maxCols = row.length;
  }

  diag?.log(`[MATRIZ] ${cleanData.length} linhas válidas, largura máxima: ${maxCols} colunas.`);

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

  if (firstTransactionRowIdx !== -1) {
    diag?.log(`[ANCORA] Primeiro lançamento com data detectado na linha ${firstTransactionRowIdx + 1}: [${cleanData[firstTransactionRowIdx].filter(Boolean).slice(0, 4).join(' | ')}]`);
  } else {
    diag?.log(`[AVISO ANCORA] Nenhuma linha com data DD/MM/YYYY detectada nas colunas 0 ou 1.`);
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

  diag?.log(`[CABEÇALHO] Linha de cabeçalho selecionada: índice ${headerRowIdx + 1} (${cleanData[headerRowIdx]?.filter(Boolean).join(' | ')})`);

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

  diag?.log(`[COLUNAS] ${headers.length} colunas mapeadas: [${headers.join(', ')}]`);

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

  diag?.log(`[LINHAS] ${rows.length} linhas de dados prontas para conciliação.`);

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

  const logs = [];
  const diag = {
    log: (msg) => logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`)
  };

  diag.log(`Iniciando leitura do arquivo: "${file.name}" (${(file.size / 1024).toFixed(1)} KB, tipo: "${file.type || 'desconhecido'}")`);

  const arrayBuffer = await readFileAsArrayBuffer(file);
  const bytes = new Uint8Array(arrayBuffer);
  const hexInfo = getHexPreview(bytes, 32);
  const fileType = identifyFileType(bytes);

  diag.log(`[ASSINATURA] Hex: ${hexInfo.hex.substring(0, 48)}... | ASCII: ${hexInfo.ascii.substring(0, 16)}`);
  diag.log(`[TIPO DETECTADO] ${fileType.name} (${fileType.type})`);

  const isBinary = fileType.type === 'BIFF8_XLS' || fileType.type === 'ZIP_XLSX';

  // Strategy 1: Binary parsing for XLSX / XLS
  if (isBinary) {
    const readOptions = { codepage: 1252, cellStyles: false, sheetStubs: true };

    try {
      diag.log(`[SHEETJS] Tentando leitura binária com XLSX.read(bytes, { type: 'array', codepage: 1252 })...`);
      const workbook = XLSX.read(bytes, { type: 'array', ...readOptions });
      
      const sheetNamesList = workbook.SheetNames || [];
      const sheetKeysList = Object.keys(workbook.Sheets || {});
      const allNames = Array.from(new Set([...sheetNamesList, ...sheetKeysList]));

      diag.log(`[SHEETJS OK] SheetNames: [${sheetNamesList.join(', ')}], Sheets keys: [${sheetKeysList.join(', ')}]`);

      for (let i = 0; i < allNames.length; i++) {
        const name = allNames[i];
        let sheet = workbook.Sheets?.[name];
        if (!sheet && sheetNamesList[i]) sheet = workbook.Sheets?.[sheetNamesList[i]];
        if (!sheet && sheetKeysList[i]) sheet = workbook.Sheets?.[sheetKeysList[i]];
        if (!sheet && sheetKeysList.length > 0) sheet = workbook.Sheets?.[sheetKeysList[0]];

        if (sheet) {
          diag.log(`[SHEETJS] Processando aba "${name || 'Planilha'}"...`);
          const rawData = getSheetDataMatrix(sheet, diag);
          if (Array.isArray(rawData) && rawData.length > 0) {
            const processed = processRawMatrix(rawData, diag);
            if (processed.rawMatrix.length > 0) {
              sheets[name || `Aba_${i + 1}`] = processed;
            }
          }
        }
      }
    } catch (err) {
      diag.log(`[AVISO SHEETJS] Leitura como array falhou: ${err.message}. Tentando binary string...`);
    }

    // Binary string fallback
    if (Object.keys(sheets).length === 0) {
      try {
        const binStr = await readFileAsBinaryString(file);
        const workbook = XLSX.read(binStr, { type: 'binary', ...readOptions });
        
        const sheetNamesList = workbook.SheetNames || [];
        const sheetKeysList = Object.keys(workbook.Sheets || {});
        const allNames = Array.from(new Set([...sheetNamesList, ...sheetKeysList]));

        diag.log(`[SHEETJS BINARY OK] SheetNames: [${sheetNamesList.join(', ')}], Sheets keys: [${sheetKeysList.join(', ')}]`);

        for (let i = 0; i < allNames.length; i++) {
          const name = allNames[i];
          let sheet = workbook.Sheets?.[name];
          if (!sheet && sheetNamesList[i]) sheet = workbook.Sheets?.[sheetNamesList[i]];
          if (!sheet && sheetKeysList[i]) sheet = workbook.Sheets?.[sheetKeysList[i]];
          if (!sheet && sheetKeysList.length > 0) sheet = workbook.Sheets?.[sheetKeysList[0]];

          if (sheet) {
            const rawData = getSheetDataMatrix(sheet, diag);
            if (Array.isArray(rawData) && rawData.length > 0) {
              const processed = processRawMatrix(rawData, diag);
              if (processed.rawMatrix.length > 0) {
                sheets[name || `Aba_${i + 1}`] = processed;
              }
            }
          }
        }
      } catch (err) {
        diag.log(`[ERRO SHEETJS] Leitura binária string falhou: ${err.message}`);
      }
    }
  }

  // Strategy 2: Text parsing for HTML / XML / CSV ONLY if NOT a binary file
  if (!isBinary && Object.keys(sheets).length === 0) {
    diag.log(`[TEXTO] Arquivo não é binário. Lendo como texto (Windows-1252 / Latin1)...`);
    let text = await readAsTextWithEncoding(file, 'windows-1252');
    if (!text || text.length === 0) {
      text = await readAsTextWithEncoding(file, 'utf-8');
    }

    if (text && text.length > 0) {
      if (text.includes('<table') || text.includes('<TABLE') || text.includes('<html') || text.includes('<HTML') || text.includes('<tr') || text.includes('<TR')) {
        diag.log(`[FORMATO] Documento identificado como Tabela HTML.`);
        const htmlMatrix = parseHtmlTable(text, diag);
        if (htmlMatrix.length > 0) {
          sheets['Razão'] = processRawMatrix(htmlMatrix, diag);
          sheetNames = ['Razão'];
        }
      } else if (text.includes('<?xml') && text.includes('<Workbook')) {
        diag.log(`[FORMATO] Documento identificado como XML Spreadsheet 2003.`);
        const xmlMatrix = parseXmlSpreadsheet(text, diag);
        if (xmlMatrix.length > 0) {
          sheets['Razão'] = processRawMatrix(xmlMatrix, diag);
          sheetNames = ['Razão'];
        }
      } else {
        diag.log(`[FORMATO] Documento identificado como Texto Delimitado (CSV/TSV).`);
        const csvMatrix = parseDelimitedText(text, diag);
        if (csvMatrix.length > 0) {
          sheets['Razão'] = processRawMatrix(csvMatrix, diag);
          sheetNames = ['Razão'];
        }
      }
    }
  }

  diag.log(`[FINALIZADO] Total de abas prontas: ${Object.keys(sheets).length}`);

  return {
    sheets,
    sheetNames: Object.keys(sheets),
    diagnostics: {
      fileName: file.name,
      fileSize: file.size,
      fileType: fileType.name,
      hexPreview: hexInfo.hex,
      asciiPreview: hexInfo.ascii,
      logs
    }
  };
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
