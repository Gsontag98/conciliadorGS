/**
 * MAIN APP ORCHESTRATOR
 * Manages SPA state, file uploads, step wizard navigation, sample data generation,
 * Gemini API modal, and user interactions.
 */

const App = (function () {

  // State
  const state = {
    currentStep: 1,
    ledgerFile: null,
    bankFile: null,
    rawLedgerData: null, // Razão Conta Banco { headers, rows }
    rawBankData: null,   // Razão Conta Fornecedor { headers, rows }
    ledgerMapping: null,
    bankMapping: null,
    normalizedLedger: [],
    normalizedBank: [],
    reconciliationResult: null
  };

  /**
   * Initialize application on DOM ready
   */
  function init() {
    setupEventListeners();
    updateAIStatusIndicator();
  }

  /**
   * Update UI status indicator for Gemini AI
   */
  function updateAIStatusIndicator() {
    const indicator = document.getElementById('ai-status-indicator');
    if (indicator) {
      if (GeminiAI.isConfigured()) {
        indicator.textContent = '(Ativado ⚡)';
        indicator.style.color = '#34d399';
      } else {
        indicator.textContent = '(Desativado)';
        indicator.style.color = 'var(--text-dim)';
      }
    }
  }

  /**
   * Setup UI Event Listeners
   */
  function setupEventListeners() {
    // Dropzones
    setupDropzone('dropzone-ledger', 'input-ledger', handleLedgerFileSelect);
    setupDropzone('dropzone-bank', 'input-bank', handleBankFileSelect);

    // Navigation buttons
    document.getElementById('btn-to-mapping').addEventListener('click', goToStep2);
    document.getElementById('btn-back-to-upload').addEventListener('click', () => goToStep(1));
    document.getElementById('btn-run-reconciliation').addEventListener('click', runReconciliationProcess);
    document.getElementById('btn-export-excel').addEventListener('click', handleExportReport);
    document.getElementById('btn-load-sample').addEventListener('click', loadSampleData);
    document.getElementById('btn-reset-all').addEventListener('click', resetAll);

    // Gemini API Modal Listeners
    document.getElementById('btn-open-api-modal').addEventListener('click', openApiModal);
    document.getElementById('btn-close-api-modal').addEventListener('click', closeApiModal);
    document.getElementById('btn-cancel-api-key').addEventListener('click', closeApiModal);
    document.getElementById('btn-save-api-key').addEventListener('click', saveApiKey);
    document.getElementById('btn-remove-api-key').addEventListener('click', removeApiKey);

    // Search and filter inputs
    document.getElementById('table-search-input').addEventListener('input', (e) => {
      Dashboard.setSearch(e.target.value);
    });

    document.getElementById('confidence-filter-select').addEventListener('change', (e) => {
      Dashboard.setConfidenceFilter(e.target.value);
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Dashboard.setTab(btn.dataset.tab);
      });
    });
  }

  /**
   * Gemini API Modal Handlers
   */
  function openApiModal() {
    const key = GeminiAI.getApiKey();
    document.getElementById('input-api-key').value = key;
    document.getElementById('modal-api-config').classList.add('active');
  }

  function closeApiModal() {
    document.getElementById('modal-api-config').classList.remove('active');
  }

  function saveApiKey() {
    const key = document.getElementById('input-api-key').value.trim();
    if (!key) {
      alert('Por favor, digite uma chave de API válida.');
      return;
    }
    GeminiAI.saveApiKey(key);
    updateAIStatusIndicator();
    closeApiModal();
    alert('✅ Chave de API do Gemini salva com sucesso! A conciliação por IA está ativada.');
  }

  function removeApiKey() {
    GeminiAI.saveApiKey('');
    updateAIStatusIndicator();
    closeApiModal();
    alert('Chave de API do Gemini removida.');
  }

  /**
   * Setup Drag and Drop File Input
   */
  function setupDropzone(dropzoneId, inputId, onFileSelect) {
    const dropzone = document.getElementById(dropzoneId);
    const input = document.getElementById(inputId);

    dropzone.addEventListener('click', () => input.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onFileSelect(e.dataTransfer.files[0]);
      }
    });

    input.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        onFileSelect(e.target.files[0]);
      }
    });
  }

  /**
   * Handle Razão Conta Banco File Selection
   */
  async function handleLedgerFileSelect(file) {
    try {
      state.ledgerFile = file;
      document.getElementById('ledger-filename').textContent = file.name;
      document.getElementById('ledger-file-info').classList.remove('hidden');
      document.getElementById('card-ledger').classList.add('loaded');

      const parsed = await ExcelParser.parseFile(file);
      const firstSheet = parsed.sheetNames[0];
      state.rawLedgerData = parsed.sheets[firstSheet];

      checkUploadReady();
    } catch (err) {
      alert('Erro ao ler arquivo do Razão Conta Banco: ' + err.message);
    }
  }

  /**
   * Handle Razão Conta Fornecedores File Selection
   */
  async function handleBankFileSelect(file) {
    try {
      state.bankFile = file;
      document.getElementById('bank-filename').textContent = file.name;
      document.getElementById('bank-file-info').classList.remove('hidden');
      document.getElementById('card-bank').classList.add('loaded');

      const parsed = await ExcelParser.parseFile(file);
      const firstSheet = parsed.sheetNames[0];
      state.rawBankData = parsed.sheets[firstSheet];

      checkUploadReady();
    } catch (err) {
      alert('Erro ao ler arquivo do Razão Conta Fornecedor: ' + err.message);
    }
  }

  /**
   * Check if both files are loaded to enable Step 2 button
   */
  function checkUploadReady() {
    const btn = document.getElementById('btn-to-mapping');
    if (state.rawLedgerData && state.rawBankData) {
      btn.disabled = false;
      btn.classList.add('btn-primary');
    }
  }

  /**
   * Step Wizard Navigation
   */
  function goToStep(stepNum) {
    state.currentStep = stepNum;

    document.querySelectorAll('.step-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(`step-${stepNum}`).classList.add('active');

    for (let i = 1; i <= 3; i++) {
      const stepEl = document.getElementById(`wizard-step-${i}`);
      const dividerEl = document.getElementById(`wizard-divider-${i}`);

      stepEl.classList.remove('active', 'completed');
      if (dividerEl) dividerEl.classList.remove('completed');

      if (i < stepNum) {
        stepEl.classList.add('completed');
        if (dividerEl) dividerEl.classList.add('completed');
      } else if (i === stepNum) {
        stepEl.classList.add('active');
      }
    }
  }

  /**
   * Navigate to Step 2 (Column Mapping)
   */
  function goToStep2() {
    if (!state.rawLedgerData || !state.rawBankData) return;

    state.ledgerMapping = ColumnMapper.autoDetect(state.rawLedgerData.headers);
    state.bankMapping = ColumnMapper.autoDetect(state.rawBankData.headers);

    renderMappingDropdowns('ledger', state.rawLedgerData.headers, state.ledgerMapping);
    renderMappingDropdowns('bank', state.rawBankData.headers, state.bankMapping);

    renderPreviewTable('preview-ledger', state.rawLedgerData);
    renderPreviewTable('preview-bank', state.rawBankData);

    goToStep(2);
  }

  /**
   * Render Column Mapping Select Dropdowns
   */
  function renderMappingDropdowns(prefix, headers, currentMapping) {
    const container = document.getElementById(`mapping-fields-${prefix}`);
    container.innerHTML = '';

    ColumnMapper.FIELDS.forEach(field => {
      const group = document.createElement('div');
      group.className = 'form-group';

      const label = document.createElement('label');
      label.className = 'form-label';
      label.textContent = `${field.label}${field.required ? ' *' : ''}`;

      const select = document.createElement('select');
      select.className = 'form-select';
      select.dataset.fieldKey = field.key;

      select.innerHTML = `<option value="">-- Selecione a Coluna --</option>`;
      headers.forEach(h => {
        const isSelected = currentMapping[field.key] === h ? 'selected' : '';
        select.innerHTML += `<option value="${h}" ${isSelected}>${h}</option>`;
      });

      select.addEventListener('change', (e) => {
        if (prefix === 'ledger') state.ledgerMapping[field.key] = e.target.value;
        else state.bankMapping[field.key] = e.target.value;
      });

      group.appendChild(label);
      group.appendChild(select);
      container.appendChild(group);
    });
  }

  /**
   * Render Preview Tables for Raw Data
   */
  function renderPreviewTable(elementId, dataset) {
    const container = document.getElementById(elementId);
    if (!container || !dataset) return;

    const sampleRows = dataset.rows.slice(0, 5);

    let html = `<table class="preview-table"><thead><tr>`;
    dataset.headers.forEach(h => {
      html += `<th>${h}</th>`;
    });
    html += `</tr></thead><tbody>`;

    sampleRows.forEach(row => {
      html += `<tr>`;
      dataset.headers.forEach(h => {
        html += `<td>${row[h] !== undefined ? row[h] : ''}</td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  /**
   * Execute Reconciliation Engine
   */
  async function runReconciliationProcess() {
    const dateTolerance = parseInt(document.getElementById('config-date-tolerance').value, 10) || 3;
    const amountTolerance = parseFloat(document.getElementById('config-amount-tolerance').value) || 0.05;
    const textThreshold = (parseInt(document.getElementById('config-text-threshold').value, 10) || 70) / 100;
    const enableNtoOne = document.getElementById('config-nto-one').checked;

    state.normalizedLedger = ColumnMapper.normalizeData(state.rawLedgerData.rows, state.ledgerMapping, 'Razão Conta Banco');
    state.normalizedBank = ColumnMapper.normalizeData(state.rawBankData.rows, state.bankMapping, 'Razão Conta Fornecedor');

    if (state.normalizedLedger.length === 0 || state.normalizedBank.length === 0) {
      let diagMsg = 'Atenção: Não foi possível extrair lançamentos válidos de um dos arquivos:\n\n';
      diagMsg += `• Razão Conta Banco: ${state.normalizedLedger.length} lançamento(s) lido(s)\n`;
      diagMsg += `• Razão Conta Fornecedor: ${state.normalizedBank.length} lançamento(s) lido(s)\n\n`;
      diagMsg += 'Por favor, revise o Mapeamento de Colunas (Etapa 2) garantindo que as colunas com a Data e o Valor (ou Débito/Crédito) estejam selecionadas corretamente.';
      alert(diagMsg);
      return;
    }

    // Run 6-Pass Engine + Gemini AI Pass
    state.reconciliationResult = await Reconciler.reconcile(state.normalizedLedger, state.normalizedBank, {
      dateToleranceDays: dateTolerance,
      amountTolerance: amountTolerance,
      textThreshold: textThreshold,
      enableNtoOne: enableNtoOne,
      enableAI: true
    });

    Dashboard.render(state.reconciliationResult);
    goToStep(3);
  }

  /**
   * Handle Export Report to XLSX
   */
  function handleExportReport() {
    if (!state.reconciliationResult) return;
    ExcelExporter.exportReport(state.reconciliationResult);
  }

  /**
   * Load Realistic Sample Data (Razão Conta Banco vs Razão Conta Fornecedor do Domínio)
   */
  function loadSampleData() {
    const today = new Date().toISOString().split('T')[0];
    const prevDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const nextDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // File 1: Razão da Conta 1.1.01.02 (Banco do Brasil / Itaú) - Domínio
    state.rawLedgerData = {
      headers: ['Data', 'Lote', 'Documento', 'Histórico Lançamento Domínio', 'Crédito (Saída R$)'],
      rows: [
        { 'Data': today, 'Lote': '104', 'Documento': 'NF-1045', 'Histórico Lançamento Domínio': 'PGTO PIX REF NF 1045 FORNECEDOR ABC SERVICOS', 'Crédito (Saída R$)': '1.500,00' },
        { 'Data': prevDate, 'Lote': '105', 'Documento': 'NF-8821', 'Histórico Lançamento Domínio': 'PAGTO DUP TECH SOLUTIONS S/A', 'Crédito (Saída R$)': '4.320,50' },
        { 'Data': today, 'Lote': '106', 'Documento': 'NF-9001', 'Histórico Lançamento Domínio': 'TED 001 DELL COMPUTADORES DO BRASIL', 'Crédito (Saída R$)': '8.900,00' },
        // N:1 Grouped Invoices Payment out of Bank
        { 'Data': today, 'Lote': '107', 'Documento': 'AGR-1500', 'Histórico Lançamento Domínio': 'PGTO AGRUPADO INSUMOS DIVERSOS A B C', 'Crédito (Saída R$)': '1.500,00' },
        // Complex AI Candidate: Vendor name written as trade name vs legal entity
        { 'Data': today, 'Lote': '108', 'Documento': 'NF-4521', 'Histórico Lançamento Domínio': 'PAGTO PIX FINKELSTEIN INFORMATICA', 'Crédito (Saída R$)': '2.450,00' },
        // Unmatched in bank
        { 'Data': nextDate, 'Lote': '109', 'Documento': 'TAR-99', 'Histórico Lançamento Domínio': 'TARIFA MANUTENCAO CONTA BANCO', 'Crédito (Saída R$)': '85,00' }
      ]
    };

    // File 2: Razão da Conta 2.1.01.01 (Fornecedores a Pagar) - Domínio
    state.rawBankData = {
      headers: ['Data', 'Lote', 'Documento', 'Histórico Razão Fornecedor', 'Débito (Baixa R$)'],
      rows: [
        { 'Data': today, 'Lote': '201', 'Documento': '1045', 'Histórico Razão Fornecedor': 'BAIXA TITULO FORNECEDOR ABC SERVICOS LTDA', 'Débito (Baixa R$)': '1.500,00' },
        { 'Data': today, 'Lote': '202', 'Documento': '8821', 'Histórico Razão Fornecedor': 'BAIXA DUP TECH SOLUTIONS S/A', 'Débito (Baixa R$)': '4.320,50' },
        { 'Data': prevDate, 'Lote': '203', 'Documento': '9001', 'Histórico Razão Fornecedor': 'DELL COMPUTADORES BRASIL LTDA', 'Débito (Baixa R$)': '8.900,00' },
        // 3 grouped items in Supplier ledger
        { 'Data': today, 'Lote': '204', 'Documento': 'NF-501', 'Histórico Razão Fornecedor': 'INSUMOS DIVERSOS PARTE A', 'Débito (Baixa R$)': '500,00' },
        { 'Data': today, 'Lote': '205', 'Documento': 'NF-502', 'Histórico Razão Fornecedor': 'INSUMOS DIVERSOS PARTE B', 'Débito (Baixa R$)': '750,00' },
        { 'Data': today, 'Lote': '206', 'Documento': 'NF-503', 'Histórico Razão Fornecedor': 'INSUMOS DIVERSOS PARTE C', 'Débito (Baixa R$)': '250,00' },
        // Complex AI Candidate matching item above
        { 'Data': today, 'Lote': '207', 'Documento': 'NF-4521', 'Histórico Razão Fornecedor': 'BAIXA JOSE FINKELSTEIN & CIA LTDA', 'Débito (Baixa R$)': '2.450,00' },
        // Unmatched in supplier ledger
        { 'Data': nextDate, 'Lote': '208', 'Documento': 'NF-7734', 'Histórico Razão Fornecedor': 'ALUGUEL CENTRAL IMOBILIARIA', 'Débito (Baixa R$)': '3.200,00' }
      ]
    };

    document.getElementById('ledger-filename').textContent = 'Razao_Conta_1-1-01-02_Banco.xlsx';
    document.getElementById('ledger-file-info').classList.remove('hidden');
    document.getElementById('card-ledger').classList.add('loaded');

    document.getElementById('bank-filename').textContent = 'Razao_Conta_2-1-01-01_Fornecedores.xlsx';
    document.getElementById('bank-file-info').classList.remove('hidden');
    document.getElementById('card-bank').classList.add('loaded');

    checkUploadReady();
    goToStep2();
  }

  /**
   * Reset All State to Initial
   */
  function resetAll() {
    state.ledgerFile = null;
    state.bankFile = null;
    state.rawLedgerData = null;
    state.rawBankData = null;
    state.reconciliationResult = null;

    document.getElementById('ledger-file-info').classList.add('hidden');
    document.getElementById('bank-file-info').classList.add('hidden');
    document.getElementById('card-ledger').classList.remove('loaded');
    document.getElementById('card-bank').classList.remove('loaded');

    document.getElementById('btn-to-mapping').disabled = true;
    document.getElementById('btn-to-mapping').classList.remove('btn-primary');

    goToStep(1);
  }

  return {
    init,
    goToStep
  };

})();

document.addEventListener('DOMContentLoaded', App.init);
