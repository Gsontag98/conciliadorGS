/**
 * GEMINI AI INTEGRATION ENGINE
 * Hyper-accurate semantic reconciliation using Google Gemini REST API
 */

const GeminiAI = (function () {

  const STORAGE_KEY = 'conciliador_gemini_api_key';

  /**
   * Get saved API Key
   */
  function getApiKey() {
    return localStorage.getItem(STORAGE_KEY) || '';
  }

  /**
   * Save API Key
   */
  function saveApiKey(key) {
    if (key) {
      localStorage.setItem(STORAGE_KEY, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  /**
   * Check if Gemini API is configured
   */
  function isConfigured() {
    return Boolean(getApiKey());
  }

  /**
   * Perform AI semantic reconciliation on unmapped transactions
   * @param {Array} unmappedBankItems - Remaining transactions in Razão Conta Banco
   * @param {Array} unmappedSupplierItems - Remaining transactions in Razão Conta Fornecedores
   * @returns {Promise<Array>} Matches produced by AI
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

    // Limit payload to max 50 items per call to keep response fast & focused
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
        temperature: 0.1, // Low temperature for high precision & assertiveness
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

    // Call Gemini API (gemini-2.5-flash or fallback model)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro na API do Gemini (${response.status}): ${errorText}`);
      }

      const responseData = await response.json();
      const rawJsonText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawJsonText) {
        console.warn('Gemini AI returned empty response.');
        return [];
      }

      const parsedResult = JSON.parse(rawJsonText);
      const aiMatches = parsedResult.matches || [];

      // Map back to internal object schema
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
      console.error('Falha na chamada da API Gemini:', err);
      alert(`Aviso: Ocorreu um erro ao comunicar com a IA Gemini: ${err.message}`);
      return [];
    }
  }

  return {
    getApiKey,
    saveApiKey,
    isConfigured,
    reconcileWithAI
  };

})();
