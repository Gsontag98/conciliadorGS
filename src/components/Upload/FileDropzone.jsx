import { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { parseFile } from '../../engine/parser';
import { autoDetect, normalizeData } from '../../engine/mapper';
import useAppStore from '../../store/useAppStore';

export default function FileDropzone({ type }) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);
  const { setBankFile, setSupplierFile, addToast } = useAppStore();

  const label = type === 'bank' ? 'Razão Conta Banco' : 'Razão Conta Fornecedor';
  const subtitle = type === 'bank' ? 'Créditos (saídas/pagamentos)' : 'Débitos (baixas de obrigações)';

  const processFile = async (file) => {
    if (!file) return;
    setError(null);
    setFileName(file.name);

    try {
      const parsed = await parseFile(file);
      // Use first sheet
      const sheetName = parsed.sheetNames[0];
      const sheetData = parsed.sheets[sheetName];

      if (!sheetData || !sheetData.headers || sheetData.rows.length === 0) {
        throw new Error('Nenhum dado encontrado no arquivo. Verifique se o relatório possui cabeçalhos válidos.');
      }

      const mapping = autoDetect(sheetData.headers);
      const sourceName = type === 'bank' ? 'banco' : 'fornecedor';
      const items = normalizeData(sheetData.rows, mapping, sourceName);

      if (items.length === 0) {
        throw new Error('Nenhum lançamento válido encontrado. Verifique se o arquivo possui datas e valores.');
      }

      const fileData = {
        name: file.name,
        size: file.size,
        parsed: sheetData,
        items,
        mapping
      };

      setPreview({
        headers: sheetData.headers.slice(0, 6),
        sampleRows: sheetData.rows.slice(0, 5),
        itemCount: items.length
      });

      if (type === 'bank') setBankFile(fileData);
      else setSupplierFile(fileData);

      addToast(`✅ ${file.name}: ${items.length} lançamentos carregados`, 'success');
    } catch (err) {
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

  const classNames = `dropzone ${isDragging ? 'dragging' : ''} ${preview ? 'loaded' : ''}`;

  return (
    <div
      className={classNames}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={onFileChange}
        accept=".xlsx,.xls,.csv"
      />

      {preview ? (
        <>
          <CheckCircle className="dropzone-icon" size={42} />
          <div className="dropzone-title">{fileName}</div>
          <div className="file-info">
            ✅ {preview.itemCount} lançamentos válidos detectados
          </div>
          <table className="preview-table">
            <thead>
              <tr>
                {preview.headers.map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.sampleRows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {preview.headers.map((h, cIdx) => (
                    <td key={cIdx}>{String(row[h] ?? '').substring(0, 25)}</td>
                  ))}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, color: 'var(--danger)', fontSize: '0.78rem' }}>
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
