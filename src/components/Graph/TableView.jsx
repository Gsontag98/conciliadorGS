import { useState, useMemo } from 'react';
import { CheckCircle2, AlertCircle, Sparkles, ArrowRightLeft, Eye, Link, Unlink, Building2, Landmark, Check, Percent, HelpCircle } from 'lucide-react';
import useAppStore from '../../store/useAppStore.js';

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

export default function TableView() {
  const {
    reconciliationResult,
    searchQuery,
    filterStatus,
    setSelectedMatch,
    manualMatch,
    removeMatch,
    addToast
  } = useAppStore();

  const [selectedBankId, setSelectedBankId] = useState(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);

  if (!reconciliationResult) return null;

  const { matches = [], suggestions = [], missingInBank = [], missingInSupplier = [] } = reconciliationResult;

  // Filter matches based on search query and status filter
  const filteredMatches = useMemo(() => {
    return matches.filter(match => {
      const bItems = match.bankItems || [];
      const sItems = match.ledgerItems || match.supplierItems || [];

      // Status filter
      if (filterStatus === 'exact' && match.pass > 2) return false;
      if (filterStatus === 'ai' && match.pass !== 7) return false;
      if (filterStatus === 'fuzzy' && (match.pass <= 2 || match.pass === 7)) return false;
      if (filterStatus === 'unmatched_bank' || filterStatus === 'unmatched_supplier') return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toUpperCase().trim();
        const bText = bItems.map(b => `${b.description || ''} ${b.cnpj || ''} ${b.amount} ${b.date} ${b.document || ''}`).join(' ').toUpperCase();
        const sText = sItems.map(s => `${s.description || ''} ${s.cnpj || ''} ${s.amount} ${s.date} ${s.document || ''}`).join(' ').toUpperCase();
        const matchNotes = (match.notes || '').toUpperCase();
        if (!bText.includes(q) && !sText.includes(q) && !matchNotes.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [matches, filterStatus, searchQuery]);

  // Filter missing items
  const filteredMissingBank = useMemo(() => {
    if (filterStatus === 'exact' || filterStatus === 'ai' || filterStatus === 'fuzzy' || filterStatus === 'unmatched_supplier') {
      return [];
    }
    return missingInBank.filter(item => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toUpperCase().trim();
      const text = `${item.description || ''} ${item.cnpj || ''} ${item.amount} ${item.date} ${item.document || ''}`.toUpperCase();
      return text.includes(q);
    });
  }, [missingInBank, filterStatus, searchQuery]);

  const filteredMissingSupplier = useMemo(() => {
    if (filterStatus === 'exact' || filterStatus === 'ai' || filterStatus === 'fuzzy' || filterStatus === 'unmatched_bank') {
      return [];
    }
    return missingInSupplier.filter(item => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toUpperCase().trim();
      const text = `${item.description || ''} ${item.cnpj || ''} ${item.amount} ${item.date} ${item.document || ''}`.toUpperCase();
      return text.includes(q);
    });
  }, [missingInSupplier, filterStatus, searchQuery]);

  const handleManualPairing = () => {
    const bankItem = missingInBank.find(b => b.id === selectedBankId);
    const supplierItem = missingInSupplier.find(s => s.id === selectedSupplierId);

    if (!bankItem || !supplierItem) {
      addToast('Selecione 1 item do Banco e 1 item do Fornecedor para vincular.', 'warning');
      return;
    }

    manualMatch(bankItem, supplierItem);
    setSelectedBankId(null);
    setSelectedSupplierId(null);
    addToast('✅ Lançamentos vinculados com sucesso! Padrão aprendido na memória De-Para.', 'success');
  };

  const handleApproveSuggestion = (sug) => {
    manualMatch(sug.bankItem, sug.supplierItem);
    addToast(`✅ Sugestão aprovada! Vínculo conciliado com ${sug.type === 'JUROS_MULTA' ? 'Juros/Encargos' : 'Desconto'}.`, 'success');
  };

  const getPassBadge = (match) => {
    if (match.pass === 1) {
      return <span className="badge badge-success"><CheckCircle2 size={12} /> Contrapartida Domínio (100%)</span>;
    }
    if (match.pass === 2) {
      return <span className="badge badge-success"><CheckCircle2 size={12} /> CNPJ Exato (100%)</span>;
    }
    if (match.pass === 3) {
      return <span className="badge badge-success"><Building2 size={12} /> Matriz / Filial (100%)</span>;
    }
    if (match.pass === 4) {
      return <span className="badge badge-info"><CheckCircle2 size={12} /> Regra De-Para (100%)</span>;
    }
    if (match.pass === 5) {
      return <span className="badge badge-success"><CheckCircle2 size={12} /> NF/Doc Exato (100%)</span>;
    }
    if (match.pass === 99) {
      return <span className="badge badge-primary"><Link size={12} /> Manual / Aprendido</span>;
    }
    return <span className="badge badge-info">{match.passName}</span>;
  };

  return (
    <div className="table-view-container" style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>
      
      {/* 1. Intelligent Suggestions Section (Juros / Descontos em Boletos) */}
      {suggestions.length > 0 && (
        <div style={{ background: 'rgba(245, 158, 11, 0.05)', padding: '16px 18px', borderRadius: 14, border: '1px solid rgba(245, 158, 11, 0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <Percent size={18} />
              Sugestões Inteligentes de Boletos com Juros ou Descontos ({suggestions.length})
            </h3>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              Mesmo CNPJ/Fornecedor com pequena variação de centavos
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {suggestions.map(sug => (
              <div
                key={sug.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--bg-card)',
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--border-secondary)',
                  gap: 12
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                  <span className={`badge ${sug.type === 'JUROS_MULTA' ? 'badge-warning' : 'badge-info'}`}>
                    {sug.type === 'JUROS_MULTA' ? `+ Juros R$ ${sug.diff.toFixed(2)}` : `- Desconto R$ ${sug.diff.toFixed(2)}`}
                  </span>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                    <strong>{sug.bankItem.description}</strong> (Banco: {formatCurrency(sug.bankItem.amount)}) <ArrowRightLeft size={12} style={{ display: 'inline', margin: '0 4px', verticalAlign: 'middle' }} /> <strong>{sug.supplierItem.description}</strong> (Fornecedor: {formatCurrency(sug.supplierItem.amount)})
                  </div>
                </div>

                <button
                  className="btn btn-primary"
                  style={{ padding: '4px 12px', fontSize: '0.74rem', whiteSpace: 'nowrap' }}
                  onClick={() => handleApproveSuggestion(sug)}
                >
                  <Check size={13} /> Aprovar Vínculo
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Conciliated Matches Section */}
      {filteredMatches.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
              Lançamentos Conciliados com Certeza ({filteredMatches.length})
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              Cruzamentos rigorosos com 100% de assertividade matemática
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredMatches.map(match => {
              const bank = match.bankItems[0];
              const supplier = (match.ledgerItems || match.supplierItems || [])[0];

              return (
                <div
                  key={match.id}
                  className="reconciliation-pair-card"
                  onClick={() => setSelectedMatch(match)}
                >
                  {/* Left: Bank Item */}
                  <div className="reconciliation-side bank-side">
                    <div className="side-header">
                      <span className="side-tag bank"><Landmark size={12} /> BANCO</span>
                      <span className="side-date">{bank?.date}</span>
                    </div>
                    <div className="side-desc" title={bank?.description}>
                      {bank?.description}
                    </div>
                    <div className="side-footer">
                      <span className="side-amount">{formatCurrency(bank?.amount)}</span>
                      {bank?.cnpj && <span className="side-cnpj">CNPJ: {bank.cnpj}</span>}
                    </div>
                  </div>

                  {/* Center: Match Details & Actions */}
                  <div className="reconciliation-center">
                    {getPassBadge(match)}
                    <div className="match-notes">{match.notes || 'Correspondência confirmada'}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMatch(match);
                        }}
                      >
                        <Eye size={12} /> Detalhes
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '3px 8px', fontSize: '0.7rem', color: 'var(--danger)' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeMatch(match.id);
                          addToast('Lançamento desvinculado.', 'info');
                        }}
                        title="Desvincular conciliação"
                      >
                        <Unlink size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Right: Supplier Item */}
                  <div className="reconciliation-side supplier-side">
                    <div className="side-header">
                      <span className="side-tag supplier"><Building2 size={12} /> FORNECEDOR</span>
                      <span className="side-date">{supplier?.date}</span>
                    </div>
                    <div className="side-desc" title={supplier?.description}>
                      {supplier?.description}
                    </div>
                    <div className="side-footer">
                      <span className="side-amount">{formatCurrency(supplier?.amount)}</span>
                      {supplier?.cnpj && <span className="side-cnpj">CNPJ: {supplier.cnpj}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Unmatched / Pending Items Section */}
      {(filteredMissingBank.length > 0 || filteredMissingSupplier.length > 0) && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={18} style={{ color: 'var(--warning)' }} />
              Lançamentos Pendentes ({filteredMissingBank.length + filteredMissingSupplier.length})
            </h3>

            {selectedBankId && selectedSupplierId && (
              <button className="btn btn-primary" onClick={handleManualPairing} style={{ padding: '6px 14px', fontSize: '0.78rem' }}>
                <Link size={14} /> Vincular Itens Selecionados (Aprender Regra)
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Missing in Supplier (Paid in bank without supplier entry) */}
            <div className="unmatched-column">
              <div className="unmatched-header bank">
                <span>🏦 Pendências no Banco ({filteredMissingBank.length})</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 400 }}>Saídas no banco sem baixa no fornecedor</span>
              </div>
              <div className="unmatched-list">
                {filteredMissingBank.map(item => {
                  const isSelected = selectedBankId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`unmatched-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedBankId(isSelected ? null : item.id)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        <span>📅 {item.date}</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(item.amount)}</strong>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', margin: '4px 0' }}>
                        {item.description}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--accent-primary)' }}>
                          {item.cnpj ? `CNPJ: ${item.cnpj}` : (item.document ? `Doc: ${item.document}` : '')}
                        </span>
                        {isSelected && <span className="badge badge-primary"><Check size={10} /> Selecionado</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Missing in Bank (Supplier entry without bank debit) */}
            <div className="unmatched-column">
              <div className="unmatched-header supplier">
                <span>🏢 Pendências no Fornecedor ({filteredMissingSupplier.length})</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 400 }}>Baixas no fornecedor sem saída no banco</span>
              </div>
              <div className="unmatched-list">
                {filteredMissingSupplier.map(item => {
                  const isSelected = selectedSupplierId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`unmatched-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedSupplierId(isSelected ? null : item.id)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        <span>📅 {item.date}</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(item.amount)}</strong>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', margin: '4px 0' }}>
                        {item.description}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--accent-primary)' }}>
                          {item.cnpj ? `CNPJ: ${item.cnpj}` : (item.document ? `Doc: ${item.document}` : '')}
                        </span>
                        {isSelected && <span className="badge badge-primary"><Check size={10} /> Selecionado</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {filteredMatches.length === 0 && suggestions.length === 0 && filteredMissingBank.length === 0 && filteredMissingSupplier.length === 0 && (
        <div className="empty-state" style={{ padding: '40px 0' }}>
          <h3>Nenhum resultado para os filtros atuais</h3>
          <p>Tente limpar a busca ou selecionar outro filtro de status.</p>
        </div>
      )}
    </div>
  );
}
