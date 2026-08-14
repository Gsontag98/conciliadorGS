/**
 * MAPPER ENGINE
 * Intelligent auto-detection of column mapping for Domínio Razão and Bank/Supplier Statements.
 */

const ColumnMapper = (function () {

  /**
   * Column field definitions
   */
  const FIELDS = [
    { key: 'date', label: 'Data', required: true, synonyms: ['DATA', 'DT', 'DATE', 'EMISSAO', 'LANCAMENTO', 'VENCTO', 'VENCIMENTO'] },
    { key: 'amount', label: 'Valor', required: true, synonyms: ['VALOR', 'VLR', 'VALOR (R$)', 'AMOUNT', 'SALDO', 'MOVIMENTO', 'LIQUIDO'] },
    { key: 'description', label: 'Histórico / Descrição', required: true, synonyms: ['HISTORICO', 'DESCRICAO', 'COMPLEMENTO', 'FORNECEDOR', 'NOME', 'OBSERVACAO', 'DETALHES', 'MEMO'] },
    { key: 'document', label: 'Documento / NF (Opcional)', required: false, synonyms: ['DOCUMENTO', 'DOC', 'NF', 'NUMERO', 'Nº', 'DUPLICATA', 'TITULO', 'SEU NUMERO'] },
    { key: 'debit', label: 'Débito (Opcional)', required: false, synonyms: ['DEBITO', 'DEB', 'VALOR DEBITO', 'SAIDA'] },
    { key: 'credit', label: 'Crédito (Opcional)', required: false, synonyms: ['CREDITO', 'CRED', 'VALOR CREDITO', 'ENTRADA'] }
  ];

  /**
   * Auto-detect column mapping given an array of header string titles
   */
  function autoDetect(headers) {
    const mapping = {};
    const usedHeaders = new Set();

    FIELDS.forEach(field => {
      let matchedHeader = null;

      // 1. Try exact or strong synonym match
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

    return mapping;
  }

  /**
   * Normalizes dataset items using mapped column rules into a clean standard object schema:
   * { id, date, amount, description, document, originalRow, source }
   */
  function normalizeData(rows, mapping, sourceName) {
    if (!rows || !Array.isArray(rows)) return [];

    return rows.map((row, idx) => {
      // Date extraction
      const rawDate = row[mapping.date];
      const parsedDate = ExcelParser.parseDate(rawDate);

      // Amount extraction
      let parsedAmount = 0.0;
      if (mapping.debit && mapping.credit && (row[mapping.debit] || row[mapping.credit])) {
        const deb = Math.abs(ExcelParser.parseAmount(row[mapping.debit]));
        const cred = Math.abs(ExcelParser.parseAmount(row[mapping.credit]));
        parsedAmount = cred - deb; // Net amount (or positive magnitude)
      } else {
        parsedAmount = ExcelParser.parseAmount(row[mapping.amount]);
      }

      // Description & Document extraction
      const description = String(row[mapping.description] || '').trim();
      const document = mapping.document ? String(row[mapping.document] || '').trim() : '';

      return {
        id: `${sourceName}_${idx + 1}_${Date.now()}`,
        index: idx + 1,
        date: parsedDate,
        rawDate: rawDate,
        amount: Math.abs(parsedAmount), // Use positive absolute magnitude for matching
        signedAmount: parsedAmount,
        description: description,
        document: document,
        source: sourceName,
        originalRow: row
      };
    }).filter(item => item.date && item.amount > 0); // Ignore empty or zero amount header leftovers
  }

  return {
    FIELDS,
    autoDetect,
    normalizeData
  };

})();
