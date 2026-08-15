import { create } from 'zustand';

const useAppStore = create((set, get) => ({
  // Theme
  theme: localStorage.getItem('conciliador_theme') || 'dark',
  toggleTheme: () => set(state => {
    const next = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('conciliador_theme', next);
    return { theme: next };
  }),

  // Sidebar
  sidebarCollapsed: false,
  toggleSidebar: () => set(state => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  // Active page
  activePage: 'upload', // 'upload' | 'graph' | 'report' | 'settings'
  setActivePage: (page) => set({ activePage: page }),

  // Files
  bankFile: null, // { name, size, parsed: {headers, rows}, items: normalized[] }
  supplierFile: null,
  setBankFile: (file) => set({ bankFile: file }),
  setSupplierFile: (file) => set({ supplierFile: file }),

  // Reconciliation
  reconciliationResult: null, // { matches, suggestions, missingInBank, missingInSupplier, ... }
  isReconciling: false,
  reconciliationProgress: null, // { pass, passName, matchesFound, totalMatches }
  setReconciliationResult: (result) => set({ reconciliationResult: result, isReconciling: false }),
  setIsReconciling: (val) => set({ isReconciling: val }),
  setReconciliationProgress: (progress) => set({ reconciliationProgress: progress }),

  // View Mode & Filters
  viewMode: 'table', // 'table' (default, most didactic) | 'graph'
  setViewMode: (mode) => set({ viewMode: mode }),

  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),

  filterStatus: 'all', // 'all' | 'exact' | 'ai' | 'fuzzy' | 'unmatched_bank' | 'unmatched_supplier'
  setFilterStatus: (status) => set({ filterStatus: status }),

  // Graph Filters
  graphFilters: {
    showPass1: true, showPass2: true, showPass3: true,
    showPass4: true, showPass5: true, showPass7: true,
    showUnmatched: true,
    minConfidence: 0
  },
  setGraphFilter: (key, value) => set(state => ({
    graphFilters: { ...state.graphFilters, [key]: value }
  })),

  // Detail panel
  selectedMatch: null, // match object or null
  setSelectedMatch: (match) => set({ selectedMatch: match }),

  // AI config
  aiStatus: null, // 'success' | 'error' | 'rate_limited' | null
  setAiStatus: (status) => set({ aiStatus: status }),

  // Confirmed/Rejected matches (user actions)
  confirmedMatches: new Set(),
  rejectedMatches: new Set(),
  confirmMatch: (matchId) => set(state => {
    const next = new Set(state.confirmedMatches);
    next.add(matchId);
    return { confirmedMatches: next };
  }),
  rejectMatch: (matchId) => set(state => {
    const next = new Set(state.rejectedMatches);
    next.add(matchId);
    return { rejectedMatches: next };
  }),

  // Manual Matching Action
  manualMatch: (bankItem, supplierItem) => set(state => {
    if (!state.reconciliationResult) return state;

    const newMatch = {
      id: `manual_${Date.now()}`,
      pass: 99,
      passName: 'Conciliação Manual',
      bankItems: [bankItem],
      ledgerItems: [supplierItem],
      supplierItems: [supplierItem],
      confidence: 100,
      notes: 'Conciliado manualmente pelo usuário',
      isManual: true
    };

    const nextMatches = [newMatch, ...state.reconciliationResult.matches];
    const nextMissingInBank = state.reconciliationResult.missingInBank.filter(b => b.id !== bankItem.id);
    const nextMissingInSupplier = state.reconciliationResult.missingInSupplier.filter(s => s.id !== supplierItem.id);

    const totalCount = (state.bankFile?.items?.length || 0) + (state.supplierFile?.items?.length || 0);
    const matchedCount = nextMatches.reduce((sum, m) => sum + m.bankItems.length + (m.ledgerItems?.length || m.supplierItems?.length || 0), 0);
    const reconciledRate = totalCount > 0 ? Math.round((matchedCount / totalCount) * 100) : 100;

    return {
      reconciliationResult: {
        ...state.reconciliationResult,
        matches: nextMatches,
        missingInBank: nextMissingInBank,
        missingInSupplier: nextMissingInSupplier,
        reconciledRate
      }
    };
  }),

  // Remove / Unlink a match
  removeMatch: (matchId) => set(state => {
    if (!state.reconciliationResult) return state;

    const targetMatch = state.reconciliationResult.matches.find(m => m.id === matchId);
    if (!targetMatch) return state;

    const nextMatches = state.reconciliationResult.matches.filter(m => m.id !== matchId);
    const nextMissingInBank = [...state.reconciliationResult.missingInBank, ...targetMatch.bankItems];
    const nextMissingInSupplier = [...state.reconciliationResult.missingInSupplier, ...(targetMatch.ledgerItems || targetMatch.supplierItems || [])];

    return {
      reconciliationResult: {
        ...state.reconciliationResult,
        matches: nextMatches,
        missingInBank: nextMissingInBank,
        missingInSupplier: nextMissingInSupplier
      },
      selectedMatch: null
    };
  }),

  // Toast notifications
  toasts: [],
  addToast: (message, type = 'info', duration = 5000) => set(state => {
    const id = Date.now();
    setTimeout(() => {
      set(state2 => ({ toasts: state2.toasts.filter(t => t.id !== id) }));
    }, duration);
    return { toasts: [...state.toasts, { id, message, type }] };
  }),
}));

export default useAppStore;
