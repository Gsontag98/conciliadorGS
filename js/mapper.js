/**
 * MAPPER ENGINE
 * Intelligent auto-detection of column mapping for Domínio Razão and Bank/Supplier Statements.
 */

const ColumnMapper = (function () {

  /**
   * Column field definitions with expanded synonyms for Domínio Accounting System
   */
  const FIELDS = [
    { key: 'date', label: 'Data', required: true, synonyms: ['DATA', 'DT', 'DATE', 'EMISSAO', 'LANCAMENTO', 'VENCTO', 'VENCIMENTO', 'DATA LANÇAMENTO', 'DATA LANC', 'DT. LÇTO', 'DT. LANC', 'DATA LOTE', 'DATA MOVIMENTO', 'DATA MOV'] },
    { key: 'amount', label: 'Valor / Movimento', required: true, synonyms: ['VALOR', 'VLR', 'VALOR (R$)', 'AMOUNT', 'SALDO', 'MOVIMENTO', 'LIQUIDO', 'VALOR R$', 'VALOR DEBITO', 'VALOR CREDITO', 'DEBITO', 'CREDITO', 'SAIDA', 'ENTRADA', 'BAIXA', 'PAGAMENTO'] },
    { key: 'description', label: 'Histórico / Descrição', required: true, synonyms: ['HISTORICO', 'DESCRICAO', 'COMPLEMENTO', 'FORNECEDOR', 'NOME', 'OBSERVACAO', 'DETALHES', 'MEMO', 'HISTÓRICO LANÇAMENTO DOMÍNIO', 'HISTÓRICO RAZÃO FORNECEDOR', 'DESCRIÇÃO EXTRATO'] },
    { key: 'document', label: 'Documento / NF (Opcional)', required: false, synonyms: ['DOCUMENTO', 'DOC', 'NF', 'NUMERO', 'Nº', 'DUPLICATA', 'TITULO', 'SEU NUMERO', 'LOTE'] },
    { key: 'debit', label: 'Débito (Opcional)', required: false, synonyms: ['DEBITO', 'DEB', 'VALOR DEBITO', 'SAIDA', 'DEBITO (BAIXA R$)'] },
    { key: 'credit', label: 'Crédito (Opcional)', required: false, synonyms: ['CREDITO', 'CRED', 'VALOR CREDITO', 'ENTRADA', 'CREDITO (SAIDA R$)'] }
  ];

  /**
   * Auto-detect column mapping given an array of header string titles
   */
  function autoDetect(headers) {
    const mapping = {};
    const usedHeaders = new Set();

    FIELDS.forEach(field => {
      let matchedHeader = null;

      for (const h of headers) {
        if (usedHeaders.has(h)) continue;
        const normH = Similarity.normalizeText(h).replace(/\s+/g, '');

        const isMatch = field.synonyms.some(syn => {
          const normSyn = Similarity.normalizeText(syn).replace(/\s+/g, '');
          return normH === normSyn || normH.includes(normSyn) || normSyn.includes(normH);
        });

        if (isMatch) {
          matchedHeader = h;
          break;
        }
      }

      if (matchedHeader) {
        mapping[field.key] = matchedHeader;
        usedHeaders.add(matchedHeader);
      } else {
        mapping[field.key] = '';
      }
    });

    // Fallback: If amount is empty, pick the first header containing 'VALOR', 'CREDITO', 'DEBITO', 'SAIDA', 'BAIXA', or containing numbers in rows
    if (!mapping.amount) {
      const amountHeader = headers.find(h => {
        const u = h.toUpperCase();
        return u.includes('VALOR') || u.includes('CRÉDITO') || u.includes('CREDITO') || u.includes('DÉBITO') || u.includes('DEBITO') || u.includes('SAÍDA') || u.includes('BAIXA');
      });
      if (amountHeader) mapping.amount = amountHeader;
      else if (headers.length >= 3) mapping.amount = headers[headers.length - 1]; // Pick last column by default
    }

    // Fallback: If date is empty, pick first header containing 'DATA' or 'DT'
    if (!mapping.date) {
      const dateHeader = headers.find(h => {
        const u = h.toUpperCase();
        return u.includes('DATA') || u.includes('DT');
      });
      if (dateHeader) mapping.date = dateHeader;
      else if (headers.length > 0) mapping.date = headers[0]; // Pick first column by default
    }

    // Fallback: If description is empty, pick first text column
    if (!mapping.description) {
      const descHeader = headers.find(h => {
        const u = h.toUpperCase();
        return u.includes('HIST') || u.includes('DESC') || u.includes('COMPL') || u.includes('FORN') || u.includes('NOME');
      });
      if (descHeader) mapping.description = descHeader;
      else if (headers.length >= 2) mapping.description = headers[1];
    }

    return mapping;
  }

  /**
   * Normalizes dataset items using mapped column rules into a clean standard object schema:
   * { id, date, amount, description, document, originalRow, source }
   */
  function normalizeData(rows, mapping, sourceName) {
    if (!rows || !Array.isArray(rows)) return [];

    return rows.map((row, idx) => {
      // 1. Date extraction (with row fallback scan if primary mapped date is empty)
      let rawDate = mapping.date ? row[mapping.date] : null;
      let parsedDate = ExcelParser.parseDate(rawDate);

      if (!parsedDate) {
        // Fallback: scan all cells in row for a valid date
        for (const k in row) {
          const tryDate = ExcelParser.parseDate(row[k]);
          if (tryDate) {
            parsedDate = tryDate;
            rawDate = row[k];
            break;
          }
        }
      }

      // 2. Amount extraction (Bulletproof fallback across amount, debit, and credit)
      let parsedAmount = 0.0;

      if (mapping.amount && row[mapping.amount] !== undefined && row[mapping.amount] !== '') {
        parsedAmount = Math.abs(ExcelParser.parseAmount(row[mapping.amount]));
      }

      if (parsedAmount === 0 && mapping.debit && row[mapping.debit] !== undefined && row[mapping.debit] !== '') {
        parsedAmount = Math.abs(ExcelParser.parseAmount(row[mapping.debit]));
      }

      if (parsedAmount === 0 && mapping.credit && row[mapping.credit] !== undefined && row[mapping.credit] !== '') {
        parsedAmount = Math.abs(ExcelParser.parseAmount(row[mapping.credit]));
      }

      // If still 0, scan row for any positive numeric cell
      if (parsedAmount === 0) {
        for (const k in row) {
          const val = row[k];
          if (val !== null && val !== undefined && val !== '') {
            const num = Math.abs(ExcelParser.parseAmount(val));
            // Ensure it's not a date, account code (like 210101), or year (2026)
            if (num > 0 && num < 100000000 && !String(val).includes('/') && !String(val).includes('-') && num !== 2026 && num !== 2025 && num !== 2024) {
              parsedAmount = num;
              break;
            }
          }
        }
      }

      // 3. Description & Document extraction
      let description = mapping.description ? String(row[mapping.description] || '').trim() : '';
      if (!description) {
        // Fallback: find longest text string in row
        let maxLen = 0;
        for (const k in row) {
          const str = String(row[k] || '').trim();
          if (str.length > maxLen && !ExcelParser.parseDate(str) && isNaN(parseFloat(str))) {
            maxLen = str.length;
            description = str;
          }
        }
      }

      const document = mapping.document ? String(row[mapping.document] || '').trim() : '';

      return {
        id: `${sourceName}_${idx + 1}_${Date.now()}`,
        index: idx + 1,
        date: parsedDate,
        rawDate: rawDate,
        amount: Math.abs(parsedAmount),
        signedAmount: parsedAmount,
        description: description || `Lançamento ${idx + 1}`,
        document: document,
        source: sourceName,
        originalRow: row
      };
    }).filter(item => item.date && item.amount > 0); // Remove empty or subheader lines
  }

  return {
    FIELDS,
    autoDetect,
    normalizeData
  };

})();
