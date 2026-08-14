import { useState, useEffect } from 'react';
import { Brain, Eye, EyeOff, Save, Trash2, Zap } from 'lucide-react';
import { getApiKey, saveApiKey, getPreferredModel, savePreferredModel } from '../../engine/ai';
import useAppStore from '../../store/useAppStore';

export default function AIConfigPanel() {
  const [apiKey, setApiKeyLocal] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState('gemini-2.0-flash');
  const [testing, setTesting] = useState(false);
  const { addToast } = useAppStore();

  useEffect(() => {
    setApiKeyLocal(getApiKey());
    setModel(getPreferredModel());
  }, []);

  const handleSave = () => {
    saveApiKey(apiKey.trim());
    savePreferredModel(model);
    addToast(`✅ Configurações salvas! Modelo: ${model}`, 'success');
  };

  const handleRemove = () => {
    setApiKeyLocal('');
    saveApiKey('');
    addToast('Chave de API removida.', 'info');
  };

  const handleTest = async () => {
    if (!apiKey.trim()) {
      addToast('⚠️ Insira uma chave de API antes de testar.', 'warning');
      return;
    }
    setTesting(true);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Responda apenas: OK' }] }] })
        }
      );
      if (response.ok) addToast('✅ Conexão com Gemini API bem-sucedida!', 'success');
      else if (response.status === 429) addToast('⚠️ API respondeu, mas cota temporária atingida. Tente outro modelo.', 'warning');
      else addToast(`❌ Erro ${response.status} na API. Verifique a chave.`, 'error');
    } catch {
      addToast('❌ Falha na conexão com a API.', 'error');
    }
    setTesting(false);
  };

  return (
    <div className="settings-page fade-in">
      <div className="settings-card">
        <h2><Brain size={22} /> Configuração de IA — Gemini</h2>
        <p className="settings-desc">
          Configure a API do Google Gemini para ativar o Passe 7 de conciliação semântica com inteligência artificial.
        </p>

        <div className="form-group">
          <label className="form-label">Chave de API do Google Gemini (GEMINI_API_KEY)</label>
          <div className="form-input-group">
            <input
              className="form-input"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKeyLocal(e.target.value)}
              placeholder="AIzaSy..."
              style={{ fontFamily: 'monospace' }}
            />
            <button className="toggle-visibility" onClick={() => setShowKey(!showKey)}>
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            Obtenha gratuitamente em <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-accent)' }}>Google AI Studio</a>. Armazenada localmente no navegador.
          </span>
        </div>

        <div className="form-group">
          <label className="form-label">Modelo Preferencial</label>
          <select className="form-select" value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="gemini-2.0-flash">Gemini 2.0 Flash (Padrão — 15 RPM grátis)</option>
            <option value="gemini-1.5-flash">Gemini 1.5 Flash (Maior limite grátis)</option>
            <option value="gemini-2.5-flash">Gemini 2.5 Flash (Mais inteligente — 5 RPM)</option>
          </select>
          <p className="model-hint">RPM = Requisições por minuto no plano gratuito do Google.</p>
        </div>

        <div className="btn-group" style={{ justifyContent: 'space-between', marginTop: 20 }}>
          <button className="btn btn-test" onClick={handleTest} disabled={testing || !apiKey.trim()}>
            <Zap size={16} /> {testing ? 'Testando...' : 'Testar Conexão'}
          </button>
          <div className="btn-group">
            <button className="btn btn-danger" onClick={handleRemove}>
              <Trash2 size={16} /> Remover
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              <Save size={16} /> Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
