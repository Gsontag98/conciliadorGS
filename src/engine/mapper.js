import { normalizeText } from './similarity';
import { parseDate, parseAmount } from './parser';

const FIELDS = [
  {
    key: 'date',
    label: 'Data',
    required: true,
    synonyms: ['DATA', 'DT', 'DATE', 'EMISSAO', 'LANCAMENTO', 'VENCTO', 'VENCIMENTO', 'DATA LANCAMENTO', 'DATA LANC', 'DT LCTO', 'DT LANC', 'DATA LOTE', 'DATA MOVIMENTO', 'DATA MOV', 'DT MOV']
  },
  {
    key: 'amount',
    label: 'Valor / Movimento',
    required: true,
    synonyms: ['VALOR', 'VLR', 'VALOR R$', 'VALOR BRUTO', 'AMOUNT', 'SALDO', 'MOVIMENTO', 'LIQUIDO', 'VALOR LIQUIDO', 'TOTAL', 'VALOR DOCUMENTO', 'VL TOTAL']
  },
  {
    key: 'debit',
    label: 'Débito',
    required: false,
    synonyms: ['DEBITO', 'DEB', 'VALOR DEBITO', 'VL DEBITO', 'SAIDA', 'DEBITO BAIXA R$', 'BAIXA', 'PAGAMENTO', 'VL DEB', 'VLR DEBITO']
  },
  {
    key: 'credit',
    label: 'Crédito',
    required: false,
    synonyms: ['CREDITO', 'CRED', 'VALOR CREDITO', 'VL CREDITO', 'ENTRADA', 'CREDITO SAIDA R$', 'EMISSAO', 'VL CRED', 'VLR CREDITO']
  },
  {
    key: 'description',
    label: 'Histórico / Descrição',
    required: true,
    synonyms: ['HISTORICO', 'HIST', 'DESCRICAO', 'COMPLEMENTO', 'FORNECEDOR', 'NOME', 'OBSERVACAO', 'DETALHES', 'MEMO', 'HISTORICO COMPLETO', 'HISTORICO DO LANCAMENTO']
  },
  {
    key: 'document',
    label: 'Documento / NF',
    required: false,
    synonyms: ['DOCUMENTO', 'DOC', 'NF', 'NUMERO', 'NR DOC', 'Nº', 'DUPLICATA', 'TITULO', 'SEU NUMERO', 'LOTE', 'NUMERO DOCUMENTO', 'NRO DOCUMENTO']
  }
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
  if (!mapping.amount && !mapping.debit && !mapping.credit) {
    const valHeaders = headers.filter(h => !usedHeaders.has(h) && (
      h.toUpperCase().includes('VALOR') ||
      h.toUpperCase().includes('CREDITO') ||
      h.toUpperCase().includes('DEBITO') ||
      h.toUpperCase().includes('VLR')
    ));
    if (valHeaders.length > 0) {
      mapping.amount = valHeaders[0];
      usedHeaders.add(valHeaders[0]);
    } else if (headers.length > 0) {
      mapping.amount = headers[headers.length - 1]; // Guess last column
      usedHeaders.add(mapping.amount);
    }
  }

  if (!mapping.date && headers.length > 0) {
    const dateHeaders = headers.filter(h => !usedHeaders.has(h) && (
      h.toUpperCase().includes('DATA') ||
      h.toUpperCase().includes('DT')
    ));
    if (dateHeaders.length > 0) {
      mapping.date = dateHeaders[0];
      usedHeaders.add(dateHeaders[0]);
    } else {
      mapping.date = headers[0]; // Guess first column
      usedHeaders.add(mapping.date);
    }
  }

  if (!mapping.description && headers.length > 1) {
    const descHeaders = headers.filter(h => !usedHeaders.has(h) && (
      h.toUpperCase().includes('HIST') ||
      h.toUpperCase().includes('DESC') ||
      h.toUpperCase().includes('COMPL') ||
      h.toUpperCase().includes('FORN') ||
      h.toUpperCase().includes('NOME')
    ));
    if (descHeaders.length > 0) {
      mapping.description = descHeaders[0];
      usedHeaders.add(descHeaders[0]);
    } else {
      mapping.description = headers[1]; // Guess second column
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
    if (mapping.date && row[mapping.date] !== undefined && row[mapping.date] !== null) {
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

    // Extract amount:
    // For bank: payments are Créditos (saídas) or Valor
    // For supplier: payments are Débitos (baixas) or Valor
    let amount = 0;

    if (sourceName === 'banco') {
      if (mapping.credit && row[mapping.credit] !== undefined && parseAmount(row[mapping.credit]) > 0) {
        amount = parseAmount(row[mapping.credit]);
      } else if (mapping.amount && row[mapping.amount] !== undefined && parseAmount(row[mapping.amount]) > 0) {
        amount = parseAmount(row[mapping.amount]);
      } else if (mapping.debit && row[mapping.debit] !== undefined && parseAmount(row[mapping.debit]) > 0) {
        amount = parseAmount(row[mapping.debit]);
      }
    } else {
      // For supplier: prefer debit (baixas de obrigações/pagamentos)
      if (mapping.debit && row[mapping.debit] !== undefined && parseAmount(row[mapping.debit]) > 0) {
        amount = parseAmount(row[mapping.debit]);
      } else if (mapping.amount && row[mapping.amount] !== undefined && parseAmount(row[mapping.amount]) > 0) {
        amount = parseAmount(row[mapping.amount]);
      } else if (mapping.credit && row[mapping.credit] !== undefined && parseAmount(row[mapping.credit]) > 0) {
        amount = parseAmount(row[mapping.credit]);
      }
    }

    // Fallback scan for amount
    if (amount === 0) {
      for (const cell of rawArray) {
        if (cell === null || cell === undefined || cell === '') continue;
        if (typeof cell === 'number') {
          if (cell < 1900 || cell > 2100) { // skip year numbers
            const parsed = parseAmount(cell);
            if (parsed > 0) {
              amount = parsed;
              break;
            }
          }
        } else if (typeof cell === 'string') {
          const parsed = parseAmount(cell);
          if (parsed > 0 && !cell.match(/^\d{4}-\d{2}-\d{2}$/) && !cell.match(/^(\d{1,2})[\/\-\.](\d{1,2})/)) {
            amount = parsed;
            break;
          }
        }
      }
    }

    // Extract description
    let description = '';
    if (mapping.description && row[mapping.description] !== undefined && row[mapping.description] !== null) {
      description = String(row[mapping.description]).trim();
    } else {
      let longestStr = '';
      for (const cell of rawArray) {
        if (typeof cell === 'string' && cell.trim().length > longestStr.length && isNaN(parseFloat(cell)) && !parseDate(cell)) {
          longestStr = cell.trim();
        }
      }
      description = longestStr;
    }

    // Extract document
    let document = '';
    if (mapping.document && row[mapping.document] !== undefined && row[mapping.document] !== null) {
      document = String(row[mapping.document]).trim();
    }

    amount = Math.abs(amount);

    if (dateStr && amount > 0) {
      normalized.push({
        id: `${sourceName}_${idx + 1}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
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
