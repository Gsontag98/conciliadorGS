import { normalizeText } from './similarity.js';

const STORAGE_KEY = 'conciliador_depara_rules';

// Default initial accounting De-Para dictionary for Brazilian companies
const DEFAULT_RULES = [
  { id: 'rule_1', bankPattern: 'ORTOBOM', supplierPattern: 'ORTOBOM', description: 'Ortobom Colchões' },
  { id: 'rule_2', bankPattern: 'METAL LUZ', supplierPattern: 'METAL LUZ', description: 'Metal Luz Metalúrgica' },
  { id: 'rule_3', bankPattern: 'COPEL', supplierPattern: 'COPEL', description: 'Copel Energia Elétrica' },
  { id: 'rule_4', bankPattern: 'WEG', supplierPattern: 'WEG', description: 'WEG Equipamentos' },
  { id: 'rule_5', bankPattern: 'SISPAG', supplierPattern: '', description: 'Sistema de Pagamento Itaú' }
];

export function getDeParaRules() {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_RULES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RULES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_RULES;
  } catch {
    return DEFAULT_RULES;
  }
}

export function saveDeParaRule(bankPattern, supplierPattern, description = '') {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const rules = getDeParaRules();
  
  const bNorm = normalizeText(bankPattern);
  const sNorm = normalizeText(supplierPattern);

  if (!bNorm || !sNorm) return;

  // Check if rule already exists
  const existing = rules.find(r => normalizeText(r.bankPattern) === bNorm && normalizeText(r.supplierPattern) === sNorm);
  if (existing) return;

  const newRule = {
    id: `depara_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    bankPattern: bankPattern.trim(),
    supplierPattern: supplierPattern.trim(),
    description: description || `Aprendido: ${bankPattern} -> ${supplierPattern}`,
    createdAt: new Date().toISOString()
  };

  const updated = [newRule, ...rules];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function deleteDeParaRule(id) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const rules = getDeParaRules();
  const updated = rules.filter(r => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function matchDePara(bankText, supplierText) {
  const rules = getDeParaRules();
  const bNorm = normalizeText(bankText);
  const sNorm = normalizeText(supplierText);

  for (const rule of rules) {
    if (!rule.bankPattern || !rule.supplierPattern) continue;
    const rBank = normalizeText(rule.bankPattern);
    const rSupp = normalizeText(rule.supplierPattern);

    if (bNorm.includes(rBank) && sNorm.includes(rSupp)) {
      return rule;
    }
  }

  return null;
}
