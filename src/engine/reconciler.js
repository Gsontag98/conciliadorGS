import { calculateSimilarity, shareDocNumber, extractDocNumbers, extractCnpj, extractCnpjRoot, cleanCompanyName } from './similarity.js';
import { matchDePara, saveDeParaRule } from './deParaStorage.js';

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
 * Advanced Specialist Reconciliation Engine:
 * Combines Contrapartida accounts, full CNPJ, CNPJ root (Matriz/Filial),
 * learned De-Para rules, exact NF/docs, and intelligent Interest/Discount detector.
 */
export async function reconcile(bankLedgerItems, supplierLedgerItems, options = {}, onProgress = null) {
  const config = {
    enableNtoOne: true,
    maxNtoOneItems: 6,
    maxInterestDiscountDiff: 35.0, // R$ 35,00
    maxInterestDiscountPct: 0.02, // 2%
    ...options
  };

  const bankItems = bankLedgerItems.map(item => ({ ...item, matched: false, matchId: null }));
  const supplierItems = supplierLedgerItems.map(item => ({ ...item, matched: false, matchId: null }));

  const matches = [];
  const suggestions = [];

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
  // PASSE 1: Match por Código de Conta Contrapartida (Cta.C.Part. + Valor Exato)
  // =========================================================================
  let pass1Matches = 0;
  for (const b of bankItems) {
    if (b.matched || !b.contrapartida) continue;

    for (const s of supplierItems) {
      if (s.matched) continue;

      const amountDiff = Math.abs(Math.round(b.amount * 100) - Math.round(s.amount * 100));
      if (amountDiff === 0) {
        // Check if bank's contrapartida matches supplier account or vice versa
        const isContrapartidaMatch = (s.contrapartida && b.contrapartida && (b.contrapartida === s.lote || s.contrapartida === b.lote));

        if (isContrapartidaMatch) {
          const days = getDaysDiff(b.date, s.date);
          addMatch(b, s, {
            pass: 1,
            passName: 'Match 100% Exato (Contrapartida Domínio)',
            confidence: 100,
            badgeClass: 'badge-exact',
            notes: `Conta contrapartida ${b.contrapartida} coincidente e valor exato R$ ${b.amount.toFixed(2)}${days > 0 ? ` (±${days}d)` : ''}`,
            type: '1:1'
          });
          pass1Matches++;
          break;
        }
      }
    }
  }
  reportProgress(1, 'Match Contrapartida', pass1Matches);

  // =========================================================================
  // PASSE 2: Match 100% Exato por CNPJ Completo + Valor Rigorosamente Idêntico
  // =========================================================================
  let pass2Matches = 0;
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
            pass: 2,
            passName: 'Match 100% Exato (CNPJ + Valor)',
            confidence: 100,
            badgeClass: 'badge-exact',
            notes: `CNPJ ${b.cnpj} idêntico e valor exato R$ ${b.amount.toFixed(2)}${days > 0 ? ` (±${days}d)` : ' (Mesmo dia)'}`,
            type: '1:1'
          });
          pass2Matches++;
          break;
        }
      }
    }
  }
  reportProgress(2, 'Match por CNPJ', pass2Matches);

  // =========================================================================
  // PASSE 3: Match por Raiz de CNPJ (Matriz / Filial - Primeiros 8 dígitos)
  // =========================================================================
  let pass3Matches = 0;
  for (const b of bankItems) {
    if (b.matched) continue;
    const bRoot = extractCnpjRoot(b.cnpj || b.description);
    if (!bRoot) continue;

    for (const s of supplierItems) {
      if (s.matched) continue;

      const sRoot = extractCnpjRoot(s.cnpj || s.description);
      if (!sRoot || bRoot !== sRoot) continue;

      const amountDiff = Math.abs(Math.round(b.amount * 100) - Math.round(s.amount * 100));
      if (amountDiff === 0) {
        const days = getDaysDiff(b.date, s.date);
        addMatch(b, s, {
          pass: 3,
          passName: 'Match Raiz de CNPJ (Matriz / Filial)',
          confidence: 100,
          badgeClass: 'badge-exact',
          notes: `Mesmo grupo empresarial (Raiz CNPJ ${bRoot}) e valor exato R$ ${b.amount.toFixed(2)}${days > 0 ? ` (±${days}d)` : ''}`,
          type: '1:1'
        });
        pass3Matches++;
        break;
      }
    }
  }
  reportProgress(3, 'Match Matriz/Filial', pass3Matches);

  // =========================================================================
  // PASSE 4: Match por Regra Aprendida "De-Para" + Valor Rigoroso
  // =========================================================================
  let pass4Matches = 0;
  for (const b of bankItems) {
    if (b.matched) continue;

    for (const s of supplierItems) {
      if (s.matched) continue;

      const amountDiff = Math.abs(Math.round(b.amount * 100) - Math.round(s.amount * 100));
      if (amountDiff === 0) {
        const deParaMatch = matchDePara(b.description, s.description);
        if (deParaMatch) {
          const days = getDaysDiff(b.date, s.date);
          addMatch(b, s, {
            pass: 4,
            passName: 'Match por Regra De-Para Aprendida',
            confidence: 100,
            badgeClass: 'badge-exact',
            notes: `Regra aprendida: "${deParaMatch.bankPattern}" -> "${deParaMatch.supplierPattern}" (R$ ${b.amount.toFixed(2)})`,
            type: '1:1'
          });
          pass4Matches++;
          break;
        }
      }
    }
  }
  reportProgress(4, 'Regras De-Para', pass4Matches);

  // =========================================================================
  // PASSE 5: Match 100% Exato por Número de Documento / NF + Valor Idêntico
  // =========================================================================
  let pass5Matches = 0;
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
            pass: 5,
            passName: 'Match 100% Exato (NF/Doc + Valor)',
            confidence: 100,
            badgeClass: 'badge-exact',
            notes: `Documento/NF coincidente e valor exato R$ ${b.amount.toFixed(2)}${days > 0 ? ` (±${days}d)` : ' (Mesmo dia)'}`,
            type: '1:1'
          });
          pass5Matches++;
          break;
        }
      }
    }
  }
  reportProgress(5, 'Match por NF/Doc', pass5Matches);

  // =========================================================================
  // PASSE 6: Match por Razão Social Limpa (cleanCompanyName) + Valor Exato + Data
  // =========================================================================
  let pass6Matches = 0;
  for (const b of bankItems) {
    if (b.matched) continue;

    const bClean = cleanCompanyName(b.description);
    if (!bClean || bClean.length < 3) continue;

    let bestCandidate = null;
    let maxSim = 0;
    let bestDays = 999;

    for (const s of supplierItems) {
      if (s.matched) continue;

      const amountDiff = Math.abs(Math.round(b.amount * 100) - Math.round(s.amount * 100));
      if (amountDiff === 0) {
        const sClean = cleanCompanyName(s.description);
        if (!sClean || sClean.length < 3) continue;

        const days = getDaysDiff(b.date, s.date);
        if (days <= 15) {
          const isSubstring = bClean.includes(sClean) || sClean.includes(bClean);
          const sim = calculateSimilarity(bClean, sClean);

          if ((isSubstring || sim >= 0.70) && sim > maxSim) {
            maxSim = sim;
            bestCandidate = s;
            bestDays = days;
          }
        }
      }
    }

    if (bestCandidate) {
      addMatch(b, bestCandidate, {
        pass: 6,
        passName: 'Match Nome Fornecedor (Valor Exato)',
        confidence: 95,
        badgeClass: 'badge-text',
        notes: `Fornecedor coincidente e valor exato R$ ${b.amount.toFixed(2)}${bestDays > 0 ? ` (±${bestDays}d)` : ' (Mesmo dia)'}`,
        type: '1:1'
      });
      pass6Matches++;
    }
  }
  reportProgress(6, 'Razão Social Limpa', pass6Matches);

  // =========================================================================
  // PASSE 7: Soma Combinatória N:1 (Soma Exata das NFs = Valor Exato do Pagamento)
  // =========================================================================
  let pass7Matches = 0;
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
            pass: 7,
            passName: `Soma Exata N:1 (${matchedSuppliers.length} títulos)`,
            confidence: 90,
            badgeClass: 'badge-subset',
            notes: `Soma exata de ${matchedSuppliers.length} notas no fornecedor fecha 100% com o pagamento de R$ ${b.amount.toFixed(2)}`,
            type: 'N:1'
          });
          pass7Matches++;
        }
      }
    }
  }
  reportProgress(7, 'Soma Combinatória', pass7Matches);

  // =========================================================================
  // DETECTOR DE SUGESTÕES DE JUROS E DESCONTOS EM BOLETOS
  // (Identifica mesmo CNPJ ou mesmo fornecedor com pequena variação de centavos)
  // =========================================================================
  const unmappedBank = bankItems.filter(b => !b.matched);
  const unmappedSupplier = supplierItems.filter(s => !s.matched);

  for (const b of unmappedBank) {
    for (const s of unmappedSupplier) {
      const hasCnpj = (b.cnpj && s.cnpj && b.cnpj === s.cnpj) || (extractCnpjRoot(b.cnpj || b.description) && extractCnpjRoot(b.cnpj || b.description) === extractCnpjRoot(s.cnpj || s.description));
      const textSim = calculateSimilarity(cleanCompanyName(b.description), cleanCompanyName(s.description));
      const hasDoc = shareDocNumber(b.document || b.description, s.document || s.description);

      if (hasCnpj || hasDoc || textSim >= 0.75) {
        const diff = b.amount - s.amount;
        const absDiff = Math.abs(diff);
        const pctDiff = absDiff / s.amount;

        if (absDiff > 0 && (absDiff <= config.maxInterestDiscountDiff || pctDiff <= config.maxInterestDiscountPct) && getDaysDiff(b.date, s.date) <= 15) {
          const isJuros = diff > 0;
          suggestions.push({
            id: `sug_${b.id}_${s.id}`,
            bankItem: b,
            supplierItem: s,
            diff: absDiff,
            type: isJuros ? 'JUROS_MULTA' : 'DESCONTO_OBTIDO',
            notes: isJuros
              ? `Possível Juros/Encargos de R$ ${absDiff.toFixed(2)} (Banco: R$ ${b.amount.toFixed(2)} vs Fornecedor: R$ ${s.amount.toFixed(2)})`
              : `Possível Desconto Obtido de R$ ${absDiff.toFixed(2)} (Banco: R$ ${b.amount.toFixed(2)} vs Fornecedor: R$ ${s.amount.toFixed(2)})`
          });
        }
      }
    }
  }

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
    suggestions,
    totalBankCount,
    totalSupplierCount,
    reconciledRate
  };
}
