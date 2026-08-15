import useAppStore from '../../store/useAppStore';

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

export default function GraphStats() {
  const { reconciliationResult } = useAppStore();
  if (!reconciliationResult) return null;
  
  const { matches = [], reconciledRate = 0, missingInBank = [], missingInSupplier = [] } = reconciliationResult;

  const totalMatchedAmount = matches.reduce((sum, m) => sum + (m.bankItems?.[0]?.amount || 0), 0);
  const totalMissingBankAmount = missingInBank.reduce((sum, b) => sum + (b.amount || 0), 0);
  const totalMissingSupplierAmount = missingInSupplier.reduce((sum, s) => sum + (s.amount || 0), 0);

  return (
    <div className="graph-stats-overlay" style={{ display: 'flex', gap: 10, padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-secondary)', flexWrap: 'wrap' }}>
      <div className="stat-card success" style={{ padding: '4px 10px' }}>
        <div className="stat-value" style={{ fontSize: '0.9rem' }}>{formatCurrency(totalMatchedAmount)}</div>
        <div className="stat-label" style={{ fontSize: '0.68rem' }}>{matches.length} Conciliados ({reconciledRate}%)</div>
      </div>
      <div className="stat-card warning" style={{ padding: '4px 10px' }}>
        <div className="stat-value" style={{ fontSize: '0.9rem' }}>{formatCurrency(totalMissingBankAmount)}</div>
        <div className="stat-label" style={{ fontSize: '0.68rem' }}>{missingInBank.length} Pendências no Banco</div>
      </div>
      <div className="stat-card warning" style={{ padding: '4px 10px' }}>
        <div className="stat-value" style={{ fontSize: '0.9rem' }}>{formatCurrency(totalMissingSupplierAmount)}</div>
        <div className="stat-label" style={{ fontSize: '0.68rem' }}>{missingInSupplier.length} Pendências no Fornecedor</div>
      </div>
    </div>
  );
}
