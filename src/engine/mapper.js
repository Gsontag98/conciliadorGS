import { normalizeText } from './similarity';
import { parseDate, parseAmount } from './parser';

const FIELDS = [
  { key: 'date', label: 'Data', required: true, synonyms: ['DATA', 'DT', 'DATE', 'EMISSAO', 'LANCAMENTO', 'VENCTO', 'VENCIMENTO', 'DATA LANÇAMENTO', 'DATA LANC', 'DT. LÇTO', 'DT. LANC', 'DATA LOTE', 'DATA MOVIMENTO', 'DATA MOV'] },
  { key: 'amount', label: 'Valor / Movimento', required: true, synonyms: ['VALOR', 'VLR', 'VALOR (R$)', 'AMOUNT', 'SALDO', 'MOVIMENTO', 'LIQUIDO', 'VALOR R$', 'VALOR DEBITO', 'VALOR CREDITO', 'DEBITO', 'CREDITO', 'SAIDA', 'ENTRADA', 'BAIXA', 'PAGAMENTO'] },
  { key: 'description', label: 'Histórico / Descrição', required: true, synonyms: ['HISTORICO', 'DESCRICAO', 'COMPLEMENTO', 'FORNECEDOR', 'NOME', 'OBSERVACAO', 'DETALHES', 'MEMO'] },
  { key: 'document', label: 'Documento / NF', required: false, synonyms: ['DOCUMENTO', 'DOC', 'NF', 'NUMERO', 'Nº', 'DUPLICATA', 'TITULO', 'SEU NUMERO', 'LOTE'] },
  { key: 'debit', label: 'Débito', required: false, synonyms: ['DEBITO', 'DEB', 'VALOR DEBITO', 'SAIDA', 'DEBITO (BAIXA R$)'] },
  { key: 'credit', label: 'Crédito', required: false, synonyms: ['CREDITO', 'CRED', 'VALOR CREDITO', 'ENTRADA', 'CREDITO (SAIDA R$)'] }
];

export { FIELDS };

export function autoDetect(headers) {
  const mapping = {};
  const usedHeaders = new Set();

  for (const field of FIELDS) {
    let bestMatch = null;
    let highestScore = 0;

    for (const header of headers) {
      if (usedHeaders.has(header)) continue;
      
      const normHeader = normalizeText(header);
      
      for (const syn of field.synonyms) {
        const normSyn = normalizeText(syn);
        if (normHeader === normSyn) {
          bestMatch = header;
          highestScore = 1;
          break;
        } else if (normHeader.includes(normSyn) || normSyn.includes(normHeader)) {
          if (highestScore < 0.8) {
            bestMatch = header;
            highestScore = 0.8;
          }
        }
      }
      if (highestScore === 1) break;
    }

    if (bestMatch) {
      mapping[field.key] = bestMatch;
      usedHeaders.add(bestMatch);
    }
  }

  // Fallbacks
  if (!mapping.amount) {
    const valHeaders = headers.filter(h => !usedHeaders.has(h) && (h.toUpperCase().includes('VALOR') || h.toUpperCase().includes('CREDITO') || h.toUpperCase().includes('DEBITO')));
    if (valHeaders.length > 0) {
      mapping.amount = valHeaders[0];
      usedHeaders.add(valHeaders[0]);
    } else if (headers.length > 0) {
      mapping.amount = headers[headers.length - 1]; // Guess last col
      usedHeaders.add(mapping.amount);
    }
  }

  if (!mapping.date && headers.length > 0) {
    const dateHeaders = headers.filter(h => !usedHeaders.has(h) && (h.toUpperCase().includes('DATA') || h.toUpperCase().includes('DT')));
    if (dateHeaders.length > 0) {
      mapping.date = dateHeaders[0];
      usedHeaders.add(dateHeaders[0]);
    } else {
      mapping.date = headers[0]; // Guess first col
      usedHeaders.add(mapping.date);
    }
  }

  if (!mapping.description && headers.length > 1) {
    const descHeaders = headers.filter(h => !usedHeaders.has(h) && (h.toUpperCase().includes('HIST') || h.toUpperCase().includes('DESC') || h.toUpperCase().includes('COMPL') || h.toUpperCase().includes('FORN')));
    if (descHeaders.length > 0) {
      mapping.description = descHeaders[0];
      usedHeaders.add(descHeaders[0]);
    } else {
      mapping.description = headers[1]; // Guess second col
      usedHeaders.add(mapping.description);
    }
  }

  return mapping;
}

export function normalizeData(rows, mapping, sourceName) {
  const normalized = [];

  rows.forEach((row, idx) => {
    const rawArray = row.__rawArray || Object.values(row);
    
    // Extract date
    let dateStr = null;
    if (mapping.date && row[mapping.date] !== undefined) {
      dateStr = parseDate(row[mapping.date]);
    }
    if (!dateStr) {
      for (const cell of rawArray) {
        const parsed = parseDate(cell);
        if (parsed) {
          dateStr = parsed;
          break;
        }
      }
    }

    // Extract amount
    let amount = 0;
    if (mapping.amount && row[mapping.amount] !== undefined) {
      amount = parseAmount(row[mapping.amount]);
    } else if (mapping.credit && row[mapping.credit] !== undefined && parseAmount(row[mapping.credit]) !== 0) {
      amount = parseAmount(row[mapping.credit]);
    } else if (mapping.debit && row[mapping.debit] !== undefined && parseAmount(row[mapping.debit]) !== 0) {
      amount = parseAmount(row[mapping.debit]);
    } else {
      // scan
      for (const cell of rawArray) {
        if (typeof cell === 'number') {
          // crude check to avoid years
          if (cell < 1900 || cell > 2100) {
            amount = parseAmount(cell);
            if (amount !== 0) break;
          }
        } else if (typeof cell === 'string') {
          const parsed = parseAmount(cell);
          if (parsed !== 0 && !cell.match(/^\d{4}-\d{2}-\d{2}$/)) {
            amount = parsed;
            break;
          }
        }
      }
    }

    // Extract description
    let description = '';
    if (mapping.description && row[mapping.description] !== undefined) {
      description = String(row[mapping.description]).trim();
    } else {
      let longestStr = '';
      for (const cell of rawArray) {
        if (typeof cell === 'string' && cell.length > longestStr.length && isNaN(parseFloat(cell))) {
          longestStr = cell.trim();
        }
      }
      description = longestStr;
    }

    // Extract document
    let document = '';
    if (mapping.document && row[mapping.document] !== undefined) {
      document = String(row[mapping.document]).trim();
    }

    amount = Math.abs(amount); // Keep amounts positive for reconciliation

    if (dateStr && amount > 0) {
      normalized.push({
        id: `${sourceName}_${idx + 1}_${Date.now()}`,
        date: dateStr,
        amount: amount,
        description: description,
        document: document,
        originalRow: row,
        source: sourceName
      });
    }
  });

  return normalized;
}
