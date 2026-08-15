import { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertCircle, Sliders, Terminal, Clipboard } from 'lucide-react';
import { parseFile } from '../../engine/parser.js';
import { autoDetect, normalizeData } from '../../engine/mapper.js';
import ColumnMappingModal from './ColumnMappingModal.jsx';
import DiagnosticModal from './DiagnosticModal.jsx';
import PasteDataModal from './PasteDataModal.jsx';
import useAppStore from '../../store/useAppStore.js';

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

export default function FileDropzone({ type }) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState('');
  const [rawSheetData, setRawSheetData] = useState(null);
  const [currentMapping, setCurrentMapping] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDiagOpen, setIsDiagOpen] = useState(false);
  const [isPasteOpen, setIsPasteOpen] = useState(false);

  const fileInputRef = useRef(null);
  const { setBankFile, setSupplierFile, addToast, bankFile, supplierFile } = useAppStore();

  const label = type === 'bank' ? 'Razão Conta Banco' : 'Razão Conta Fornecedor';
  const subtitle = type === 'bank' ? 'Créditos (saídas/pagamentos)' : 'Débitos (baixas de obrigações)';

  const processFile = async (file) => {
    if (!file) return;
    setError(null);
    setFileName(file.name);

    try {
      const parsed = await parseFile(file);
      setDiagnostics(parsed.diagnostics);

      // Check if any sheet has rawMatrix or rows
      let sheetData = null;
      let usedSheetName = '';

      for (const name of parsed.sheetNames) {
        const s = parsed.sheets[name];
        if (s && s.rawMatrix && s.rawMatrix.length > 0) {
          sheetData = s;
          usedSheetName = name;
          break;
        }
      }

      if (!sheetData || !sheetData.rawMatrix || sheetData.rawMatrix.length === 0) {
        throw new Error('Nenhum dado encontrado no arquivo. O arquivo parece estar vazio ou não foi possível decodificar.');
      }

      setRawSheetData(sheetData);

      const mapping = autoDetect(sheetData.headers);
      setCurrentMapping(mapping);

      const sourceName = type === 'bank' ? 'banco' : 'fornecedor';
      let items = [];
      if (sheetData.rows && sheetData.rows.length > 0) {
        items = normalizeData(sheetData.rows, mapping, sourceName);
      }

      const fileData = {
        name: file.name,
        size: file.size,
        parsed: sheetData,
        items,
        mapping,
        diagnostics: parsed.diagnostics
      };

      if (type === 'bank') setBankFile(fileData);
      else setSupplierFile(fileData);

      if (items.length > 0) {
        addToast(`✅ ${file.name}: ${items.length} lançamentos carregados com sucesso!`, 'success');
      } else {
        setError(`Lançamentos não associados automaticamente. Clique em "Ajustar Colunas" para selecionar.`);
        setIsModalOpen(true);
      }
    } catch (err) {
      console.error('File parsing error:', err);
      setError(err.message || 'Erro ao processar arquivo');
      addToast(`❌ Erro: ${err.message}`, 'error');
    }
  };

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const onFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const currentStoreFile = type === 'bank' ? bankFile : supplierFile;
  const hasLoadedItems = currentStoreFile?.items?.length > 0;

  return (
    <>
      <div
        className={`dropzone ${isDragging ? 'dragging' : ''} ${hasLoadedItems ? 'loaded' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={(e) => {
          if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
            fileInputRef.current?.click();
          }
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={onFileChange}
          accept=".xlsx,.xls,.xlsb,.csv,.txt,.xml"
        />

        {hasLoadedItems ? (
          <>
            <CheckCircle className="dropzone-icon" size={42} />
            <div className="dropzone-title">{currentStoreFile.name || fileName}</div>
            <div className="file-info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
              <span>✅ {currentStoreFile.items.length} lançamentos válidos</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDiagOpen(true);
                  }}
                >
                  <Terminal size={12} /> Diagnóstico
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsModalOpen(true);
                  }}
                >
                  <Sliders size={12} /> Ajustar Colunas
                </button>
              </div>
            </div>
            <table className="preview-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Valor</th>
                  <th>Histórico</th>
                </tr>
              </thead>
              <tbody>
                {currentStoreFile.items.slice(0, 4).map((item, rIdx) => (
                  <tr key={rIdx}>
                    <td>{item.date}</td>
                    <td>{formatCurrency(item.amount)}</td>
                    <td>{String(item.description || '').substring(0, 25)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <>
            <Upload className="dropzone-icon" size={42} />
            <div className="dropzone-title">{label}</div>
            <div className="dropzone-subtitle">{subtitle} — Arraste ou clique para selecionar (.xls, .xlsx)</div>
            
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
              <button
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.76rem', background: 'rgba(56, 189, 248, 0.08)', borderColor: 'rgba(56, 189, 248, 0.3)', color: 'var(--accent-primary)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPasteOpen(true);
                }}
              >
                <Clipboard size={13} /> Ou Colar Direto do Excel (Ctrl+V)
              </button>
            </div>
          </>
        )}

        {error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12, textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--danger)', fontSize: '0.78rem' }}>
              <AlertCircle size={14} style={{ minWidth: 14 }} />
              <span>{error}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPasteOpen(true);
                }}
              >
                <Clipboard size={14} /> Colar Direto do Excel (Ctrl+V)
              </button>
              {diagnostics && (
                <button
                  className="btn btn-secondary"
                  style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDiagOpen(true);
                  }}
                >
                  <Terminal size={14} /> Ver Diagnóstico
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <ColumnMappingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        sheetData={rawSheetData || currentStoreFile?.parsed}
        currentMapping={currentMapping || currentStoreFile?.mapping}
        fileName={fileName || currentStoreFile?.name}
        type={type}
      />

      <DiagnosticModal
        isOpen={isDiagOpen}
        onClose={() => setIsDiagOpen(false)}
        diagnostics={diagnostics || currentStoreFile?.diagnostics}
      />

      <PasteDataModal
        isOpen={isPasteOpen}
        onClose={() => setIsPasteOpen(false)}
        type={type}
      />
    </>
  );
}
