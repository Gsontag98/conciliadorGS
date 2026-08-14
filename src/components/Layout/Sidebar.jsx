import { Upload, GitBranch, FileSpreadsheet, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import useAppStore from '../../store/useAppStore';

const NAV_ITEMS = [
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'graph', label: 'Conciliação', icon: GitBranch },
  { id: 'report', label: 'Relatório', icon: FileSpreadsheet },
  { id: 'settings', label: 'Configurações', icon: Settings },
];

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, activePage, setActivePage, reconciliationResult } = useAppStore();

  return (
    <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : 'expanded'}`}>
      <div className="sidebar-logo">
        <div className="logo-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="2" width="16" height="20" rx="2" />
            <line x1="8" y1="6" x2="16" y2="6" />
            <line x1="8" y1="10" x2="16" y2="10" />
            <line x1="8" y1="14" x2="12" y2="14" />
          </svg>
        </div>
        {!sidebarCollapsed && <span className="logo-text">Conciliador GS</span>}
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          const matchCount = item.id === 'graph' && reconciliationResult ? reconciliationResult.matches.length : 0;

          return (
            <div
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setActivePage(item.id)}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <Icon className="nav-icon" size={20} />
              {!sidebarCollapsed && <span className="nav-label">{item.label}</span>}
              {!sidebarCollapsed && matchCount > 0 && (
                <span className="nav-badge">{matchCount}</span>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-toggle">
        <button onClick={toggleSidebar} title={sidebarCollapsed ? 'Expandir' : 'Recolher'}>
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </div>
  );
}
