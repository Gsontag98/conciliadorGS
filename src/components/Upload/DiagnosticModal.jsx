import { useState } from 'react';
import { Terminal, Copy, Check, X, AlertTriangle, FileText, Cpu } from 'lucide-react';

export default function DiagnosticModal({ isOpen, onClose, diagnostics }) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !diagnostics) return null;

  const handleCopy = () => {
    const fullLog = [
      `=== DIAGNÓSTICO DO ARQUIVO CONCILIADOR GS ===`,
      `Arquivo: ${diagnostics.fileName}`,
      `Tamanho: ${(diagnostics.fileSize / 1024).toFixed(2)} KB`,
      `Tipo Detectado: ${diagnostics.fileType}`,
      `Assinatura Hex (Primeiros 32 bytes): ${diagnostics.hexPreview}`,
      `ASCII: ${diagnostics.asciiPreview}`,
      `----------------------------------------`,
      `LOGS DE EXECUÇÃO:`,
      ...(diagnostics.logs || [])
    ].join('\n');

    navigator.clipboard.writeText(fullLog);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <>
      <div className="detail-panel-overlay open" onClick={onClose} />
      <div className="detail-panel open" style={{ width: 680, maxWidth: '95vw' }}>
        <div className="detail-panel-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Terminal size={18} />
            Diagnóstico e Estrutura do Arquivo
          </h3>
          <button className="detail-panel-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="detail-panel-body" style={{ gap: 16 }}>
          {/* Metadata Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div style={{ background: 'var(--bg-card)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-secondary)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <FileText size={12} /> ARQUIVO
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                {diagnostics.fileName}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                {(diagnostics.fileSize / 1024).toFixed(1)} KB
              </div>
            </div>

            <div style={{ background: 'var(--bg-card)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-secondary)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Cpu size={12} /> FORMATO INTERNO
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-primary)' }}>
                {diagnostics.fileType}
              </div>
              <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: 'var(--text-dim)', marginTop: 2 }}>
                Hex: {diagnostics.hexPreview?.substring(0, 17)}
              </div>
            </div>
          </div>

          {/* Hex preview */}
          <div className="detail-section">
            <div className="section-label">ASSINATURA BINÁRIA (PRIMEIROS 32 BYTES)</div>
            <div style={{ background: 'var(--bg-primary)', padding: '10px 14px', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)', overflowX: 'auto' }}>
              <div style={{ color: 'var(--accent-primary)', marginBottom: 4 }}>HEX: {diagnostics.hexPreview}</div>
              <div style={{ color: 'var(--text-dim)' }}>ASCII: {diagnostics.asciiPreview}</div>
            </div>
          </div>

          {/* Execution Log */}
          <div className="detail-section">
            <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>LOG DE EXECUÇÃO PASSO-A-PASSO</span>
              <span className="badge">{diagnostics.logs?.length || 0} eventos</span>
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto', background: '#090d16', padding: '12px 14px', borderRadius: 8, fontFamily: 'Consolas, Monaco, monospace', fontSize: '0.75rem', color: '#38bdf8', lineHeight: 1.6, border: '1px solid var(--border-primary)' }}>
              {diagnostics.logs?.map((log, idx) => (
                <div key={idx} style={{ color: log.includes('ERRO') ? '#f87171' : (log.includes('AVISO') ? '#fbbf24' : (log.includes('OK') ? '#4ade80' : '#94a3b8')) }}>
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="detail-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
          <button className="btn btn-primary" onClick={handleCopy} style={{ flex: 1 }}>
            {copied ? <><Check size={16} /> Diagnóstico Copiado!</> : <><Copy size={16} /> Copiar Diagnóstico Completo</>}
          </button>
        </div>
      </div>
    </>
  );
}
