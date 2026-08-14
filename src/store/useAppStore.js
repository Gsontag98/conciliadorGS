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

  // Graph
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
