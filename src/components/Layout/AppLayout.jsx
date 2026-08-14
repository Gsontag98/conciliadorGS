import Sidebar from './Sidebar';
import useAppStore from '../../store/useAppStore';
import ToastContainer from '../UI/ToastContainer';
import { Moon, Sun, Brain } from 'lucide-react';
import { isConfigured } from '../../engine/ai';

export default function AppLayout({ children }) {
  const { theme, sidebarCollapsed, toggleTheme } = useAppStore();

  return (
    <div className={`app-root ${theme}`}>
      <Sidebar />
      <div className="main-content" style={{ marginLeft: sidebarCollapsed ? 64 : 220 }}>
        <header className="app-header">
          <div className="header-left">
            <div>
              <div className="header-title">Conciliador GS 2.0</div>
              <div className="header-subtitle">Conciliação Inteligente Banco × Fornecedor</div>
            </div>
          </div>
          <div className="header-right">
            {isConfigured() && (
              <div className="ai-status-badge active">
                <Brain size={14} />
                IA Ativa
              </div>
            )}
            {!isConfigured() && (
              <div className="ai-status-badge inactive">
                <Brain size={14} />
                IA Inativa
              </div>
            )}
            <button className="theme-toggle" onClick={toggleTheme} title="Alternar tema">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>
        <main className="content-area">{children}</main>
      </div>
      <ToastContainer />
    </div>
  );
}
