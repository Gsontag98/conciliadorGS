import useAppStore from '../../store/useAppStore';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

export default function ToastContainer() {
  const { toasts } = useAppStore();

  const getIcon = (type) => {
    switch (type) {
      case 'success': return <CheckCircle size={18} />;
      case 'error': return <AlertTriangle size={18} />;
      case 'warning': return <AlertTriangle size={18} />;
      default: return <Info size={18} />;
    }
  };

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type || 'info'}`}>
          <span className="toast-icon">{getIcon(toast.type)}</span>
          <span style={{ flex: 1, lineHeight: 1.4 }}>{toast.message}</span>
          <button
            onClick={() => useAppStore.setState(s => ({ toasts: s.toasts.filter(t => t.id !== toast.id) }))}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 2, opacity: 0.6 }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
