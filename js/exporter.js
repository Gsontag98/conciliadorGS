/**
 * EXPORTER ENGINE
 * Generates structured, multi-sheet formatted Excel reports using SheetJS (XLSX).
 */

const ExcelExporter = (function () {

  /**
   * Export reconciliation results to XLSX file
   */
  function exportReport(reconciliationResult, options = {}) {
    if (!reconciliationResult || typeof XLSX === 'undefined') {
      alert('Nenhum resultado de conciliação disponível ou SheetJS não carregado.');
      return;
    }

    const wb = XLSX.utils.book_new();
    const dateStr = new Date().toISOString().split('T')[0];

    // =========================================================================
    // SHEET 1: RESUMO EXECUTIVO
    // =========================================================================
    const summaryData = [
      ['RELATÓRIO DE CONCILIAÇÃO - BANCO / FORNECEDOR × RAZÃO DOMÍNIO'],
      ['Data de Geração:', new Date().toLocaleString('pt-BR')],
      [],
      ['Métrica', 'Quantidade', 'Percentual / Valor'],
      ['Total de Lançamentos do Razão', reconciliationResult.totalLedgerCount, '100%'],
      ['Total de Lançamentos do Banco', reconciliationResult.totalBankCount, '100%'],
      ['Lançamentos Conciliados', reconciliationResult.matches.reduce((acc, m) => acc + m.ledgerItems.length, 0), `${reconciliationResult.reconciledRate}%`],
      ['Sugestões Pendentes de Revisão', reconciliationResult.suggestions.length, '—'],
      ['Ausentes no Banco (Pendente Lançamento Banco)', reconciliationResult.missingInBank.length, `R$ ${reconciliationResult.missingInBank.reduce((a,b)=>a+b.amount,0).toFixed(2)}`],
      ['Ausentes no Razão (Pendente Lançamento Domínio)', reconciliationResult.missingInLedger.length, `R$ ${reconciliationResult.missingInLedger.reduce((a,b)=>a+b.amount,0).toFixed(2)}`],
      [],
      ['DETALHAMENTO POR PASSE DE CONCILIAÇÃO INTELIGENTE'],
      ['Passe', 'Nível de Confiança', 'Matches Encontrados'],
      ['Passe 1 — Match Exato (Valor + Data + Doc)', '100%', reconciliationResult.matches.filter(m=>m.pass===1).length],
      ['Passe 2 — Valor + Janela de Data', '95%', reconciliationResult.matches.filter(m=>m.pass===2).length],
      ['Passe 3 — Valor + Similaridade Textual', '85%', reconciliationResult.matches.filter(m=>m.pass===3).length],
      ['Passe 4 — Soma Combinatória N:1', '80%', reconciliationResult.matches.filter(m=>m.pass===4).length],
      ['Passe 5 — Match Fuzzy Completo', '70%', reconciliationResult.matches.filter(m=>m.pass===5).length],
      ['Passe 6 — Sugestões / Aceites Manuais', 'Manual', reconciliationResult.matches.filter(m=>m.pass===6).length],
      ['Passe 7 — IA Gemini Semântica', '70-100%', reconciliationResult.matches.filter(m=>m.pass===7).length]
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo Executivo');

    // =========================================================================
    // SHEET 2: CONCILIADOS
    // =========================================================================
    const reconciledRows = [
      ['Confiança (%)', 'Regra de Match', 'Data Razão', 'Histórico Razão', 'Data Banco', 'Histórico Banco', 'Valor (R$)', 'Tipo Match', 'Observações']
    ];

    reconciliationResult.matches.forEach(m => {
      const leg = m.ledgerItems[0];
      const bnk = m.bankItems[0];
      reconciledRows.push([
        `${m.confidence}%`,
        m.passName,
        leg.date,
        leg.description,
        bnk.date,
        bnk.description,
        leg.amount,
        m.type,
        m.notes
      ]);

      // If multi-item match (N:1), add nested sub-items
      if (m.ledgerItems.length > 1) {
        for (let i = 1; i < m.ledgerItems.length; i++) {
          const item = m.ledgerItems[i];
          reconciledRows.push(['', '  └ Item Agrupado Razão', item.date, item.description, '—', '—', item.amount, 'N:1 Sub-item', '']);
        }
      }
      if (m.bankItems.length > 1) {
        for (let i = 1; i < m.bankItems.length; i++) {
          const item = m.bankItems[i];
          reconciledRows.push(['', '  └ Item Agrupado Banco', '—', '—', item.date, item.description, item.amount, '1:N Sub-item', '']);
        }
      }
    });

    const wsReconciled = XLSX.utils.aoa_to_sheet(reconciledRows);
    XLSX.utils.book_append_sheet(wb, wsReconciled, 'Conciliados');

    // =========================================================================
    // SHEET 3: SUGESTÕES PENDENTES
    // =========================================================================
    const suggestionRows = [
      ['Score Probabilidade (%)', 'Data Razão', 'Histórico Razão', 'Valor Razão (R$)', 'Data Banco Sugerida', 'Histórico Banco Sugerido', 'Valor Banco Sugerido (R$)']
    ];

    reconciliationResult.suggestions.forEach(s => {
      const leg = s.ledgerItem;
      const topCand = s.candidates[0];
      suggestionRows.push([
        `${topCand.score}%`,
        leg.date,
        leg.description,
        leg.amount,
        topCand.bankItem.date,
        topCand.bankItem.description,
        topCand.bankItem.amount
      ]);
    });

    const wsSuggestions = XLSX.utils.aoa_to_sheet(suggestionRows);
    XLSX.utils.book_append_sheet(wb, wsSuggestions, 'Sugestões Pendentes');

    // =========================================================================
    // SHEET 4: AUSENTES NO BANCO
    // =========================================================================
    const missingBankRows = [
      ['Data Razão', 'Documento/NF', 'Histórico Domínio Razão', 'Valor (R$)']
    ];

    reconciliationResult.missingInBank.forEach(item => {
      missingBankRows.push([
        item.date,
        item.document || '—',
        item.description,
        item.amount
      ]);
    });

    const wsMissingBank = XLSX.utils.aoa_to_sheet(missingBankRows);
    XLSX.utils.book_append_sheet(wb, wsMissingBank, 'Ausentes no Banco');

    // =========================================================================
    // SHEET 5: AUSENTES NO RAZÃO
    // =========================================================================
    const missingLedgerRows = [
      ['Data Banco', 'Documento/Doc', 'Histórico Extrato Banco', 'Valor (R$)']
    ];

    reconciliationResult.missingInLedger.forEach(item => {
      missingLedgerRows.push([
        item.date,
        item.document || '—',
        item.description,
        item.amount
      ]);
    });

    const wsMissingLedger = XLSX.utils.aoa_to_sheet(missingLedgerRows);
    XLSX.utils.book_append_sheet(wb, wsMissingLedger, 'Ausentes no Razão');

    // Export file
    const fileName = `conciliacao_dominio_banco_${dateStr}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  return {
    exportReport
  };

})();
