import { useState, useEffect } from 'react';
import { BookOpen, Plus, Trash2, X, CheckCircle, Search, ArrowRight } from 'lucide-react';
import { getDeParaRules, saveDeParaRule, deleteDeParaRule } from '../../engine/deParaStorage.js';
import useAppStore from '../../store/useAppStore.js';

export default function DeParaModal({ isOpen, onClose }) {
  const [rules, setRules] = useState([]);
  const [search, setSearch] = useState('');
  const [newBank, setNewBank] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const { addToast } = useAppStore();

  const refreshRules = () => {
    setRules(getDeParaRules());
  };

  useEffect(() => {
    if (isOpen) refreshRules();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAdd = () => {
    if (!newBank.trim() || !newSupplier.trim()) {
      addToast('Preencha o padrão do Banco e do Fornecedor.', 'warning');
      return;
    }

    saveDeParaRule(newBank, newSupplier, newDesc);
    setNewBank('');
    setNewSupplier('');
    setNewDesc('');
    refreshRules();
    addToast('✅ Regra De-Para salva com sucesso!', 'success');
  };

  const handleDelete = (id) => {
    deleteDeParaRule(id);
    refreshRules();
    addToast('Regra excluída.', 'info');
  };

  const filteredRules = rules.filter(r => {
    const q = search.toUpperCase().trim();
    if (!q) return true;
    return (r.bankPattern || '').toUpperCase().includes(q) ||
           (r.supplierPattern || '').toUpperCase().includes(q) ||
           (r.description || '').toUpperCase().includes(q);
  });

  return (
    <>
      <div className="detail-panel-overlay open" onClick={onClose} />
      <div className="detail-panel open" style={{ width: 680, maxWidth: '95vw' }}>
        <div className="detail-panel-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={18} />
            Dicionário de Aprendizado De-Para ({rules.length} regras)
          </h3>
          <button className="detail-panel-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="detail-panel-body" style={{ gap: 14 }}>
          <div style={{ background: 'var(--bg-card)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-secondary)', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            💡 <strong>Como funciona a Memória De-Para:</strong>
            <p style={{ margin: '4px 0 0 0' }}>
              Toda vez que você confirma ou vincula um fornecedor, o sistema aprende o padrão bancário. Nas próximas conciliações, ele identifica o fornecedor automaticamente com <strong>100% de precisão</strong>.
            </p>
          </div>

          {/* Add New Rule Form */}
          <div style={{ background: 'var(--bg-secondary)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-secondary)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Adicionar Nova Regra De-Para
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.72rem' }}>🏦 Texto no Banco (Ex: METAL LUZ)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Trecho do texto no extrato..."
                  value={newBank}
                  onChange={(e) => setNewBank(e.target.value)}
                  style={{ height: 32, fontSize: '0.78rem' }}
                />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '0.72rem' }}>🏢 Conta no Fornecedor (Ex: METAL LUZ METALURGICA)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Nome no Razão Fornecedor..."
                  value={newSupplier}
                  onChange={(e) => setNewSupplier(e.target.value)}
                  style={{ height: 32, fontSize: '0.78rem' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="form-input"
                placeholder="Observação ou Razão Social (Opcional)..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                style={{ height: 32, fontSize: '0.78rem', flex: 1 }}
              />
              <button className="btn btn-primary" onClick={handleAdd} style={{ padding: '4px 14px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                <Plus size={14} /> Salvar Regra
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Filtrar regras aprendidas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 30, height: 32, fontSize: '0.78rem' }}
            />
          </div>

          {/* Rules List */}
          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredRules.map(rule => (
              <div
                key={rule.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--bg-card)',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border-secondary)',
                  fontSize: '0.78rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  <span style={{ fontWeight: 600, color: '#38bdf8' }}>{rule.bankPattern}</span>
                  <ArrowRight size={12} style={{ color: 'var(--text-dim)' }} />
                  <span style={{ fontWeight: 600, color: '#c084fc' }}>{rule.supplierPattern}</span>
                  {rule.description && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginLeft: 6 }}>
                      ({rule.description})
                    </span>
                  )}
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '3px 6px', color: 'var(--danger)', border: 'none', background: 'transparent' }}
                  onClick={() => handleDelete(rule.id)}
                  title="Excluir regra"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="detail-actions">
          <button className="btn btn-secondary" onClick={onClose} style={{ width: '100%' }}>
            Fechar
          </button>
        </div>
      </div>
    </>
  );
}
