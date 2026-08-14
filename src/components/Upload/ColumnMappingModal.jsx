import { useState, useMemo } from 'react';
import { X, CheckCircle, Sliders, RefreshCw, Eye } from 'lucide-react';
import { normalizeData } from '../../engine/mapper';
import useAppStore from '../../store/useAppStore';

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

export default function ColumnMappingModal({ isOpen, onClose, sheetData, currentMapping, fileName, type }) {
  const { setBankFile, setSupplierFile, addToast } = useAppStore();

  const [dateCol, setDateCol] = useState(currentMapping?.date || '');
  const [amountCol, setAmountCol] = useState(currentMapping?.amount || '');
  const [debitCol, setDebitCol] = useState(currentMapping?.debit || '');
  const [creditCol, setCreditCol] = useState(currentMapping?.credit || '');
  const [descCol, setDescCol] = useState(currentMapping?.description || '');
  const [docCol, setDocCol] = useState(currentMapping?.document || '');

  const headers = sheetData?.headers || [];
  const rows = sheetData?.rows || [];

  const sourceName = type === 'bank' ? 'banco' : 'fornecedor';

  const mapping = useMemo(() => ({
    date: dateCol || undefined,
    amount: amountCol || undefined,
    debit: debitCol || undefined,
    credit: creditCol || undefined,
    description: descCol || undefined,
    document: docCol || undefined
  }), [dateCol, amountCol, debitCol, creditCol, descCol, docCol]);

  const simulatedItems = useMemo(() => {
    if (!rows.length) return [];
    try {
      return normalizeData(rows, mapping, sourceName);
    } catch {
      return [];
    }
  }, [rows, mapping, sourceName]);

  if (!isOpen) return null;

  const handleApply = () => {
    if (simulatedItems.length === 0) {
      addToast('⚠️ Nenhum lançamento foi reconhecido com as colunas selecionadas.', 'warning');
      return;
    }

    const fileData = {
      name: fileName,
      size: 0,
      parsed: sheetData,
      items: simulatedItems,
      mapping
    };

    if (type === 'bank') setBankFile(fileData);
    else setSupplierFile(fileData);

    addToast(`✅ Mapeamento atualizado! ${simulatedItems.length} lançamentos detectados.`, 'success');
    onClose();
  };

  return (
    <>
      <div className="detail-panel-overlay open" onClick={onClose} />
      <div className="detail-panel open" style={{ width: 560, maxWidth: '95vw' }}>
        <div className="detail-panel-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sliders size={18} />
            Mapeamento de Colunas — {type === 'bank' ? 'Banco' : 'Fornecedor'}
          </h3>
          <button className="detail-panel-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="detail-panel-body" style={{ gap: 16 }}>
          <div style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 10, border: '1px solid var(--border-secondary)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Arquivo: <strong style={{ color: 'var(--text-primary)' }}>{fileName}</strong> ({rows.length} linhas brutas)
          </div>

          <div className="detail-section">
            <div className="section-label">SELECIONE AS COLUNAS CORRESPONDENTES</div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">📅 Coluna de Data *</label>
              <select className="form-select" value={dateCol} onChange={(e) => setDateCol(e.target.value)}>
                <option value="">-- Detectar Automaticamente --</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            {type === 'bank' ? (
              <>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">💳 Coluna Crédito (Saídas / Pagamentos) *</label>
                  <select className="form-select" value={creditCol} onChange={(e) => setCreditCol(e.target.value)}>
                    <option value="">-- Nenhuma / Automático --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">💰 Ou Coluna Valor Único</label>
                  <select className="form-select" value={amountCol} onChange={(e) => setAmountCol(e.target.value)}>
                    <option value="">-- Nenhuma / Automático --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">📉 Coluna Débito (Baixas de Obrigação / Pagamentos) *</label>
                  <select className="form-select" value={debitCol} onChange={(e) => setDebitCol(e.target.value)}>
                    <option value="">-- Nenhuma / Automático --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">💰 Ou Coluna Valor Único</label>
                  <select className="form-select" value={amountCol} onChange={(e) => setAmountCol(e.target.value)}>
                    <option value="">-- Nenhuma / Automático --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </>
            )}

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">📝 Coluna Histórico / Descrição</label>
              <select className="form-select" value={descCol} onChange={(e) => setDescCol(e.target.value)}>
                <option value="">-- Detectar Automaticamente --</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">🔢 Coluna Documento / NF / Duplicata</label>
              <select className="form-select" value={docCol} onChange={(e) => setDocCol(e.target.value)}>
                <option value="">-- Detectar Automaticamente --</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          {/* Real-time preview */}
          <div className="detail-section">
            <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>PRÉVIA DOS LANÇAMENTOS RECONHECIDOS</span>
              <strong style={{ color: simulatedItems.length > 0 ? 'var(--success)' : 'var(--danger)' }}>
                {simulatedItems.length} reconhecidos
              </strong>
            </div>

            {simulatedItems.length > 0 ? (
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Valor</th>
                      <th>Histórico</th>
                      <th>Doc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulatedItems.slice(0, 5).map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.date}</td>
                        <td>{formatCurrency(item.amount)}</td>
                        <td title={item.description}>{item.description?.substring(0, 20)}</td>
                        <td>{item.document || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem', margin: 0 }}>
                Nenhum lançamento válido com a configuração atual. Ajuste as colunas de Data e Valor.
              </p>
            )}
          </div>
        </div>

        <div className="detail-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleApply} style={{ flex: 1 }}>
            <CheckCircle size={16} /> Aplicar Mapeamento
          </button>
        </div>
      </div>
    </>
  );
}
