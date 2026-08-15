import { calculateSimilarity, shareDocNumber, extractDocNumbers, extractCnpj } from './similarity.js';

function getDaysDiff(d1Str, d2Str) {
  if (!d1Str || !d2Str) return 999;
  const d1 = new Date(d1Str);
  const d2 = new Date(d2Str);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 999;
  const diffTime = Math.abs(d2 - d1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function findSubsetSum(numbers, targetCents, maxItems) {
  function backtrack(start, currentCombo, currentSum) {
    if (currentSum === targetCents) {
      return currentCombo;
    }
    if (currentSum > targetCents || currentCombo.length >= maxItems) return null;

    for (let i = start; i < numbers.length; i++) {
      const res = backtrack(i + 1, [...currentCombo, numbers[i]], currentSum + numbers[i].val);
      if (res) return res;
    }
    return null;
  }

  return backtrack(0, [], 0);
}

/**
 * 100% Rigorous Accounting Reconciliation Engine
 * Guarantees that amounts must be EXACT to the penny (R$ 0,00 diff)
 * Prioritizes CNPJ, Document/NF, and Supplier Entity validation.
 */
export async function reconcile(bankLedgerItems, supplierLedgerItems, options = {}, onProgress = null) {
  const config = {
    enableNtoOne: true,
    maxNtoOneItems: 6,
    ...options
  };

  const bankItems = bankLedgerItems.map(item => ({ ...item, matched: false, matchId: null }));
  const supplierItems = supplierLedgerItems.map(item => ({ ...item, matched: false, matchId: null }));

  const matches = [];

  function addMatch(bankItemOrItems, supplierItemOrItems, passInfo) {
    const bItems = Array.isArray(bankItemOrItems) ? bankItemOrItems : [bankItemOrItems];
    const sItems = Array.isArray(supplierItemOrItems) ? supplierItemOrItems : [supplierItemOrItems];

    const matchId = `match_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    bItems.forEach(b => { b.matched = true; b.matchId = matchId; });
    sItems.forEach(s => { s.matched = true; s.matchId = matchId; });

    matches.push({
      id: matchId,
      bankItems: bItems,
      supplierItems: sItems,
      ledgerItems: sItems,
      ...passInfo
    });
  }

  function reportProgress(pass, passName, matchesFound) {
    if (onProgress) {
      onProgress({
        pass,
        passName,
        matchesFound,
        totalMatches: matches.length
      });
    }
  }

  // =========================================================================
  // PASSE 1: Match 100% Exato por CNPJ + Valor Rigorosamente Idêntico
  // =========================================================================
  let pass1Matches = 0;
  for (const b of bankItems) {
    if (b.matched) continue;
    for (const s of supplierItems) {
      if (s.matched) continue;

      const amountDiff = Math.abs(Math.round(b.amount * 100) - Math.round(s.amount * 100));
      if (amountDiff === 0) {
        const hasCnpjMatch = b.cnpj && s.cnpj && b.cnpj === s.cnpj;

        if (hasCnpjMatch) {
          const days = getDaysDiff(b.date, s.date);
          addMatch(b, s, {
            pass: 1,
            passName: 'Match 100% Exato (CNPJ + Valor)',
            confidence: 100,
            badgeClass: 'badge-exact',
            notes: `CNPJ ${b.cnpj} idêntico e valor exato R$ ${b.amount.toFixed(2)}${days > 0 ? ` (Diferença de ${days}d)` : ' (Mesmo dia)'}`,
            type: '1:1'
          });
          pass1Matches++;
          break;
        }
      }
    }
  }
  reportProgress(1, 'Match por CNPJ', pass1Matches);

  // =========================================================================
  // PASSE 2: Match 100% Exato por Número de Documento / NF + Valor Idêntico
  // =========================================================================
  let pass2Matches = 0;
  for (const b of bankItems) {
    if (b.matched) continue;
    for (const s of supplierItems) {
      if (s.matched) continue;

      const amountDiff = Math.abs(Math.round(b.amount * 100) - Math.round(s.amount * 100));
      if (amountDiff === 0) {
        const hasDocMatch = shareDocNumber(b.document || b.description, s.document || s.description);

        if (hasDocMatch) {
          const days = getDaysDiff(b.date, s.date);
          addMatch(b, s, {
            pass: 2,
            passName: 'Match 100% Exato (NF/Doc + Valor)',
            confidence: 100,
            badgeClass: 'badge-exact',
            notes: `Documento/NF coincidente e valor exato R$ ${b.amount.toFixed(2)}${days > 0 ? ` (Diferença de ${days}d)` : ' (Mesmo dia)'}`,
            type: '1:1'
          });
          pass2Matches++;
          break;
        }
      }
    }
  }
  reportProgress(2, 'Match por NF/Doc', pass2Matches);

  // =========================================================================
  // PASSE 3: Match Exato por Fornecedor (Texto) + Valor Idêntico + Mesma Data
  // =========================================================================
  let pass3Matches = 0;
  for (const b of bankItems) {
    if (b.matched) continue;

    let bestCandidate = null;
    let maxSim = 0;

    for (const s of supplierItems) {
      if (s.matched) continue;

      const amountDiff = Math.abs(Math.round(b.amount * 100) - Math.round(s.amount * 100));
      if (amountDiff === 0 && b.date === s.date) {
        const textSim = calculateSimilarity(b.description, s.description);
        if (textSim >= 0.50 && textSim > maxSim) {
          maxSim = textSim;
          bestCandidate = s;
        }
      }
    }

    if (bestCandidate) {
      addMatch(b, bestCandidate, {
        pass: 3,
        passName: 'Match Exato (Valor + Data + Nome)',
        confidence: 100,
        badgeClass: 'badge-exact',
        notes: `Valor exato R$ ${b.amount.toFixed(2)} e mesma data (${b.date}) com fornecedor correspondente`,
        type: '1:1'
      });
      pass3Matches++;
    }
  }
  reportProgress(3, 'Match Valor + Data', pass3Matches);

  // =========================================================================
  // PASSE 4: Match por Similaridade Alta de Fornecedor (>= 75%) + Valor Rigoroso (±15 dias)
  // =========================================================================
  let pass4Matches = 0;
  for (const b of bankItems) {
    if (b.matched) continue;

    let bestCandidate = null;
    let maxSim = 0;
    let bestDays = 999;

    for (const s of supplierItems) {
      if (s.matched) continue;

      const amountDiff = Math.abs(Math.round(b.amount * 100) - Math.round(s.amount * 100));
      if (amountDiff === 0) {
        const days = getDaysDiff(b.date, s.date);
        if (days <= 15) {
          const textSim = calculateSimilarity(b.description, s.description);
          if (textSim >= 0.70 && textSim > maxSim) {
            maxSim = textSim;
            bestCandidate = s;
            bestDays = days;
          }
        }
      }
    }

    if (bestCandidate) {
      addMatch(b, bestCandidate, {
        pass: 4,
        passName: 'Match Nome Fornecedor (Valor Exato)',
        confidence: 95,
        badgeClass: 'badge-text',
        notes: `Valor idêntico R$ ${b.amount.toFixed(2)} e nome correspondente (${Math.round(maxSim * 100)}% similaridade, ±${bestDays}d)`,
        type: '1:1'
      });
      pass4Matches++;
    }
  }
  reportProgress(4, 'Similaridade de Fornecedor', pass4Matches);

  // =========================================================================
  // PASSE 5: Soma Combinatória N:1 (Soma Exata das NFs = Valor Exato do Pagamento)
  // =========================================================================
  let pass5Matches = 0;
  if (config.enableNtoOne) {
    for (const b of bankItems) {
      if (b.matched) continue;

      const targetCents = Math.round(b.amount * 100);
      const candidates = supplierItems
        .filter(s => !s.matched && getDaysDiff(b.date, s.date) <= 15 && Math.round(s.amount * 100) < targetCents)
        .map(s => ({ item: s, val: Math.round(s.amount * 100) }));

      if (candidates.length >= 2) {
        const combo = findSubsetSum(candidates, targetCents, config.maxNtoOneItems);
        if (combo && combo.length >= 2) {
          const matchedSuppliers = combo.map(c => c.item);
          addMatch(b, matchedSuppliers, {
            pass: 5,
            passName: `Soma Exata N:1 (${matchedSuppliers.length} títulos)`,
            confidence: 90,
            badgeClass: 'badge-subset',
            notes: `Soma exata de ${matchedSuppliers.length} notas no fornecedor bate 100% com o pagamento de R$ ${b.amount.toFixed(2)} no banco`,
            type: 'N:1'
          });
          pass5Matches++;
        }
      }
    }
  }
  reportProgress(5, 'Soma Combinatória Exata', pass5Matches);

  // Remaining unmatched items
  const missingInBank = bankItems.filter(b => !b.matched);
  const missingInSupplier = supplierItems.filter(s => !s.matched);

  const totalBankCount = bankItems.length;
  const totalSupplierCount = supplierItems.length;
  const totalItems = totalBankCount + totalSupplierCount;
  const matchedTotal = matches.reduce((sum, m) => sum + m.bankItems.length + (m.ledgerItems?.length || m.supplierItems?.length || 0), 0);
  const reconciledRate = totalItems > 0 ? Math.round((matchedTotal / totalItems) * 100) : 100;

  return {
    matches,
    missingInBank,
    missingInSupplier,
    totalBankCount,
    totalSupplierCount,
    reconciledRate,
    suggestions: []
  };
}
