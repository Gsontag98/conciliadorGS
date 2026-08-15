import { useState, useMemo } from 'react';
import { X, CheckCircle, Sliders, Eye, Table } from 'lucide-react';
import { normalizeData } from '../../engine/mapper.js';
import useAppStore from '../../store/useAppStore.js';

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

export default function ColumnMappingModal({ isOpen, onClose, sheetData, currentMapping, fileName, type }) {
  const { setBankFile, setSupplierFile, addToast } = useAppStore();

  const headers = sheetData?.headers || [];
  const rows = sheetData?.rows || [];
  const samples = sheetData?.samples || {};
  const rawMatrix = sheetData?.rawMatrix || [];

  const [dateCol, setDateCol] = useState(currentMapping?.date || headers.find(h => h.includes('Data')) || headers[0] || '');
  const [amountCol, setAmountCol] = useState(currentMapping?.amount || headers.find(h => h.includes('Valor')) || '');
  const [debitCol, setDebitCol] = useState(currentMapping?.debit || headers.find(h => h.includes('Débito')) || '');
  const [creditCol, setCreditCol] = useState(currentMapping?.credit || headers.find(h => h.includes('Crédito')) || '');
  const [descCol, setDescCol] = useState(currentMapping?.description || headers.find(h => h.includes('Histórico')) || headers[2] || '');
  const [docCol, setDocCol] = useState(currentMapping?.document || headers.find(h => h.includes('Lote') || h.includes('Doc')) || headers[1] || '');

  const [showRawTable, setShowRawTable] = useState(false);

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

  const formatOptionLabel = (h, idx) => {
    const sample = samples[idx];
    if (sample) {
      return `${h} — (Ex: ${sample.length > 25 ? sample.substring(0, 25) + '...' : sample})`;
    }
    return h;
  };

  return (
    <>
      <div className="detail-panel-overlay open" onClick={onClose} />
      <div className="detail-panel open" style={{ width: 620, maxWidth: '95vw' }}>
        <div className="detail-panel-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sliders size={18} />
            Mapeamento de Colunas — {type === 'bank' ? 'Razão Banco' : 'Razão Fornecedor'}
          </h3>
          <button className="detail-panel-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="detail-panel-body" style={{ gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-secondary)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <div>Arquivo: <strong style={{ color: 'var(--text-primary)' }}>{fileName}</strong> ({rawMatrix.length} linhas brutas)</div>
            <button
              className="btn btn-secondary"
              style={{ padding: '4px 8px', fontSize: '0.72rem' }}
              onClick={() => setShowRawTable(!showRawTable)}
            >
              <Table size={12} /> {showRawTable ? 'Ocultar Planilha' : 'Ver Planilha Bruta'}
            </button>
          </div>

          {showRawTable && rawMatrix.length > 0 && (
            <div style={{ maxHeight: 200, overflow: 'auto', background: 'var(--bg-secondary)', padding: 8, borderRadius: 8, border: '1px solid var(--border-secondary)' }}>
              <table className="preview-table" style={{ fontSize: '0.7rem' }}>
                <tbody>
                  {rawMatrix.slice(0, 10).map((row, rIdx) => (
                    <tr key={rIdx}>
                      <td style={{ fontWeight: 700, color: 'var(--text-dim)', width: 30 }}>{rIdx + 1}</td>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx}>{cell !== null && cell !== undefined ? String(cell).substring(0, 20) : '-'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="detail-section">
            <div className="section-label">SELECIONE AS COLUNAS CORRESPONDENTES</div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">📅 Coluna de Data *</label>
              <select className="form-select" value={dateCol} onChange={(e) => setDateCol(e.target.value)}>
                <option value="">-- Selecione a coluna de Data --</option>
                {headers.map((h, i) => <option key={h} value={h}>{formatOptionLabel(h, i)}</option>)}
              </select>
            </div>

            {type === 'bank' ? (
              <>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">💳 Coluna Crédito (Saídas / Pagamentos a Fornecedores) *</label>
                  <select className="form-select" value={creditCol} onChange={(e) => setCreditCol(e.target.value)}>
                    <option value="">-- Nenhuma / Automático --</option>
                    {headers.map((h, i) => <option key={h} value={h}>{formatOptionLabel(h, i)}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">📥 Coluna Débito (Entradas / Resgates)</label>
                  <select className="form-select" value={debitCol} onChange={(e) => setDebitCol(e.target.value)}>
                    <option value="">-- Nenhuma / Automático --</option>
                    {headers.map((h, i) => <option key={h} value={h}>{formatOptionLabel(h, i)}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">💰 Ou Coluna Valor Único</label>
                  <select className="form-select" value={amountCol} onChange={(e) => setAmountCol(e.target.value)}>
                    <option value="">-- Nenhuma / Automático --</option>
                    {headers.map((h, i) => <option key={h} value={h}>{formatOptionLabel(h, i)}</option>)}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">📉 Coluna Débito (Baixas de Obrigação / Pagamentos) *</label>
                  <select className="form-select" value={debitCol} onChange={(e) => setDebitCol(e.target.value)}>
                    <option value="">-- Nenhuma / Automático --</option>
                    {headers.map((h, i) => <option key={h} value={h}>{formatOptionLabel(h, i)}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">📑 Coluna Crédito (Entradas de NF / Obrigações)</label>
                  <select className="form-select" value={creditCol} onChange={(e) => setCreditCol(e.target.value)}>
                    <option value="">-- Nenhuma / Automático --</option>
                    {headers.map((h, i) => <option key={h} value={h}>{formatOptionLabel(h, i)}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">💰 Ou Coluna Valor Único</label>
                  <select className="form-select" value={amountCol} onChange={(e) => setAmountCol(e.target.value)}>
                    <option value="">-- Nenhuma / Automático --</option>
                    {headers.map((h, i) => <option key={h} value={h}>{formatOptionLabel(h, i)}</option>)}
                  </select>
                </div>
              </>
            )}

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">📝 Coluna Histórico / Descrição</label>
              <select className="form-select" value={descCol} onChange={(e) => setDescCol(e.target.value)}>
                <option value="">-- Detectar Automaticamente --</option>
                {headers.map((h, i) => <option key={h} value={h}>{formatOptionLabel(h, i)}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">🔢 Coluna Documento / Lote / NF</label>
              <select className="form-select" value={docCol} onChange={(e) => setDocCol(e.target.value)}>
                <option value="">-- Detectar Automaticamente --</option>
                {headers.map((h, i) => <option key={h} value={h}>{formatOptionLabel(h, i)}</option>)}
              </select>
            </div>
          </div>

          {/* Live Preview */}
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
                      <th>Tipo</th>
                      <th>Histórico</th>
                      <th>CNPJ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulatedItems.slice(0, 6).map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.date}</td>
                        <td style={{ fontWeight: 600 }}>{formatCurrency(item.amount)}</td>
                        <td><span className="badge">{item.movementType}</span></td>
                        <td title={item.description}>{item.description?.substring(0, 25)}...</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>{item.cnpj || item.document || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem', margin: 0 }}>
                Nenhum lançamento válido com a configuração atual. Selecione as colunas de Data e Crédito/Débito.
              </p>
            )}
          </div>
        </div>

        <div className="detail-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleApply} style={{ flex: 1 }}>
            <CheckCircle size={16} /> Aplicar Mapeamento ({simulatedItems.length} itens)
          </button>
        </div>
      </div>
    </>
  );
}
