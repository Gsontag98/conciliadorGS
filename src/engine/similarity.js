// Common accounting & banking noise words to remove during normalization
const STOP_WORDS = new Set([
  'PGTO', 'PAGTO', 'PAG', 'PAGO', 'PAGAMENTO',
  'REF', 'REFERENTE', 'REFE',
  'TED', 'DOC', 'PIX', 'TRANSF', 'TRANSFERENCIA', 'TEV',
  'NF', 'NFE', 'NOTA', 'FISCAL', 'DUPLICATA', 'DUP', 'DOCUMENTO',
  'DE', 'DO', 'DA', 'DOS', 'DAS', 'E', 'EM', 'POR', 'PARA', 'COM',
  'BANCO', 'SA', 'LTDA', 'ME', 'EPP', 'EIRELI', 'S/A', 'S.A.'
]);

export function normalizeText(text) {
  if (!text) return '';
  let normalized = String(text).toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^A-Z0-9\s]/g, ' ') // replace special chars with space
    .replace(/\s+/g, ' ') // remove extra spaces
    .trim();

  // Remove stop words
  const words = normalized.split(' ');
  const filteredWords = words.filter(word => !STOP_WORDS.has(word));

  return filteredWords.join(' ');
}

export function jaroWinkler(s1, s2) {
  const str1 = normalizeText(s1);
  const str2 = normalizeText(s2);

  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;

  const len1 = str1.length;
  const len2 = str2.length;
  const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;

  const matches1 = new Array(len1).fill(false);
  const matches2 = new Array(len2).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);

    for (let j = start; j < end; j++) {
      if (!matches2[j] && str1[i] === str2[j]) {
        matches1[i] = true;
        matches2[j] = true;
        matches++;
        break;
      }
    }
  }

  if (matches === 0) return 0.0;

  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (matches1[i]) {
      while (!matches2[k]) k++;
      if (str1[i] !== str2[k]) transpositions++;
      k++;
    }
  }

  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3.0;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
    if (str1[i] === str2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1.0 - jaro);
}

export function jaccardSimilarity(s1, s2) {
  const str1 = normalizeText(s1);
  const str2 = normalizeText(s2);

  if (!str1 || !str2) return 0.0;

  const set1 = new Set(str1.split(' ').filter(Boolean));
  const set2 = new Set(str2.split(' ').filter(Boolean));

  if (set1.size === 0 && set2.size === 0) return 1.0;
  if (set1.size === 0 || set2.size === 0) return 0.0;

  let intersection = 0;
  for (const item of set1) {
    if (set2.has(item)) intersection++;
  }

  const union = set1.size + set2.size - intersection;
  return intersection / union;
}

export function calculateSimilarity(str1, str2) {
  const jw = jaroWinkler(str1, str2);
  const jaccard = jaccardSimilarity(str1, str2);
  return (jw * 0.6) + (jaccard * 0.4);
}

export function extractCnpj(text) {
  if (!text) return null;
  // Match formatted CNPJ: 00.000.000/0000-00 or unformatted 14 digits
  const formatted = String(text).match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/);
  if (formatted) return formatted[0].replace(/[^\d]/g, '');

  const rawDigits = String(text).match(/\b\d{14}\b/);
  if (rawDigits) return rawDigits[0];

  return null;
}

export function extractDocNumbers(text) {
  if (!text) return [];
  // Look specifically for DOCUMENTO XXXXX or NF XXXXX or numbers with 3-10 digits (excluding CNPJs)
  const docExplicit = String(text).match(/(?:DOCUMENTO|DOC|NF|NFE|DUPLICATA|TITULO|TIT)\s*[:#.]?\s*(\d+)/gi);
  const results = [];
  if (docExplicit) {
    docExplicit.forEach(m => {
      const num = m.replace(/[^\d]/g, '');
      if (num && num.length >= 3 && num.length <= 10) results.push(num);
    });
  }

  // General 3-10 digit numbers
  const generalNums = String(text).match(/\b\d{3,10}\b/g) || [];
  generalNums.forEach(num => {
    // Avoid pure dates like 2026 or 01022026 if possible
    if (num.length >= 3 && num.length <= 10 && !results.includes(num)) {
      results.push(num);
    }
  });

  return results;
}

export function shareDocNumber(str1, str2) {
  const docs1 = extractDocNumbers(str1);
  const docs2 = extractDocNumbers(str2);

  if (docs1.length === 0 || docs2.length === 0) return false;

  for (const doc of docs1) {
    if (docs2.includes(doc)) return true;
  }
  return false;
}
