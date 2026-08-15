import { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertCircle, Sliders } from 'lucide-react';
import { parseFile } from '../../engine/parser.js';
import { autoDetect, normalizeData } from '../../engine/mapper.js';
import ColumnMappingModal from './ColumnMappingModal.jsx';
import useAppStore from '../../store/useAppStore.js';

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

export default function FileDropzone({ type }) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState('');
  const [rawSheetData, setRawSheetData] = useState(null);
  const [currentMapping, setCurrentMapping] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
        throw new Error('Nenhum dado encontrado no arquivo. O arquivo parece estar vazio.');
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
        mapping
      };

      if (type === 'bank') setBankFile(fileData);
      else setSupplierFile(fileData);

      if (items.length > 0) {
        setPreview({
          headers: sheetData.headers.slice(0, 6),
          sampleRows: sheetData.rows.slice(0, 5),
          itemCount: items.length
        });
        addToast(`✅ ${file.name}: ${items.length} lançamentos carregados`, 'success');
      } else {
        setError(`Lançamentos não detectados automaticamente. Clique em "Mapear Colunas Manualmente" para selecionar.`);
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
          accept=".xlsx,.xls,.xlsb,.csv"
        />

        {hasLoadedItems ? (
          <>
            <CheckCircle className="dropzone-icon" size={42} />
            <div className="dropzone-title">{currentStoreFile.name || fileName}</div>
            <div className="file-info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>✅ {currentStoreFile.items.length} lançamentos válidos</span>
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
            <div className="dropzone-subtitle">{subtitle} — Arraste ou clique para selecionar (.xlsx)</div>
          </>
        )}

        {error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12, textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--danger)', fontSize: '0.78rem' }}>
              <AlertCircle size={14} style={{ minWidth: 14 }} />
              <span>{error}</span>
            </div>
            {rawSheetData && (
              <button
                className="btn btn-primary"
                style={{ width: 'fit-content', padding: '6px 12px', fontSize: '0.75rem', marginTop: 4 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsModalOpen(true);
                }}
              >
                <Sliders size={14} /> Mapear Colunas Manualmente
              </button>
            )}
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
    </>
  );
}
