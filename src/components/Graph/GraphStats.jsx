import useAppStore from '../../store/useAppStore';

export default function GraphStats() {
  const { reconciliationResult } = useAppStore();
  if (!reconciliationResult) return null;
  
  const { matches, totalBankCount, totalSupplierCount, reconciledRate, missingInBank, missingInSupplier } = reconciliationResult;
  const aiMatches = matches.filter(m => m.pass === 7).length;
  
  return (
    <div className="graph-stats-overlay">
      <div className="stat-card success">
        <div className="stat-value">{matches.length}</div>
        <div className="stat-label">Conciliados</div>
      </div>
      <div className="stat-card info">
        <div className="stat-value">{reconciledRate}%</div>
        <div className="stat-label">Taxa</div>
      </div>
      {aiMatches > 0 && (
        <div className="stat-card ai">
          <div className="stat-value">{aiMatches}</div>
          <div className="stat-label">IA Matches</div>
        </div>
      )}
      <div className="stat-card warning">
        <div className="stat-value">{missingInBank.length + missingInSupplier.length}</div>
        <div className="stat-label">Pendentes</div>
      </div>
    </div>
  );
}
