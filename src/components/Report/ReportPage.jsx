import { Download, CheckCircle, AlertTriangle, Brain, HelpCircle } from 'lucide-react';
import useAppStore from '../../store/useAppStore';
import { exportReport } from '../../engine/exporter';

export default function ReportPage() {
  const { reconciliationResult } = useAppStore();

  if (!reconciliationResult) {
    return (
      <div className="report-page">
        <div className="empty-state">
          <HelpCircle size={48} className="empty-icon" />
          <h3>Nenhuma conciliação realizada ainda</h3>
          <p>Faça o upload dos razões contábeis e execute a conciliação para visualizar o relatório.</p>
        </div>
      </div>
    );
  }

  const { totalBankCount, totalSupplierCount, matches, missingInBank, missingInSupplier, reconciledRate } = reconciliationResult;

  const aiMatchesCount = matches.filter(m => m.pass === 7).length;
  const pendingCount = (missingInBank?.length || 0) + (missingInSupplier?.length || 0);

  const passBreakdown = matches.reduce((acc, match) => {
    acc[match.pass] = (acc[match.pass] || 0) + 1;
    return acc;
  }, {});

  const passInfo = [
    { pass: 1, name: 'Match 100% Exato (CNPJ + Valor)', confidence: '100%', color: 'var(--success)' },
    { pass: 2, name: 'Match 100% Exato (NF/Doc + Valor)', confidence: '100%', color: 'var(--success)' },
    { pass: 3, name: 'Match Exato (Valor + Data + Nome)', confidence: '100%', color: 'var(--success)' },
    { pass: 4, name: 'Similaridade de Fornecedor (Valor Exato)', confidence: '95%', color: 'var(--info)' },
    { pass: 5, name: 'Soma Combinatória N:1 (Valor Exato)', confidence: '90%', color: 'var(--info)' },
    { pass: 99, name: 'Conciliação Manual do Usuário', confidence: '100%', color: 'var(--accent-primary)' },
  ];

  return (
    <div className="report-page fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)' }}>Resumo da Conciliação</h1>
        <button className="btn btn-primary" onClick={() => exportReport(reconciliationResult)}>
          <Download size={16} /> Exportar Excel
        </button>
      </div>

      <div className="report-summary">
        <div className="report-card">
          <div className="card-value" style={{ color: 'var(--text-primary)' }}>{totalBankCount}</div>
          <div className="card-label">Total Banco</div>
        </div>
        <div className="report-card">
          <div className="card-value" style={{ color: 'var(--text-primary)' }}>{totalSupplierCount}</div>
          <div className="card-label">Total Fornecedor</div>
        </div>
        <div className="report-card">
          <div className="card-value" style={{ color: 'var(--success)' }}>{matches.length}</div>
          <div className="card-label"><CheckCircle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Conciliados</div>
        </div>
        <div className="report-card">
          <div className="card-value" style={{ color: 'var(--info)' }}>{reconciledRate}%</div>
          <div className="card-label">Taxa de Conciliação</div>
        </div>
        <div className="report-card">
          <div className="card-value" style={{ color: 'var(--ai)' }}>{aiMatchesCount}</div>
          <div className="card-label"><Brain size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> IA Matches</div>
        </div>
        <div className="report-card">
          <div className="card-value" style={{ color: 'var(--warning)' }}>{pendingCount}</div>
          <div className="card-label"><AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Pendentes</div>
        </div>
      </div>

      <div className="settings-card" style={{ marginTop: 24 }}>
        <h2 style={{ marginBottom: 16, fontSize: '1rem' }}>Detalhamento por Passe</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--border-secondary)', color: 'var(--text-dim)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase' }}>Passe</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--border-secondary)', color: 'var(--text-dim)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase' }}>Descrição</th>
              <th style={{ textAlign: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border-secondary)', color: 'var(--text-dim)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase' }}>Confiança</th>
              <th style={{ textAlign: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border-secondary)', color: 'var(--text-dim)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase' }}>Matches</th>
            </tr>
          </thead>
          <tbody>
            {passInfo.map(p => (
              <tr key={p.pass}>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-secondary)', color: p.color, fontWeight: 700 }}>Passe {p.pass}</td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-secondary)', color: 'var(--text-secondary)' }}>{p.name}</td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-secondary)', textAlign: 'center', color: 'var(--text-dim)' }}>{p.confidence}</td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-secondary)', textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)' }}>{passBreakdown[p.pass] || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
