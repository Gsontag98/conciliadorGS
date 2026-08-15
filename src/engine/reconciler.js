import { calculateSimilarity, shareDocNumber, extractDocNumbers, extractCnpj } from './similarity.js';
import { reconcileWithAI, isConfigured as isAIConfigured } from './ai.js';

function getDaysDiff(d1Str, d2Str) {
  const d1 = new Date(d1Str);
  const d2 = new Date(d2Str);
  const diffTime = Math.abs(d2 - d1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function findSubsetSum(numbers, target, maxItems) {
  function backtrack(start, currentCombo, currentSum) {
    if (Math.abs(currentSum - target) < 1) { // 1 cent tolerance
      return currentCombo;
    }
    if (currentSum > target + 1 || currentCombo.length >= maxItems) return null;

    for (let i = start; i < numbers.length; i++) {
      const res = backtrack(i + 1, [...currentCombo, numbers[i]], currentSum + numbers[i].val);
      if (res) return res;
    }
    return null;
  }

  return backtrack(0, [], 0);
}

export async function reconcile(bankLedgerItems, supplierLedgerItems, options = {}, onProgress = null) {
  const config = {
    dateToleranceDays: 3,
    amountTolerance: 0.05,
    textThreshold: 0.65,
    enableNtoOne: true,
    enableAI: true,
    maxNtoOneItems: 8,
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

  // PASS 1: Exact Match (Same Amount + Same Date + (Shared CNPJ OR Shared Doc OR both))
  let pass1Matches = 0;
  for (const b of bankItems) {
    if (b.matched) continue;
    for (const s of supplierItems) {
      if (s.matched) continue;

      const amountDiff = Math.abs(b.amount - s.amount);
      if (amountDiff < 0.001 && b.date === s.date) {
        const hasCnpjMatch = b.cnpj && s.cnpj && b.cnpj === s.cnpj;
        const hasDocMatch = shareDocNumber(b.document || b.description, s.document || s.description);
        const textSim = calculateSimilarity(b.description, s.description);

        if (hasCnpjMatch || hasDocMatch || textSim >= 0.5 || (!b.document && !s.document)) {
          addMatch(b, s, {
            pass: 1,
            passName: hasCnpjMatch ? 'Match Exato (CNPJ)' : 'Match Exato (Valor + Data)',
            confidence: 100,
            badgeClass: 'badge-exact',
            type: '1:1'
          });
          pass1Matches++;
          break;
        }
      }
    }
  }
  reportProgress(1, 'Match Exato', pass1Matches);

  // PASS 2: Date Tolerance Window (Same Amount + Date within ±dateToleranceDays)
  let pass2Matches = 0;
  for (const b of bankItems) {
    if (b.matched) continue;

    let bestCandidate = null;
    let minDays = Infinity;

    for (const s of supplierItems) {
      if (s.matched) continue;

      const amountDiff = Math.abs(b.amount - s.amount);
      if (amountDiff < 0.001) {
        const days = getDaysDiff(b.date, s.date);
        if (days <= config.dateToleranceDays && days < minDays) {
          const hasCnpjMatch = b.cnpj && s.cnpj && b.cnpj === s.cnpj;
          const textSim = calculateSimilarity(b.description, s.description);
          if (hasCnpjMatch || textSim >= 0.3 || days <= 2) {
            minDays = days;
            bestCandidate = s;
          }
        }
      }
    }

    if (bestCandidate) {
      addMatch(b, bestCandidate, {
        pass: 2,
        passName: `Janela de Data (±${minDays}d)`,
        confidence: 95 - (minDays * 3),
        badgeClass: 'badge-date',
        type: '1:1'
      });
      pass2Matches++;
    }
  }
  reportProgress(2, 'Janela de Data', pass2Matches);

  // PASS 3: Same Amount + Text Similarity / CNPJ Match (within ±10 days)
  let pass3Matches = 0;
  for (const b of bankItems) {
    if (b.matched) continue;

    let bestCandidate = null;
    let maxSim = 0;

    for (const s of supplierItems) {
      if (s.matched) continue;

      const amountDiff = Math.abs(b.amount - s.amount);
      if (amountDiff < 0.001) {
        const days = getDaysDiff(b.date, s.date);
        if (days <= 10) {
          const hasCnpjMatch = b.cnpj && s.cnpj && b.cnpj === s.cnpj;
          const textSim = calculateSimilarity(b.description, s.description);

          if (hasCnpjMatch) {
            bestCandidate = s;
            maxSim = 1.0;
            break;
          } else if (textSim >= config.textThreshold && textSim > maxSim) {
            maxSim = textSim;
            bestCandidate = s;
          }
        }
      }
    }

    if (bestCandidate) {
      addMatch(b, bestCandidate, {
        pass: 3,
        passName: 'Similaridade Textual',
        confidence: Math.round(maxSim * 100),
        badgeClass: 'badge-text',
        type: '1:1'
      });
      pass3Matches++;
    }
  }
  reportProgress(3, 'Similaridade Textual', pass3Matches);

  // PASS 4: Combinatorial N:1 / 1:N Subset Sum
  let pass4Matches = 0;
  if (config.enableNtoOne) {
    // Direction A: N suppliers = 1 bank payment
    for (const b of bankItems) {
      if (b.matched) continue;

      const targetCents = Math.round(b.amount * 100);
      const candidates = supplierItems
        .filter(s => !s.matched && getDaysDiff(b.date, s.date) <= 10 && Math.round(s.amount * 100) < targetCents)
        .map(s => ({ item: s, val: Math.round(s.amount * 100) }));

      if (candidates.length >= 2) {
        const combo = findSubsetSum(candidates, targetCents, config.maxNtoOneItems);
        if (combo && combo.length >= 2) {
          const matchedSuppliers = combo.map(c => c.item);
          addMatch(b, matchedSuppliers, {
            pass: 4,
            passName: `Soma N:1 (${matchedSuppliers.length} fornecedores)`,
            confidence: 85,
            badgeClass: 'badge-subset',
            type: 'N:1'
          });
          pass4Matches++;
        }
      }
    }

    // Direction B: 1 supplier = N bank payments
    for (const s of supplierItems) {
      if (s.matched) continue;

      const targetCents = Math.round(s.amount * 100);
      const candidates = bankItems
        .filter(b => !b.matched && getDaysDiff(s.date, b.date) <= 10 && Math.round(b.amount * 100) < targetCents)
        .map(b => ({ item: b, val: Math.round(b.amount * 100) }));

      if (candidates.length >= 2) {
        const combo = findSubsetSum(candidates, targetCents, config.maxNtoOneItems);
        if (combo && combo.length >= 2) {
          const matchedBanks = combo.map(c => c.item);
          addMatch(matchedBanks, s, {
            pass: 4,
            passName: `Soma 1:N (${matchedBanks.length} parcelas banco)`,
            confidence: 85,
            badgeClass: 'badge-subset',
            type: '1:N'
          });
          pass4Matches++;
        }
      }
    }
  }
  reportProgress(4, 'Soma Combinatória', pass4Matches);

  // PASS 5: Fuzzy Match (Amount tolerance ±0.05 + Date tolerance ±5d + Text >= 50%)
  let pass5Matches = 0;
  for (const b of bankItems) {
    if (b.matched) continue;

    for (const s of supplierItems) {
      if (s.matched) continue;

      const amountDiff = Math.abs(b.amount - s.amount);
      const days = getDaysDiff(b.date, s.date);

      if (amountDiff <= config.amountTolerance && days <= 5) {
        const textSim = calculateSimilarity(b.description, s.description);
        if (textSim >= 0.45 || (b.cnpj && s.cnpj && b.cnpj === s.cnpj)) {
          addMatch(b, s, {
            pass: 5,
            passName: 'Match Fuzzy Aproximado',
            confidence: 70,
            badgeClass: 'badge-fuzzy',
            type: '1:1'
          });
          pass5Matches++;
          break;
        }
      }
    }
  }
  reportProgress(5, 'Match Fuzzy', pass5Matches);

  // PASS 7: AI Gemini Pass (if configured and enabled)
  if (config.enableAI && isAIConfigured()) {
    const unmappedBank = bankItems.filter(b => !b.matched);
    const unmappedSupplier = supplierItems.filter(s => !s.matched);

    if (unmappedBank.length > 0 && unmappedSupplier.length > 0) {
      try {
        const aiMatches = await reconcileWithAI(unmappedBank, unmappedSupplier);
        if (Array.isArray(aiMatches)) {
          aiMatches.forEach(aim => {
            const b = bankItems.find(item => item.id === aim.bankId && !item.matched);
            const s = supplierItems.find(item => item.id === aim.supplierId && !item.matched);
            if (b && s) {
              addMatch(b, s, {
                pass: 7,
                passName: '🤖 IA Gemini — Análise Semântica',
                confidence: aim.confidence || 85,
                badgeClass: 'badge-ai',
                notes: aim.justificativa,
                type: '1:1'
              });
            }
          });
        }
      } catch (err) {
        console.warn('AI reconciliation pass skipped:', err);
      }
    }
  }
  reportProgress(7, 'IA Gemini', matches.length);

  // PASS 6: Suggestions for remaining unmapped bank items
  const suggestions = [];
  const remainingBank = bankItems.filter(b => !b.matched);
  const remainingSupplier = supplierItems.filter(s => !s.matched);

  for (const b of remainingBank) {
    const candidates = [];
    for (const s of remainingSupplier) {
      const amountDiff = Math.abs(b.amount - s.amount);
      const days = getDaysDiff(b.date, s.date);
      const textSim = calculateSimilarity(b.description, s.description);

      let score = 0;
      if (amountDiff < 0.001) score += 50;
      else if (amountDiff < 1.0) score += 30;

      if (days <= 3) score += 30;
      else if (days <= 10) score += 15;

      score += Math.round(textSim * 20);

      if (score >= 30) {
        candidates.push({ supplierItem: s, score, amountDiff, dateDiff: days, textSim });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      suggestions.push({
        bankItem: b,
        candidates: candidates.slice(0, 3)
      });
    }
  }

  const unmappedB = bankItems.filter(b => !b.matched);
  const unmappedS = supplierItems.filter(s => !s.matched);

  return {
    matches,
    suggestions,
    missingInBank: unmappedS,
    missingInSupplier: unmappedB,
    unmatchedBank: unmappedB,
    unmatchedSupplier: unmappedS,
    totalBankCount: bankItems.length,
    totalSupplierCount: supplierItems.length,
    reconciledRate: bankItems.length > 0 ? Math.round((matches.length / bankItems.length) * 100) : 0
  };
}
