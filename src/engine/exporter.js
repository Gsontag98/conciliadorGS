import * as XLSX from 'xlsx';

export function exportReport(reconciliationResult) {
  const { matches, suggestions, missingInBank, missingInSupplier, totalBankCount, totalSupplierCount, reconciledRate } = reconciliationResult;

  const wb = XLSX.utils.book_new();

  // 1. Resumo Executivo
  const resumoData = [
    ['Resumo Executivo da Conciliação'],
    [],
    ['Métrica', 'Valor'],
    ['Total de Lançamentos - Banco', totalBankCount],
    ['Total de Lançamentos - Fornecedor', totalSupplierCount],
    ['Lançamentos Conciliados', `${matches.length} matches`],
    ['Taxa de Conciliação (%)', reconciledRate.toFixed(2) + '%'],
    ['Pendentes - Banco', missingInSupplier.length],
    ['Pendentes - Fornecedor', missingInBank.length],
    [],
    ['Detalhamento por Passos']
  ];
  
  const passCounts = {};
  matches.forEach(m => {
    passCounts[m.passName] = (passCounts[m.passName] || 0) + 1;
  });
  
  for (const [pass, count] of Object.entries(passCounts)) {
    resumoData.push([pass, count]);
  }

  const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo Executivo');

  // 2. Conciliados
  const conciliadosData = [
    ['Confiança', 'Passo', 'Data Banco', 'Desc Banco', 'Valor Banco', 'Data Forn', 'Desc Forn', 'Valor Forn', 'Nota/Justificativa']
  ];
  
  matches.forEach(m => {
    // For 1:1 or N:1 we simplify representation here or loop
    const maxLen = Math.max(m.bankItems.length, m.supplierItems.length);
    for (let i = 0; i < maxLen; i++) {
      const b = m.bankItems[i] || {};
      const s = m.supplierItems[i] || {};
      conciliadosData.push([
        i === 0 ? m.confidence + '%' : '',
        i === 0 ? m.passName : '',
        b.date || '',
        b.description || '',
        b.amount !== undefined ? b.amount : '',
        s.date || '',
        s.description || '',
        s.amount !== undefined ? s.amount : '',
        i === 0 ? (m.justificativa || '') : ''
      ]);
    }
  });

  const wsConciliados = XLSX.utils.aoa_to_sheet(conciliadosData);
  XLSX.utils.book_append_sheet(wb, wsConciliados, 'Conciliados');

  // 3. Sugestões Pendentes
  const sugestoesData = [
    ['Data Banco', 'Desc Banco', 'Valor Banco', 'Score', 'Data Forn', 'Desc Forn', 'Valor Forn']
  ];
  
  suggestions.forEach(sug => {
    const b = sug.bankItem;
    sug.candidates.forEach((cand, idx) => {
      sugestoesData.push([
        idx === 0 ? b.date : '',
        idx === 0 ? b.description : '',
        idx === 0 ? b.amount : '',
        cand.score.toFixed(1),
        cand.supplierItem.date,
        cand.supplierItem.description,
        cand.supplierItem.amount
      ]);
    });
  });

  const wsSugestoes = XLSX.utils.aoa_to_sheet(sugestoesData);
  XLSX.utils.book_append_sheet(wb, wsSugestoes, 'Sugestões Pendentes');

  // 4. Ausentes no Banco (Missing in Bank -> Only in Supplier)
  const ausentesBancoData = [
    ['Data Fornecedor', 'Descrição Fornecedor', 'Documento', 'Valor']
  ];
  missingInBank.forEach(s => {
    ausentesBancoData.push([s.date, s.description, s.document || '', s.amount]);
  });
  const wsAusentesBanco = XLSX.utils.aoa_to_sheet(ausentesBancoData);
  XLSX.utils.book_append_sheet(wb, wsAusentesBanco, 'Ausentes no Banco');

  // 5. Ausentes no Fornecedor (Missing in Supplier -> Only in Bank)
  const ausentesFornData = [
    ['Data Banco', 'Descrição Banco', 'Documento', 'Valor']
  ];
  missingInSupplier.forEach(b => {
    ausentesFornData.push([b.date, b.description, b.document || '', b.amount]);
  });
  const wsAusentesForn = XLSX.utils.aoa_to_sheet(ausentesFornData);
  XLSX.utils.book_append_sheet(wb, wsAusentesForn, 'Ausentes no Forn');

  // File generation
  const today = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `conciliacao_dominio_banco_${today}.xlsx`);
}
