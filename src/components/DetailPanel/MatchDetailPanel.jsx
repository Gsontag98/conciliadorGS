import { X, CheckCircle, XCircle, Brain } from 'lucide-react';
import useAppStore from '../../store/useAppStore';

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
const formatDate = (dateStr) => {
  if (!dateStr || !dateStr.includes('-')) return dateStr || '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
};

export default function MatchDetailPanel() {
  const { selectedMatch, setSelectedMatch, confirmMatch, rejectMatch, addToast } = useAppStore();

  if (!selectedMatch) return null;

  const bankItem = selectedMatch.bankItems?.[0];
  const supplierItem = selectedMatch.ledgerItems?.[0];

  const handleClose = () => setSelectedMatch(null);

  const handleConfirm = () => {
    confirmMatch(selectedMatch.id);
    addToast('✅ Match confirmado com sucesso!', 'success');
    setSelectedMatch(null);
  };

  const handleReject = () => {
    rejectMatch(selectedMatch.id);
    addToast('❌ Match rejeitado.', 'warning');
    setSelectedMatch(null);
  };

  const confidenceClass = selectedMatch.confidence >= 90 ? 'high' : selectedMatch.confidence >= 70 ? 'medium' : 'low';

  return (
    <>
      <div className={`detail-panel-overlay open`} onClick={handleClose} />
      <div className="detail-panel open">
        <div className="detail-panel-header">
          <h3>Detalhes do Match</h3>
          <button className="detail-panel-close" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        <div className="detail-panel-body">
          {/* Bank Item */}
          {bankItem && (
            <div className="detail-section">
              <div className="section-label bank">LANÇAMENTO BANCO</div>
              <div className="detail-row">
                <span className="label">Data</span>
                <span className="value">{formatDate(bankItem.date)}</span>
              </div>
              <div className="detail-row">
                <span className="label">Valor</span>
                <span className="value">{formatCurrency(bankItem.amount)}</span>
              </div>
              <div className="detail-row">
                <span className="label">Histórico</span>
                <span className="value" title={bankItem.description}>{bankItem.description}</span>
              </div>
              {bankItem.document && (
                <div className="detail-row">
                  <span className="label">Documento</span>
                  <span className="value">{bankItem.document}</span>
                </div>
              )}
            </div>
          )}

          {/* Supplier Item */}
          {supplierItem && (
            <div className="detail-section">
              <div className="section-label supplier">LANÇAMENTO FORNECEDOR</div>
              <div className="detail-row">
                <span className="label">Data</span>
                <span className="value">{formatDate(supplierItem.date)}</span>
              </div>
              <div className="detail-row">
                <span className="label">Valor</span>
                <span className="value">{formatCurrency(supplierItem.amount)}</span>
              </div>
              <div className="detail-row">
                <span className="label">Histórico</span>
                <span className="value" title={supplierItem.description}>{supplierItem.description}</span>
              </div>
              {supplierItem.document && (
                <div className="detail-row">
                  <span className="label">Documento</span>
                  <span className="value">{supplierItem.document}</span>
                </div>
              )}
            </div>
          )}

          {/* N:1 sub-items */}
          {selectedMatch.bankItems?.length > 1 && (
            <div className="detail-section">
              <div className="section-label">ITENS AGRUPADOS — BANCO ({selectedMatch.bankItems.length})</div>
              {selectedMatch.bankItems.slice(1).map((item, i) => (
                <div key={i} className="detail-row">
                  <span className="label">{formatDate(item.date)}</span>
                  <span className="value">{formatCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {selectedMatch.ledgerItems?.length > 1 && (
            <div className="detail-section">
              <div className="section-label">ITENS AGRUPADOS — FORNECEDOR ({selectedMatch.ledgerItems.length})</div>
              {selectedMatch.ledgerItems.slice(1).map((item, i) => (
                <div key={i} className="detail-row">
                  <span className="label">{formatDate(item.date)}</span>
                  <span className="value">{formatCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Match Info */}
          <div className="detail-section">
            <div className="section-label">INFORMAÇÕES DO MATCH</div>
            <div className="detail-row">
              <span className="label">Regra</span>
              <span className="value">{selectedMatch.passName}</span>
            </div>
            <div className="detail-row">
              <span className="label">Tipo</span>
              <span className="value">{selectedMatch.type || '1:1'}</span>
            </div>
            <div className="detail-row">
              <span className="label">Confiança</span>
              <span className="value">{selectedMatch.confidence}%</span>
            </div>
            <div className="confidence-bar">
              <div className={`fill ${confidenceClass}`} style={{ width: `${selectedMatch.confidence}%` }} />
            </div>
          </div>

          {/* AI Justification */}
          {selectedMatch.pass === 7 && selectedMatch.notes && (
            <div className="ai-justification">
              <div className="ai-label">
                <Brain size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                JUSTIFICATIVA IA GEMINI
              </div>
              <p style={{ margin: 0 }}>{selectedMatch.notes}</p>
            </div>
          )}
        </div>

        <div className="detail-actions">
          <button className="btn-confirm" onClick={handleConfirm}>
            <CheckCircle size={16} /> Confirmar
          </button>
          <button className="btn-reject" onClick={handleReject}>
            <XCircle size={16} /> Rejeitar
          </button>
        </div>
      </div>
    </>
  );
}
