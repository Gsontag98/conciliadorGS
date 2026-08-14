import FileDropzone from './FileDropzone';
import useAppStore from '../../store/useAppStore';
import { reconcile } from '../../engine/reconciler';
import { Play, Loader } from 'lucide-react';

export default function UploadPage() {
  const { bankFile, supplierFile, setReconciliationResult, setIsReconciling, setActivePage, isReconciling, setReconciliationProgress, addToast } = useAppStore();

  const handleReconcile = async () => {
    if (!bankFile || !supplierFile) return;
    setIsReconciling(true);
    try {
      const result = await reconcile(
        bankFile.items,
        supplierFile.items,
        {},
        (progress) => setReconciliationProgress(progress)
      );
      setReconciliationResult(result);
      setActivePage('graph');
      addToast(`Conciliação concluída! ${result.matches.length} matches encontrados (${result.reconciledRate}%)`, 'success');
    } catch (err) {
      addToast(`Erro na conciliação: ${err.message}`, 'error');
      setIsReconciling(false);
    }
  };

  return (
    <div className="upload-page fade-in">
      <div className="upload-header">
        <h1>Upload dos Razões Contábeis</h1>
        <p>Arraste os relatórios do Razão gerados no Sistema Domínio</p>
      </div>

      <div className="dropzone-grid">
        <FileDropzone type="bank" />
        <FileDropzone type="supplier" />
      </div>

      {bankFile && supplierFile && (
        <button
          className="btn-reconcile"
          onClick={handleReconcile}
          disabled={isReconciling}
        >
          {isReconciling ? (
            <><Loader className="spin" size={20} /> Processando Conciliação...</>
          ) : (
            <><Play size={20} /> Executar Conciliação Inteligente</>
          )}
        </button>
      )}
    </div>
  );
}
