/**
 * SIMILARITY ENGINE & ACCOUNTING TEXT NORMALIZER
 * Module for intelligent fuzzy matching of transaction descriptions
 */

const Similarity = (function () {

  // Common accounting & banking noise words to remove during normalization
  const STOP_WORDS = new Set([
    'PGTO', 'PAGTO', 'PAG', 'PAGO', 'PAGAMENTO',
    'REF', 'REFERENTE', 'REFE',
    'TED', 'DOC', 'PIX', 'TRANSF', 'TRANSFERENCIA', 'TEV',
    'NF', 'NFE', 'NOTA', 'FISCAL', 'DUPLICATA', 'DUP',
    'DE', 'DO', 'DA', 'DOS', 'DAS', 'E', 'EM', 'POR', 'PARA', 'COM',
    'BANCO', 'SA', 'LTDA', 'ME', 'EPP', 'EIRELI', 'S/A', 'S.A.'
  ]);

  /**
   * Normalizes an accounting description string
   * Removes accents, special chars, extra spaces, and common accounting stop words
   */
  function normalizeText(text) {
    if (!text) return '';
    let str = String(text).toUpperCase();

    // Remove accents/diacritics
    str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Replace non-alphanumeric (except digits & letters) with spaces
    str = str.replace(/[^A-Z0-9\s]/g, ' ');

    // Split into tokens, filter out stop words and short numbers
    const tokens = str.split(/\s+/)
      .map(t => t.trim())
      .filter(t => t.length > 0 && !STOP_WORDS.has(t));

    return tokens.join(' ');
  }

  /**
   * Computes Jaro-Winkler Similarity between two strings (0.0 to 1.0)
   */
  function jaroWinkler(s1, s2) {
    const m1 = normalizeText(s1);
    const m2 = normalizeText(s2);

    if (m1 === m2) return 1.0;
    if (!m1 || !m2) return 0.0;

    const len1 = m1.length;
    const len2 = m2.length;

    const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
    const s1Matches = new Array(len1).fill(false);
    const s2Matches = new Array(len2).fill(false);

    let matches = 0;
    let transpositions = 0;

    for (let i = 0; i < len1; i++) {
      const start = Math.max(0, i - matchWindow);
      const end = Math.min(i + matchWindow + 1, len2);

      for (let j = start; j < end; j++) {
        if (s2Matches[j]) continue;
        if (m1[i] !== s2[j]) continue;

        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0.0;

    let k = 0;
    for (let i = 0; i < len1; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (m1[i] !== m2[k]) transpositions++;
      k++;
    }

    const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

    // Winkler prefix adjustment
    let prefix = 0;
    const maxPrefix = 4;
    for (let i = 0; i < Math.min(len1, len2, maxPrefix); i++) {
      if (m1[i] === m2[i]) prefix++;
      else break;
    }

    return jaro + prefix * 0.1 * (1 - jaro);
  }

  /**
   * Computes Jaccard Token Similarity between two strings (0.0 to 1.0)
   */
  function jaccardSimilarity(s1, s2) {
    const t1 = new Set(normalizeText(s1).split(/\s+/).filter(Boolean));
    const t2 = new Set(normalizeText(s2).split(/\s+/).filter(Boolean));

    if (t1.size === 0 || t2.size === 0) return 0.0;

    let intersection = 0;
    t1.forEach(token => {
      if (t2.has(token)) intersection++;
    });

    const union = new Set([...t1, ...t2]).size;
    return union === 0 ? 0.0 : intersection / union;
  }

  /**
   * Combined Text Similarity Score (0.0 to 1.0)
   * Combines Jaro-Winkler (60%) + Jaccard Token (40%)
   */
  function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0.0;
    const jw = jaroWinkler(str1, str2);
    const jacc = jaccardSimilarity(str1, str2);
    return jw * 0.6 + jacc * 0.4;
  }

  /**
   * Extract document numbers, NF numbers, or CNPJ snippets from text
   */
  function extractDocNumbers(text) {
    if (!text) return [];
    const str = String(text).toUpperCase();
    
    // Look for numbers of 3+ digits (e.g. NF 12345, Doc 9876)
    const matches = str.match(/\b\d{3,14}\b/g) || [];
    return Array.from(new Set(matches));
  }

  /**
   * Checks if two texts share a common document number or CNPJ fragment
   */
  function shareDocNumber(str1, str2) {
    const docs1 = extractDocNumbers(str1);
    const docs2 = extractDocNumbers(str2);
    if (docs1.length === 0 || docs2.length === 0) return false;

    return docs1.some(d1 => docs2.includes(d1));
  }

  return {
    normalizeText,
    jaroWinkler,
    jaccardSimilarity,
    calculateSimilarity,
    extractDocNumbers,
    shareDocNumber
  };

})();
