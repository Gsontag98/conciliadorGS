import { normalizeText, extractCnpj, extractDocNumbers } from './similarity.js';
import { parseDate, parseAmount } from './parser.js';

const FIELDS = [
  {
    key: 'date',
    label: 'Data',
    required: true,
    synonyms: ['DATA', 'DT', 'DATE', 'EMISSAO', 'LANCAMENTO', 'VENCTO', 'VENCIMENTO', 'DATA LANCAMENTO', 'DATA LANC', 'DT LCTO', 'DT LANC', 'DATA LOTE', 'DATA MOVIMENTO', 'DATA MOV', 'DT MOV']
  },
  {
    key: 'lote',
    label: 'Lote',
    required: false,
    synonyms: ['LOTE', 'NR LOTE', 'NUMERO LOTE', 'N LOTE']
  },
  {
    key: 'description',
    label: 'Histórico / Descrição',
    required: true,
    synonyms: ['HISTORICO', 'HIST', 'DESCRICAO', 'COMPLEMENTO', 'FORNECEDOR', 'NOME', 'OBSERVACAO', 'DETALHES', 'MEMO', 'HISTORICO COMPLETO', 'HISTORICO DO LANCAMENTO']
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
    key: 'amount',
    label: 'Valor / Movimento',
    required: false,
    synonyms: ['VALOR', 'VLR', 'VALOR R$', 'VALOR BRUTO', 'AMOUNT', 'MOVIMENTO', 'LIQUIDO', 'VALOR LIQUIDO', 'TOTAL', 'VALOR DOCUMENTO', 'VL TOTAL']
  },
  {
    key: 'document',
    label: 'Documento / NF',
    required: false,
    synonyms: ['DOCUMENTO', 'DOC', 'NF', 'NUMERO', 'NR DOC', 'Nº', 'DUPLICATA', 'TITULO', 'SEU NUMERO', 'NUMERO DOCUMENTO', 'NRO DOCUMENTO']
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
        } else if (normHeader.startsWith(normSyn) || normSyn.startsWith(normHeader)) {
          if (highestScore < 0.9) {
            bestMatch = header;
            highestScore = 0.9;
          }
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

  // Fallback for Domínio:
  // If headers contains "Data", "Histórico", "Débito", "Crédito"
  if (!mapping.date && headers.length > 0) {
    const dHeader = headers.find(h => h.toUpperCase().includes('DATA') || h.toUpperCase().includes('DT'));
    if (dHeader) mapping.date = dHeader;
    else mapping.date = headers[0];
  }

  if (!mapping.description && headers.length > 2) {
    const hHeader = headers.find(h => h.toUpperCase().includes('HIST'));
    if (hHeader) mapping.description = hHeader;
    else mapping.description = headers[2]; // Column C in Domínio
  }

  if (!mapping.debit) {
    const debHeader = headers.find(h => h.toUpperCase().includes('DEB'));
    if (debHeader) mapping.debit = debHeader;
  }

  if (!mapping.credit) {
    const credHeader = headers.find(h => h.toUpperCase().includes('CRED'));
    if (credHeader) mapping.credit = credHeader;
  }

  return mapping;
}

export function normalizeData(rows, mapping, sourceName) {
  const normalized = [];

  rows.forEach((row, idx) => {
    // 1. Date extraction - check mapping.date first
    let dateStr = null;
    if (mapping.date && row[mapping.date] !== undefined && row[mapping.date] !== null) {
      dateStr = parseDate(row[mapping.date]);
    }

    // If Column A / mapping.date has no valid date, this is a subheader/title/footer row -> SKIP!
    if (!dateStr) {
      return;
    }

    // 2. Description extraction
    let description = '';
    if (mapping.description && row[mapping.description] !== undefined && row[mapping.description] !== null) {
      description = String(row[mapping.description]).trim();
    } else if (row['Histórico'] !== undefined) {
      description = String(row['Histórico']).trim();
    }

    // Skip "SALDO ANTERIOR" or summary descriptions if they slipped through
    const normDesc = normalizeText(description);
    if (normDesc.startsWith('SALDO ANTERIOR') || normDesc.startsWith('TOTAL GERAL') || normDesc.startsWith('TOTAL DO DIA')) {
      return;
    }

    // 3. Amount extraction:
    // In Conta Banco (sourceName === 'banco'):
    //   - Crédito = Outflow payments to suppliers
    //   - Débito = Inflow deposits/receipts
    // In Conta Fornecedor (sourceName === 'fornecedor'):
    //   - Débito = Payments made (settlements)
    //   - Crédito = Invoices entered
    let amount = 0;
    let movementType = '';

    const debVal = mapping.debit && row[mapping.debit] !== undefined ? parseAmount(row[mapping.debit]) : (row['Débito'] !== undefined ? parseAmount(row['Débito']) : 0);
    const credVal = mapping.credit && row[mapping.credit] !== undefined ? parseAmount(row[mapping.credit]) : (row['Crédito'] !== undefined ? parseAmount(row['Crédito']) : 0);
    const amtVal = mapping.amount && row[mapping.amount] !== undefined ? parseAmount(row[mapping.amount]) : 0;

    if (sourceName === 'banco') {
      // In bank, we prioritize Crédito (payments), but support Débito if Crédito is 0
      if (credVal > 0) {
        amount = credVal;
        movementType = 'CREDITO';
      } else if (amtVal > 0) {
        amount = amtVal;
        movementType = 'VALOR';
      } else if (debVal > 0) {
        amount = debVal;
        movementType = 'DEBITO';
      }
    } else {
      // In supplier, we prioritize Débito (payments/settlements), but support Crédito if Débito is 0
      if (debVal > 0) {
        amount = debVal;
        movementType = 'DEBITO';
      } else if (amtVal > 0) {
        amount = amtVal;
        movementType = 'VALOR';
      } else if (credVal > 0) {
        amount = credVal;
        movementType = 'CREDITO';
      }
    }

    if (amount <= 0) {
      return;
    }

    // 4. Document / Lote / CNPJ extraction
    let document = '';
    if (mapping.document && row[mapping.document] !== undefined && row[mapping.document] !== null) {
      document = String(row[mapping.document]).trim();
    } else if (mapping.lote && row[mapping.lote] !== undefined && row[mapping.lote] !== null) {
      document = String(row[mapping.lote]).trim();
    } else if (row['Lote'] !== undefined && row['Lote'] !== null) {
      document = String(row['Lote']).trim();
    }

    // Extract explicit document numbers from description (e.g. DOCUMENTO 9559)
    const docNumbers = extractDocNumbers(description);
    const explicitDoc = docNumbers.length > 0 ? docNumbers[0] : document;

    // Extract CNPJ from description
    const cnpj = extractCnpj(description);

    normalized.push({
      id: `${sourceName}_${idx + 1}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      date: dateStr,
      amount: amount,
      movementType,
      description: description,
      document: explicitDoc,
      lote: document,
      cnpj: cnpj,
      originalRow: row,
      source: sourceName
    });
  });

  return normalized;
}
