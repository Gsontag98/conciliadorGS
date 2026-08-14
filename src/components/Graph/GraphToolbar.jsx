import { Filter, LayoutGrid, Maximize, Download } from 'lucide-react';
import useAppStore from '../../store/useAppStore';
import { exportReport } from '../../engine/exporter';

export default function GraphToolbar({ onFitView, onAutoLayout }) {
  const { graphFilters, setGraphFilter, reconciliationResult } = useAppStore();
  
  const filterItems = [
    { key: 'showPass1', label: 'Exato', color: '#22c55e' },
    { key: 'showPass2', label: 'Data', color: '#22c55e' },
    { key: 'showPass3', label: 'Texto', color: '#3b82f6' },
    { key: 'showPass4', label: 'N:1', color: '#3b82f6' },
    { key: 'showPass5', label: 'Fuzzy', color: '#f59e0b' },
    { key: 'showPass7', label: 'IA', color: '#a855f7' },
    { key: 'showUnmatched', label: 'Pendentes', color: '#64748b' },
  ];
  
  return (
    <div className="graph-toolbar">
      <Filter size={14} />
      <div className="filter-group">
        {filterItems.map(item => (
          <button
            key={item.key}
            className={`filter-chip ${graphFilters[item.key] ? 'active' : ''}`}
            onClick={() => setGraphFilter(item.key, !graphFilters[item.key])}
            style={graphFilters[item.key] ? { borderColor: item.color, color: item.color } : {}}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, display: 'inline-block' }} />
            {item.label}
          </button>
        ))}
      </div>
      <div className="toolbar-separator" />
      <button className="toolbar-btn" onClick={onAutoLayout}>
        <LayoutGrid size={14} /> Auto Layout
      </button>
      <button className="toolbar-btn" onClick={onFitView}>
        <Maximize size={14} /> Encaixar
      </button>
      {reconciliationResult && (
        <button className="toolbar-btn" onClick={() => exportReport(reconciliationResult)}>
          <Download size={14} /> Exportar Excel
        </button>
      )}
    </div>
  );
}
