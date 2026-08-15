import { useState } from 'react';
import { Clipboard, CheckCircle, X, AlertCircle } from 'lucide-react';
import { processRawMatrix } from '../../engine/parser.js';
import { autoDetect, normalizeData } from '../../engine/mapper.js';
import useAppStore from '../../store/useAppStore.js';

export default function PasteDataModal({ isOpen, onClose, type }) {
  const [pasteText, setPasteText] = useState('');
  const [error, setError] = useState(null);
  const { setBankFile, setSupplierFile, addToast } = useAppStore();

  if (!isOpen) return null;

  const handleProcessPaste = () => {
    setError(null);
    if (!pasteText.trim()) {
      setError('Por favor, cole os dados copiados do Excel.');
      return;
    }

    try {
      const lines = pasteText.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length === 0) {
        throw new Error('Nenhum dado encontrado no texto colado.');
      }

      // Parse TSV (standard clipboard format from Excel)
      const matrix = lines.map(line => line.split('\t').map(c => c.trim()));
      const parsed = processRawMatrix(matrix);

      if (!parsed.rows || parsed.rows.length === 0) {
        throw new Error('Não foi possível identificar linhas de lançamentos nos dados colados.');
      }

      const mapping = autoDetect(parsed.headers);
      const sourceName = type === 'bank' ? 'banco' : 'fornecedor';
      const items = normalizeData(parsed.rows, mapping, sourceName);

      if (items.length === 0) {
        throw new Error(`Dados lidos (${parsed.rows.length} linhas), mas nenhum lançamento com data e valor foi encontrado.`);
      }

      const fileData = {
        name: `Colado do Excel (${type === 'bank' ? 'Banco' : 'Fornecedor'})`,
        size: pasteText.length,
        parsed,
        items,
        mapping
      };

      if (type === 'bank') setBankFile(fileData);
      else setSupplierFile(fileData);

      addToast(`✅ ${items.length} lançamentos colados e processados com sucesso!`, 'success');
      setPasteText('');
      onClose();
    } catch (err) {
      setError(err.message || 'Erro ao processar dados colados.');
    }
  };

  return (
    <>
      <div className="detail-panel-overlay open" onClick={onClose} />
      <div className="detail-panel open" style={{ width: 640, maxWidth: '95vw' }}>
        <div className="detail-panel-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clipboard size={18} />
            Colar Dados Direto do Excel — {type === 'bank' ? 'Razão Banco' : 'Razão Fornecedor'}
          </h3>
          <button className="detail-panel-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="detail-panel-body" style={{ gap: 14 }}>
          <div style={{ background: 'var(--bg-card)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-secondary)', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            💡 <strong>Instruções rápidas:</strong>
            <ol style={{ margin: '6px 0 0 18px', padding: 0 }}>
              <li>Abra seu relatório do Razão no Excel.</li>
              <li>Pressione <kbd style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border-primary)' }}>Ctrl + A</kbd> para selecionar tudo e <kbd style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border-primary)' }}>Ctrl + C</kbd> para copiar.</li>
              <li>Clique na caixa abaixo e pressione <kbd style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border-primary)' }}>Ctrl + V</kbd>.</li>
            </ol>
          </div>

          <div className="form-group">
            <textarea
              className="form-input"
              rows={12}
              placeholder="Cole os dados aqui com Ctrl + V..."
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre', resize: 'vertical' }}
            />
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--danger)', fontSize: '0.8rem' }}>
              <AlertCircle size={14} style={{ minWidth: 14 }} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="detail-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleProcessPaste} style={{ flex: 1 }}>
            <CheckCircle size={16} /> Processar Dados Colados
          </button>
        </div>
      </div>
    </>
  );
}
