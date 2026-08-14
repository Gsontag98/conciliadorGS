/**
 * GEMINI AI INTEGRATION ENGINE (WITH MODEL FALLBACK & RATE-LIMIT BACKOFF)
 * Hyper-accurate semantic reconciliation using Google Gemini REST API
 */

const GeminiAI = (function () {

  const STORAGE_KEY = 'conciliador_gemini_api_key';
  const MODEL_KEY = 'conciliador_gemini_model';

  // Fallback models in priority order
  const MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ];

  function getApiKey() {
    return localStorage.getItem(STORAGE_KEY) || '';
  }

  function saveApiKey(key) {
    if (key) {
      localStorage.setItem(STORAGE_KEY, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function getPreferredModel() {
    return localStorage.getItem(MODEL_KEY) || MODELS[0];
  }

  function savePreferredModel(model) {
    localStorage.setItem(MODEL_KEY, model);
  }

  function isConfigured() {
    return Boolean(getApiKey());
  }

  /**
   * Helper delay promise
   */
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Single API Call attempt for a specific model
   */
  async function callGeminiApi(modelName, apiKey, payload) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return response;
  }

  /**
   * Perform AI semantic reconciliation on unmapped transactions
   */
  async function reconcileWithAI(unmappedBankItems, unmappedSupplierItems) {
    const apiKey = getApiKey();
    if (!apiKey) {
      console.warn('Gemini API key is not configured.');
      return [];
    }

    if (unmappedBankItems.length === 0 || unmappedSupplierItems.length === 0) {
      return [];
    }

    const bankBatch = unmappedBankItems.slice(0, 40).map(b => ({
      id: b.id,
      data: b.date,
      valor: b.amount,
      historico: b.description,
      documento: b.document || ''
    }));

    const supplierBatch = unmappedSupplierItems.slice(0, 40).map(s => ({
      id: s.id,
      data: s.date,
      valor: s.amount,
      historico: s.description,
      documento: s.document || ''
    }));

    const systemPrompt = `Você é um Auditor Contábil Senior especialista no Sistema Domínio.
Sua missão é realizar a CONCILIAÇÃO SEMÂNTICA DE ALTA ASSERTIVIDADE entre o Razão da Conta Banco (saídas/pagamentos) e o Razão da Conta Fornecedores (baixas de obrigações).

REGRAS DE CONCILIAÇÃO:
1. Compare os lançamentos do Banco com os lançamentos do Fornecedor.
2. Os valores devem ser idênticos ou muito próximos (diferença máxima de 2% para descontos/juros/tarifas).
3. As datas devem estar no mesmo período ou com diferença de poucos dias (compensação bancária).
4. Analise semanticamente os nomes dos fornecedores, razões sociais, nomes fantasia, siglas, números de notas fiscais (NFs) ou títulos contidos no histórico.
   Exemplo: "PIX TRANSF 4521 FINKELSTEIN" no Banco é o mesmo que "JOSE FINKELSTEIN & CIA LTDA" no Fornecedor.
5. Retorne SOMENTE combinações com alta certeza de que correspondem ao mesmo fato gerador contábil.
6. Forneça uma justificativa clara em português para cada match aceito.`;

    const userPrompt = `Analise os seguintes lançamentos pendentes de conciliação:

LANÇAMENTOS DA CONTA BANCO:
${JSON.stringify(bankBatch, null, 2)}

LANÇAMENTOS DA CONTA FORNECEDORES:
${JSON.stringify(supplierBatch, null, 2)}

Encontre os correspondentes exatos ou semânticos entre os dois lados.`;

    const payload = {
      contents: [{
        parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
      }],
      generationConfig: {
        temperature: 0.1,
        topP: 0.95,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            matches: {
              type: "ARRAY",
              description: "Lista de pares conciliados com alta assertividade",
              items: {
                type: "OBJECT",
                properties: {
                  bankId: { type: "STRING", description: "ID do lançamento da Conta Banco" },
                  supplierId: { type: "STRING", description: "ID do lançamento da Conta Fornecedor" },
                  confidence: { type: "INTEGER", description: "Nível de confiança de 70 a 100" },
                  justificativa: { type: "STRING", description: "Explicação lógica detalhada do match" }
                },
                required: ["bankId", "supplierId", "confidence", "justificativa"]
              }
            }
          },
          required: ["matches"]
        }
      }
    };

    // Try primary model first, then fallback models if 429 rate limit is hit
    const modelChain = [getPreferredModel(), ...MODELS.filter(m => m !== getPreferredModel())];
    let response = null;
    let lastErrorStatus = null;

    for (let m = 0; m < modelChain.length; m++) {
      const currentModel = modelChain[m];
      try {
        console.log(`🤖 Chamando API Gemini (${currentModel})...`);
        response = await callGeminiApi(currentModel, apiKey, payload);

        if (response.ok) {
          break; // Success!
        }

        lastErrorStatus = response.status;

        if (response.status === 429) {
          console.warn(`Cota atingida (429) no modelo ${currentModel}. Tentando modelo reserva em 3s...`);
          await delay(3000); // 3 second backoff delay
        } else {
          console.error(`Erro ${response.status} no modelo ${currentModel}`);
        }

      } catch (e) {
        console.error(`Falha na requisição para ${currentModel}:`, e);
      }
    }

    if (!response || !response.ok) {
      if (lastErrorStatus === 429) {
        alert('⚠️ A cota gratuita da API do Gemini foi temporariamente atingida (Limite de requisições por minuto do Google).\n\nA conciliação continuará normalmente com os 6 passes algorítmicos. Aguarde alguns segundos para tentar utilizar a IA novamente.');
      } else {
        alert('⚠️ Não foi possível conectar à API do Gemini no momento. A conciliação continuará com os passes algorítmicos.');
      }
      return [];
    }

    try {
      const responseData = await response.json();
      const rawJsonText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawJsonText) return [];

      const parsedResult = JSON.parse(rawJsonText);
      const aiMatches = parsedResult.matches || [];

      const results = [];
      aiMatches.forEach(m => {
        const bnkItem = unmappedBankItems.find(b => b.id === m.bankId);
        const supItem = unmappedSupplierItems.find(s => s.id === m.supplierId);

        if (bnkItem && supItem) {
          results.push({
            id: `match_ai_${Date.now()}_${results.length}`,
            pass: 7,
            passName: '🤖 Passe IA Gemini',
            confidence: Math.min(100, Math.max(70, m.confidence)),
            badgeClass: 'badge-ai',
            type: '1:1',
            ledgerItems: [supItem],
            bankItems: [bnkItem],
            notes: `🤖 Análise Semântica IA Gemini: ${m.justificativa}`
          });
        }
      });

      return results;

    } catch (err) {
      console.error('Erro ao processar JSON da IA:', err);
      return [];
    }
  }

  return {
    MODELS,
    getApiKey,
    saveApiKey,
    getPreferredModel,
    savePreferredModel,
    isConfigured,
    reconcileWithAI
  };

})();
