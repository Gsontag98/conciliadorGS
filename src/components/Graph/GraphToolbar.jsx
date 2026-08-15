import { LayoutGrid, Maximize, Download, Search, X, Table2, Network, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import useAppStore from '../../store/useAppStore';
import { exportReport } from '../../engine/exporter';

export default function GraphToolbar({ onFitView, onAutoLayout }) {
  const {
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    filterStatus,
    setFilterStatus,
    reconciliationResult
  } = useAppStore();

  const matches = reconciliationResult?.matches || [];
  const missingBank = reconciliationResult?.missingInBank || [];
  const missingSupplier = reconciliationResult?.missingInSupplier || [];

  const exactCount = matches.filter(m => m.pass <= 2).length;
  const aiCount = matches.filter(m => m.pass === 7).length;
  const pendingCount = missingBank.length + missingSupplier.length;

  return (
    <div className="graph-toolbar" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 14px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-secondary)' }}>
      {/* Top Bar: View Mode Switcher, Search Bar, Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {/* View Mode Toggle */}
        <div className="view-mode-toggle" style={{ display: 'flex', background: 'var(--bg-card)', padding: 3, borderRadius: 8, border: '1px solid var(--border-secondary)' }}>
          <button
            className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
            style={{
              padding: '6px 12px',
              fontSize: '0.78rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 6,
              border: 'none',
              background: viewMode === 'table' ? 'var(--accent-primary)' : 'transparent',
              color: viewMode === 'table' ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            <Table2 size={14} /> Tabela Comparativa
          </button>
          <button
            className={`toggle-btn ${viewMode === 'graph' ? 'active' : ''}`}
            onClick={() => setViewMode('graph')}
            style={{
              padding: '6px 12px',
              fontSize: '0.78rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 6,
              border: 'none',
              background: viewMode === 'graph' ? 'var(--accent-primary)' : 'transparent',
              color: viewMode === 'graph' ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            <Network size={14} /> Grafo Interativo
          </button>
        </div>

        {/* Global Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 380 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Buscar por fornecedor, CNPJ, valor, NF..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: 30, paddingRight: 28, height: 32, fontSize: '0.78rem', borderRadius: 20 }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0 }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {viewMode === 'graph' && (
            <>
              <button className="toolbar-btn" onClick={onAutoLayout}>
                <LayoutGrid size={13} /> Auto Layout
              </button>
              <button className="toolbar-btn" onClick={onFitView}>
                <Maximize size={13} /> Encaixar
              </button>
            </>
          )}
          {reconciliationResult && (
            <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.78rem' }} onClick={() => exportReport(reconciliationResult)}>
              <Download size={13} /> Exportar Excel
            </button>
          )}
        </div>
      </div>

      {/* Filter Chips Bar */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', marginRight: 4 }}>
          Filtros:
        </span>
        <button
          className={`filter-chip ${filterStatus === 'all' ? 'active' : ''}`}
          onClick={() => setFilterStatus('all')}
        >
          Todos ({matches.length + pendingCount})
        </button>
        <button
          className={`filter-chip ${filterStatus === 'exact' ? 'active' : ''}`}
          onClick={() => setFilterStatus('exact')}
          style={filterStatus === 'exact' ? { borderColor: 'var(--success)', color: 'var(--success)' } : {}}
        >
          <CheckCircle2 size={12} style={{ color: 'var(--success)' }} />
          Conciliados 100% ({exactCount})
        </button>
        {aiCount > 0 && (
          <button
            className={`filter-chip ${filterStatus === 'ai' ? 'active' : ''}`}
            onClick={() => setFilterStatus('ai')}
            style={filterStatus === 'ai' ? { borderColor: 'var(--ai)', color: 'var(--ai)' } : {}}
          >
            <Sparkles size={12} style={{ color: 'var(--ai)' }} />
            IA Gemini ({aiCount})
          </button>
        )}
        <button
          className={`filter-chip ${filterStatus === 'unmatched_bank' ? 'active' : ''}`}
          onClick={() => setFilterStatus('unmatched_bank')}
          style={filterStatus === 'unmatched_bank' ? { borderColor: 'var(--warning)', color: 'var(--warning)' } : {}}
        >
          <AlertTriangle size={12} style={{ color: 'var(--warning)' }} />
          Pendentes no Banco ({missingBank.length})
        </button>
        <button
          className={`filter-chip ${filterStatus === 'unmatched_supplier' ? 'active' : ''}`}
          onClick={() => setFilterStatus('unmatched_supplier')}
          style={filterStatus === 'unmatched_supplier' ? { borderColor: 'var(--warning)', color: 'var(--warning)' } : {}}
        >
          <AlertTriangle size={12} style={{ color: 'var(--warning)' }} />
          Pendentes no Fornecedor ({missingSupplier.length})
        </button>
      </div>
    </div>
  );
}
