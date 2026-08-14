import { calculateSimilarity, shareDocNumber } from './similarity';
import { reconcileWithAI, isConfigured as isAIConfigured } from './ai';

function getDaysDiff(d1Str, d2Str) {
  const d1 = new Date(d1Str);
  const d2 = new Date(d2Str);
  const diffTime = Math.abs(d2 - d1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function findSubsetSum(numbers, target, maxItems) {
  const results = [];
  
  function backtrack(start, currentCombo, currentSum) {
    if (currentSum === target) {
      results.push([...currentCombo]);
      return;
    }
    if (currentSum > target || currentCombo.length >= maxItems) return;
    
    for (let i = start; i < numbers.length; i++) {
      currentCombo.push(numbers[i]);
      backtrack(i + 1, currentCombo, currentSum + numbers[i].val);
      currentCombo.pop();
    }
  }

  backtrack(0, [], 0);
  return results.length > 0 ? results[0] : null;
}

export async function reconcile(bankLedgerItems, supplierLedgerItems, options = {}, onProgress = null) {
  const config = {
    dateToleranceDays: 3,
    amountTolerance: 0.05,
    textThreshold: 0.70,
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

  // PASS 1: Exact Match
  let pass1Matches = 0;
  for (const b of bankItems) {
    if (b.matched) continue;
    for (const s of supplierItems) {
      if (s.matched) continue;
      
      const amountDiff = Math.abs(b.amount - s.amount);
      if (amountDiff < 0.001 && b.date === s.date) {
        const hasDocMatch = shareDocNumber(b.document || b.description, s.document || s.description);
        const bothEmptyDocs = !b.document && !s.document;
        
        if (hasDocMatch || bothEmptyDocs) {
          addMatch(b, s, { pass: 1, passName: 'Match Exato', confidence: 100, badgeClass: 'badge-exact' });
          pass1Matches++;
          break;
        }
      }
    }
  }
  reportProgress(1, 'Match Exato', pass1Matches);

  // PASS 2: Date Tolerance
  let pass2Matches = 0;
  for (const b of bankItems) {
    if (b.matched) continue;
    let bestMatch = null;
    let minDays = Infinity;
    
    for (const s of supplierItems) {
      if (s.matched) continue;
      const amountDiff = Math.abs(b.amount - s.amount);
      
      if (amountDiff < 0.001) {
        const days = getDaysDiff(b.date, s.date);
        if (days <= config.dateToleranceDays && days < minDays) {
          minDays = days;
          bestMatch = s;
        }
      }
    }
    
    if (bestMatch) {
      addMatch(b, bestMatch, { pass: 2, passName: 'Tolerância Data', confidence: 95, badgeClass: 'badge-high' });
      pass2Matches++;
    }
  }
  reportProgress(2, 'Tolerância de Data', pass2Matches);

  // PASS 3: Text Similarity
  let pass3Matches = 0;
  for (const b of bankItems) {
    if (b.matched) continue;
    let bestMatch = null;
    let maxSim = 0;
    
    for (const s of supplierItems) {
      if (s.matched) continue;
      const amountDiff = Math.abs(b.amount - s.amount);
      
      if (amountDiff < 0.001) {
        const sim = calculateSimilarity(b.description, s.description);
        if (sim >= config.textThreshold && sim > maxSim) {
          maxSim = sim;
          bestMatch = s;
        }
      }
    }
    
    if (bestMatch) {
      addMatch(b, bestMatch, { pass: 3, passName: 'Similaridade Texto', confidence: 85, badgeClass: 'badge-high' });
      pass3Matches++;
    }
  }
  reportProgress(3, 'Similaridade de Texto', pass3Matches);

  // PASS 4: N:1 and 1:N Subset Sum
  let pass4Matches = 0;
  if (config.enableNtoOne) {
    // Direction A: N suppliers = 1 bank
    for (const b of bankItems) {
      if (b.matched) continue;
      const targetCents = Math.round(b.amount * 100);
      
      const candidates = supplierItems
        .filter(s => !s.matched && getDaysDiff(b.date, s.date) <= 10)
        .map(s => ({ item: s, val: Math.round(s.amount * 100) }));
      
      if (candidates.length >= 2) {
        const subset = findSubsetSum(candidates, targetCents, config.maxNtoOneItems);
        if (subset) {
          addMatch(b, subset.map(x => x.item), { pass: 4, passName: 'Agrupamento N:1', confidence: 80, badgeClass: 'badge-medium' });
          pass4Matches++;
        }
      }
    }

    // Direction B: 1 supplier = N bank
    for (const s of supplierItems) {
      if (s.matched) continue;
      const targetCents = Math.round(s.amount * 100);
      
      const candidates = bankItems
        .filter(b => !b.matched && getDaysDiff(b.date, s.date) <= 10)
        .map(b => ({ item: b, val: Math.round(b.amount * 100) }));
      
      if (candidates.length >= 2) {
        const subset = findSubsetSum(candidates, targetCents, config.maxNtoOneItems);
        if (subset) {
          addMatch(subset.map(x => x.item), s, { pass: 4, passName: 'Desmembramento 1:N', confidence: 80, badgeClass: 'badge-medium' });
          pass4Matches++;
        }
      }
    }
  }
  reportProgress(4, 'Múltiplos N:1', pass4Matches);

  // PASS 5: Fuzzy Match
  let pass5Matches = 0;
  for (const b of bankItems) {
    if (b.matched) continue;
    let bestMatch = null;
    let maxScore = 0;
    
    for (const s of supplierItems) {
      if (s.matched) continue;
      
      const amountDiff = Math.abs(b.amount - s.amount);
      if (amountDiff <= config.amountTolerance) {
        const daysDiff = getDaysDiff(b.date, s.date);
        if (daysDiff <= 5) {
          const textSim = calculateSimilarity(b.description, s.description);
          if (textSim >= 0.5) {
            const valScore = 1 - (amountDiff / Math.max(0.01, config.amountTolerance));
            const dateScore = 1 - (daysDiff / 5);
            const score = (valScore * 0.4) + (dateScore * 0.3) + (textSim * 0.3);
            
            if (score > maxScore) {
              maxScore = score;
              bestMatch = s;
            }
          }
        }
      }
    }
    
    if (bestMatch) {
      addMatch(b, bestMatch, { pass: 5, passName: 'Fuzzy / Probabilístico', confidence: 70, badgeClass: 'badge-low' });
      pass5Matches++;
    }
  }
  reportProgress(5, 'Fuzzy', pass5Matches);

  // PASS 7: AI Pass
  let pass7Matches = 0;
  if (config.enableAI && isAIConfigured()) {
    const unmappedBank = bankItems.filter(i => !i.matched);
    const unmappedSupplier = supplierItems.filter(i => !i.matched);
    
    if (unmappedBank.length > 0 && unmappedSupplier.length > 0) {
      const aiMatches = await reconcileWithAI(unmappedBank, unmappedSupplier);
      
      for (const m of aiMatches) {
        const bItems = m.bankId ? [bankItems.find(i => i.id === m.bankId)].filter(Boolean) : [];
        const sItems = m.supplierId ? [supplierItems.find(i => i.id === m.supplierId)].filter(Boolean) : [];
        
        if (bItems.length && sItems.length && !bItems[0].matched && !sItems[0].matched) {
          addMatch(bItems, sItems, { 
            pass: 7, 
            passName: '🤖 IA Gemini', 
            confidence: m.confidence || 85, 
            badgeClass: 'badge-ai',
            justificativa: m.justificativa 
          });
          pass7Matches++;
        }
      }
    }
  }
  reportProgress(7, 'Inteligência Artificial', pass7Matches);

  // PASS 6: Suggestions
  const suggestions = [];
  const remainingBank = bankItems.filter(i => !i.matched);
  const remainingSupplier = supplierItems.filter(i => !i.matched);
  
  for (const b of remainingBank) {
    const candidates = [];
    for (const s of remainingSupplier) {
      const amountDiff = Math.abs(b.amount - s.amount);
      const daysDiff = getDaysDiff(b.date, s.date);
      const textSim = calculateSimilarity(b.description, s.description);
      
      let score = 0;
      if (amountDiff <= 1.0) score += 50 * (1 - amountDiff);
      if (daysDiff <= 7) score += 30 * (1 - daysDiff/7);
      score += textSim * 20;
      
      if (score >= 30) {
        candidates.push({ supplierItem: s, score, amountDiff, dateDiff: daysDiff, textSim });
      }
    }
    
    if (candidates.length > 0) {
      candidates.sort((a, c) => c.score - a.score);
      suggestions.push({
        bankItem: b,
        candidates: candidates.slice(0, 3)
      });
    }
  }
  reportProgress(6, 'Sugestões', suggestions.length);

  const missingInBank = remainingSupplier;
  const missingInSupplier = remainingBank;
  
  const reconciledRate = bankItems.length > 0 ? (bankItems.filter(i => i.matched).length / bankItems.length) * 100 : 0;

  return {
    matches,
    suggestions,
    missingInBank,
    missingInSupplier,
    totalBankCount: bankItems.length,
    totalSupplierCount: supplierItems.length,
    reconciledRate
  };
}
