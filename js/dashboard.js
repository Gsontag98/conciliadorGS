/**
 * DASHBOARD ENGINE
 * Controls summary cards, interactive table rendering, confidence badges,
 * filtering/search, and manual suggestion approval.
 */

const Dashboard = (function () {

  let currentResult = null;
  let activeTab = 'all';
  let searchTerm = '';
  let activeConfidenceFilter = 'all';

  /**
   * Initializes dashboard view with reconciliation results
   */
  function render(result) {
    currentResult = result;
    renderSummaryCards();
    renderProgressBar();
    renderTable();
  }

  /**
   * Render top summary statistical cards
   */
  function renderSummaryCards() {
    if (!currentResult) return;

    const totalReconciledCount = currentResult.matches.reduce((acc, m) => acc + m.ledgerItems.length, 0);
    const percentage = currentResult.reconciledRate;

    document.getElementById('stat-total-ledger').textContent = currentResult.totalLedgerCount;
    document.getElementById('stat-total-bank').textContent = currentResult.totalBankCount;
    document.getElementById('stat-reconciled').textContent = totalReconciledCount;
    document.getElementById('stat-percentage').textContent = `${percentage}%`;

    document.getElementById('stat-suggestions').textContent = currentResult.suggestions.length;
    document.getElementById('stat-missing-bank').textContent = currentResult.missingInBank.length;
    document.getElementById('stat-missing-ledger').textContent = currentResult.missingInLedger.length;
  }

  /**
   * Render progress bar visualization
   */
  function renderProgressBar() {
    if (!currentResult) return;
    const rate = parseFloat(currentResult.reconciledRate) || 0;
    const progressFill = document.getElementById('progress-fill-reconciled');
    const progressText = document.getElementById('progress-text-reconciled');

    if (progressFill && progressText) {
      progressFill.style.width = `${rate}%`;
      progressText.textContent = `${rate}% Conciliado`;

      if (rate >= 80) progressFill.className = 'progress-fill success';
      else if (rate >= 50) progressFill.className = 'progress-fill warning';
      else progressFill.className = 'progress-fill danger';
    }
  }

  /**
   * Filter and render table rows
   */
  function renderTable() {
    const tbody = document.getElementById('reconciliation-table-body');
    if (!tbody || !currentResult) return;

    tbody.innerHTML = '';

    const rowsToRender = getFilteredItems();

    if (rowsToRender.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center" style="padding: 3rem 1rem; color: var(--text-muted);">
            <svg style="width: 48px; height: 48px; margin-bottom: 0.5rem; opacity: 0.5;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1.207 1.207 0 01.883.393l4.314 4.314c.28.28.393.656.393.883V19a2 2 0 01-2 2z"></path>
            </svg>
            <p>Nenhum lançamento encontrado para os filtros selecionados.</p>
          </td>
        </tr>
      `;
      return;
    }

    rowsToRender.forEach(row => {
      const tr = document.createElement('tr');
      tr.className = `row-${row.category}`;

      if (row.type === 'match') {
        const bnk = row.match.bankItems[0];
        const leg = row.match.ledgerItems[0];
        const isMulti = row.match.ledgerItems.length > 1 || row.match.bankItems.length > 1;

        tr.innerHTML = `
          <td><span class="badge ${row.match.badgeClass}">${row.match.confidence}%</span></td>
          <td><span class="badge badge-pass">${row.match.passName}</span></td>
          <td>
            <strong>${bnk.date}</strong>
            <div style="font-size: 0.75rem; color: var(--text-dim);">${bnk.description}</div>
            ${isMulti ? `<div style="font-size: 0.7rem; color: var(--accent);">+ ${row.match.bankItems.length - 1} item(ns) agrupado(s)</div>` : ''}
          </td>
          <td>
            <strong>${leg.date}</strong>
            <div style="font-size: 0.75rem; color: var(--text-dim);">${leg.description}</div>
            ${isMulti ? `<div style="font-size: 0.7rem; color: var(--accent);">+ ${row.match.ledgerItems.length - 1} item(ns) agrupado(s)</div>` : ''}
          </td>
          <td class="amount positive col-amount">R$ ${bnk.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td><span class="badge ${row.match.pass === 7 ? 'badge-ai' : 'badge-success'}">${row.match.pass === 7 ? '🤖 IA Gemini' : '✅ Conciliado'}</span></td>
          <td class="text-center">
            ${row.match.notes ? `<div style="font-size: 0.75rem; color: var(--text-muted); max-width: 250px; text-align: left; margin: 0 auto 0.3rem auto;">${row.match.notes}</div>` : ''}
            <button class="btn btn-outline btn-sm" onclick="Dashboard.unmatchItem('${row.match.id}')">Desfazer</button>
          </td>
        `;
      } else if (row.type === 'suggestion') {
        const bnk = row.suggestion.bankItem;
        const topCand = row.suggestion.candidates[0];

        tr.innerHTML = `
          <td><span class="badge badge-warning">${topCand.score}% Prob.</span></td>
          <td><span class="badge badge-pass">Passe 6 — Sugestão</span></td>
          <td>
            <strong>${bnk.date}</strong>
            <div style="font-size: 0.75rem; color: var(--text-main);">${bnk.description}</div>
          </td>
          <td>
            <strong>${topCand.supplierItem.date}</strong>
            <div style="font-size: 0.75rem; color: var(--text-main);">${topCand.supplierItem.description}</div>
          </td>
          <td class="amount neutral col-amount">R$ ${bnk.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td><span class="badge badge-warning">⚠️ Sugestão</span></td>
          <td class="text-center">
            <button class="btn btn-primary btn-sm" onclick="Dashboard.acceptSuggestion('${row.suggestion.id}', 0)">Aceitar</button>
            <button class="btn btn-secondary btn-sm" onclick="Dashboard.rejectSuggestion('${row.suggestion.id}')">Ignorar</button>
          </td>
        `;
      } else if (row.type === 'missing_bank') {
        const sup = row.item;
        tr.innerHTML = `
          <td><span class="badge badge-danger">0%</span></td>
          <td><span class="badge badge-outline">Ausente</span></td>
          <td style="color: var(--text-dim); font-style: italic;">— Sem pagamento Banco —</td>
          <td>
            <strong>${sup.date}</strong>
            <div style="font-size: 0.75rem; color: var(--text-main);">${sup.description}</div>
          </td>
          <td class="amount negative col-amount">R$ ${sup.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td><span class="badge badge-danger">❌ Ausente Banco</span></td>
          <td class="text-center">—</td>
        `;
      } else if (row.type === 'missing_ledger') {
        const bnk = row.item;
        tr.innerHTML = `
          <td><span class="badge badge-danger">0%</span></td>
          <td><span class="badge badge-outline">Ausente</span></td>
          <td>
            <strong>${bnk.date}</strong>
            <div style="font-size: 0.75rem; color: var(--text-main);">${bnk.description}</div>
          </td>
          <td style="color: var(--text-dim); font-style: italic;">— Sem baixa Fornecedor —</td>
          <td class="amount negative col-amount">R$ ${bnk.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td><span class="badge badge-danger">❌ Ausente Fornecedor</span></td>
          <td class="text-center">—</td>
        `;
      }

      tbody.appendChild(tr);
    });
  }

  /**
   * Filter items according to tab, confidence filter, and search text
   */
  function getFilteredItems() {
    if (!currentResult) return [];

    const list = [];

    // Add matches
    currentResult.matches.forEach(m => {
      list.push({
        category: 'reconciled',
        type: 'match',
        confidence: m.confidence,
        searchStr: `${m.ledgerItems.map(i=>i.description).join(' ')} ${m.bankItems.map(i=>i.description).join(' ')} ${m.ledgerItems[0].amount}`,
        match: m
      });
    });

    // Add suggestions
    currentResult.suggestions.forEach(s => {
      list.push({
        category: 'suggestion',
        type: 'suggestion',
        confidence: s.candidates[0].score,
        searchStr: `${s.ledgerItem.description} ${s.candidates[0].bankItem.description} ${s.ledgerItem.amount}`,
        suggestion: s
      });
    });

    // Add missing bank
    currentResult.missingInBank.forEach(item => {
      list.push({
        category: 'missing',
        type: 'missing_bank',
        confidence: 0,
        searchStr: `${item.description} ${item.amount}`,
        item: item
      });
    });

    // Add missing ledger
    currentResult.missingInLedger.forEach(item => {
      list.push({
        category: 'missing',
        type: 'missing_ledger',
        confidence: 0,
        searchStr: `${item.description} ${item.amount}`,
        item: item
      });
    });

    return list.filter(row => {
      // Tab filter
      if (activeTab === 'reconciled' && row.category !== 'reconciled') return false;
      if (activeTab === 'suggestions' && row.category !== 'suggestion') return false;
      if (activeTab === 'missing' && row.category !== 'missing') return false;

      // Confidence filter
      if (activeConfidenceFilter !== 'all') {
        const minConf = parseInt(activeConfidenceFilter, 10);
        if (row.confidence < minConf) return false;
      }

      // Search term filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (!row.searchStr.toLowerCase().includes(term)) return false;
      }

      return true;
    });
  }

  /**
   * Action: Accept a Pass 6 suggestion
   */
  function acceptSuggestion(suggestionId, candidateIndex) {
    if (!currentResult) return;

    const sugIdx = currentResult.suggestions.findIndex(s => s.id === suggestionId);
    if (sugIdx === -1) return;

    const sug = currentResult.suggestions[sugIdx];
    const candidate = sug.candidates[candidateIndex];

    // Move to matches
    currentResult.matches.push({
      id: `match_manual_${Date.now()}`,
      pass: 6,
      passName: 'Passe 6 — Aceito Manualmente',
      confidence: candidate.score,
      badgeClass: 'badge-info',
      type: '1:1',
      ledgerItems: [sug.ledgerItem],
      bankItems: [candidate.bankItem],
      notes: 'Match aprovado manualmente pelo usuário a partir de sugestão inteligente.'
    });

    // Remove candidate bank item from missing list
    currentResult.missingInLedger = currentResult.missingInLedger.filter(b => b.id !== candidate.bankItem.id);
    // Remove suggestion from list
    currentResult.suggestions.splice(sugIdx, 1);

    // Re-render
    renderSummaryCards();
    renderProgressBar();
    renderTable();
  }

  /**
   * Action: Reject a suggestion
   */
  function rejectSuggestion(suggestionId) {
    if (!currentResult) return;
    const sugIdx = currentResult.suggestions.findIndex(s => s.id === suggestionId);
    if (sugIdx !== -1) {
      const sug = currentResult.suggestions[sugIdx];
      // Put ledger item into missingInBank
      currentResult.missingInBank.push(sug.ledgerItem);
      currentResult.suggestions.splice(sugIdx, 1);

      renderSummaryCards();
      renderProgressBar();
      renderTable();
    }
  }

  /**
   * Action: Unmatch a reconciled pair
   */
  function unmatchItem(matchId) {
    if (!currentResult) return;
    const mIdx = currentResult.matches.findIndex(m => m.id === matchId);
    if (mIdx !== -1) {
      const m = currentResult.matches[mIdx];
      m.ledgerItems.forEach(item => currentResult.missingInBank.push(item));
      m.bankItems.forEach(item => currentResult.missingInLedger.push(item));

      currentResult.matches.splice(mIdx, 1);

      renderSummaryCards();
      renderProgressBar();
      renderTable();
    }
  }

  /**
   * Setters for controls
   */
  function setTab(tabName) {
    activeTab = tabName;
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    renderTable();
  }

  function setSearch(term) {
    searchTerm = term;
    renderTable();
  }

  function setConfidenceFilter(conf) {
    activeConfidenceFilter = conf;
    renderTable();
  }

  return {
    render,
    setTab,
    setSearch,
    setConfidenceFilter,
    acceptSuggestion,
    rejectSuggestion,
    unmatchItem
  };

})();
