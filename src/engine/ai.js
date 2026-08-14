const STORAGE_KEY = 'conciliador_gemini_api_key';
const MODEL_KEY = 'conciliador_gemini_model';

const MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash'];

export function getApiKey() {
  return localStorage.getItem(STORAGE_KEY) || '';
}

export function saveApiKey(key) {
  localStorage.setItem(STORAGE_KEY, key);
}

export function getPreferredModel() {
  return localStorage.getItem(MODEL_KEY) || MODELS[0];
}

export function savePreferredModel(model) {
  localStorage.setItem(MODEL_KEY, model);
}

export function isConfigured() {
  return Boolean(getApiKey());
}

export function getAvailableModels() {
  return MODELS;
}

let lastCallTimestamp = 0;
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function rateLimitedCall(fn) {
  const now = Date.now();
  const elapsed = now - lastCallTimestamp;
  if (elapsed < 4000) {
    await delay(4000 - elapsed);
  }
  lastCallTimestamp = Date.now();
  return fn();
}

async function callGeminiApi(modelName, apiKey, payload) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API Error (${response.status}): ${errText}`);
  }

  return response.json();
}

export async function reconcileWithAI(unmappedBankItems, unmappedSupplierItems) {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  // Limit to 40 to avoid huge payloads / tokens
  const bankSlice = unmappedBankItems.slice(0, 40).map(i => ({
    id: i.id, date: i.date, amount: i.amount, desc: i.description
  }));
  const supplierSlice = unmappedSupplierItems.slice(0, 40).map(i => ({
    id: i.id, date: i.date, amount: i.amount, desc: i.description
  }));

  const systemPrompt = "Você é um contador sênior especialista no sistema Domínio e em regras de conciliação cruzada. Sua tarefa é analisar extratos bancários e razões de fornecedores, utilizando análise semântica de nomes e números de NFe para encontrar correspondências de alta certeza. Retorne justificativas em português.";
  
  const payload = {
    contents: [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "user", parts: [{ text: `Bank Items: ${JSON.stringify(bankSlice)}\nSupplier Items: ${JSON.stringify(supplierSlice)}` }] }
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.95,
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          matches: {
            type: "array",
            items: {
              type: "object",
              properties: {
                bankId: { type: "string" },
                supplierId: { type: "string" },
                confidence: { type: "number" },
                justificativa: { type: "string" }
              },
              required: ["bankId", "supplierId", "confidence", "justificativa"]
            }
          }
        },
        required: ["matches"]
      }
    }
  };

  const preferredModel = getPreferredModel();
  const modelsToTry = [preferredModel, ...MODELS.filter(m => m !== preferredModel)];
  
  let backoff = 3000;
  let retries = 0;

  for (const model of modelsToTry) {
    try {
      return await rateLimitedCall(async () => {
        const data = await callGeminiApi(model, apiKey, payload);
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return [];
        
        const parsed = JSON.parse(text);
        return parsed.matches || [];
      });
    } catch (err) {
      if (err.message.includes('429')) {
        if (retries < 3) {
          retries++;
          await delay(backoff);
          backoff *= 2;
          continue; // retry same or next depending on loop structure, here we just move to next model as fallback or just try again, let's keep moving forward
        }
      }
      console.warn(`Model ${model} failed:`, err);
    }
  }

  return []; // All failed
}
