/**
 * INTELLIGENT RECONCILIATION ENGINE (6-PASS + GEMINI AI PASS)
 * Performs automated multi-pass matching, N:1 subset-sum combinatorial aggregation,
 * fuzzy logic, confidence scoring, AI semantic analysis, and suggestion generation.
 */

const Reconciler = (function () {

  /**
   * Main reconciliation entry point
   * @param {Array} bankLedgerItems - Normalized items from Razão Conta Banco (Domínio)
   * @param {Array} supplierLedgerItems - Normalized items from Razão Conta Fornecedor (Domínio)
   * @param {Object} options - Configurable parameters
   */
  async function reconcile(bankLedgerItems, supplierLedgerItems, options = {}) {
    const config = Object.assign({
      dateToleranceDays: 3,
      amountTolerance: 0.05,
      textThreshold: 0.70,
      enableNtoOne: true,
      enableAI: true,
      maxNtoOneItems: 8
    }, options);

    // Deep copy items to avoid mutating originals
    let poolBank = bankLedgerItems.map(item => Object.assign({}, item, { matched: false, matchId: null }));
    let poolSupplier = supplierLedgerItems.map(item => Object.assign({}, item, { matched: false, matchId: null }));

    const matches = [];
    const suggestions = [];

    // Helper to calculate date difference in days
    function getDaysDiff(d1Str, d2Str) {
      if (!d1Str || !d2Str) return 999;
      const d1 = new Date(d1Str);
      const d2 = new Date(d2Str);
      const diffTime = Math.abs(d2 - d1);
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // =========================================================================
    // PASSE 1: MATCH EXATO (Confiança 100%)
    // Valor Exato + Data Exata + (Documento idêntico quando presente)
    // =========================================================================
    for (let i = 0; i < poolBank.length; i++) {
      const bnk = poolBank[i];
      if (bnk.matched) continue;

      for (let j = 0; j < poolSupplier.length; j++) {
        const sup = poolSupplier[j];
        if (sup.matched) continue;

        const sameAmount = Math.abs(bnk.amount - sup.amount) < 0.001;
        const sameDate = bnk.date === sup.date;
        const sameDoc = (bnk.document && sup.document && bnk.document === sup.document) || Similarity.shareDocNumber(bnk.description, sup.description);

        if (sameAmount && sameDate) {
          if (sameDoc || (!bnk.document && !sup.document)) {
            bnk.matched = true;
            sup.matched = true;

            matches.push({
              id: `match_p1_${matches.length + 1}`,
              pass: 1,
              passName: 'Passe 1 — Match Exato',
              confidence: 100,
              badgeClass: 'badge-success',
              type: '1:1',
              bankItems: [bnk],
              ledgerItems: [sup],
              notes: 'Valor, data e número de documento/título alinhados com precisão 100%.'
            });
            break;
          }
        }
      }
    }

    // =========================================================================
    // PASSE 2: MATCH POR VALOR + JANELA DE DATA (Confiança 95%)
    // Valor Exato + Data dentro de ±3 dias
    // =========================================================================
    for (let i = 0; i < poolBank.length; i++) {
      const bnk = poolBank[i];
      if (bnk.matched) continue;

      let bestSupIdx = -1;
      let minDateDiff = 999;

      for (let j = 0; j < poolSupplier.length; j++) {
        const sup = poolSupplier[j];
        if (sup.matched) continue;

        const sameAmount = Math.abs(bnk.amount - sup.amount) < 0.001;
        const dateDiff = getDaysDiff(bnk.date, sup.date);

        if (sameAmount && dateDiff <= config.dateToleranceDays) {
          if (dateDiff < minDateDiff) {
            minDateDiff = dateDiff;
            bestSupIdx = j;
          }
        }
      }

      if (bestSupIdx !== -1) {
        const sup = poolSupplier[bestSupIdx];
        bnk.matched = true;
        sup.matched = true;

        matches.push({
          id: `match_p2_${matches.length + 1}`,
          pass: 2,
          passName: 'Passe 2 — Valor + Janela de Data',
          confidence: 95,
          badgeClass: 'badge-success',
          type: '1:1',
          bankItems: [bnk],
          ledgerItems: [sup],
          notes: `Diferença de apenas ${minDateDiff} dia(s) na liquidação bancária.`
        });
      }
    }

    // =========================================================================
    // PASSE 3: MATCH POR VALOR + SIMILARIDADE TEXTUAL (Confiança 85%)
    // Valor Exato + Similaridade de Histórico ≥ 70%
    // =========================================================================
    for (let i = 0; i < poolBank.length; i++) {
      const bnk = poolBank[i];
      if (bnk.matched) continue;

      let bestSupIdx = -1;
      let maxSimScore = 0;

      for (let j = 0; j < poolSupplier.length; j++) {
        const sup = poolSupplier[j];
        if (sup.matched) continue;

        const sameAmount = Math.abs(bnk.amount - sup.amount) < 0.001;
        if (sameAmount) {
          const textSim = Similarity.calculateSimilarity(bnk.description, sup.description);
          if (textSim >= config.textThreshold && textSim > maxSimScore) {
            maxSimScore = textSim;
            bestSupIdx = j;
          }
        }
      }

      if (bestSupIdx !== -1) {
        const sup = poolSupplier[bestSupIdx];
        bnk.matched = true;
        sup.matched = true;

        matches.push({
          id: `match_p3_${matches.length + 1}`,
          pass: 3,
          passName: 'Passe 3 — Valor + Similaridade Textual',
          confidence: 85,
          badgeClass: 'badge-info',
          type: '1:1',
          bankItems: [bnk],
          ledgerItems: [sup],
          notes: `Similaridade textual entre conta Banco e Fornecedor: ${(maxSimScore * 100).toFixed(0)}%.`
        });
      }
    }

    // =========================================================================
    // PASSE 4: MATCH N:1 POR SOMA COMBINATÓRIA (Confiança 80%)
    // Detecta agrupamentos de notas/titulos (Subset Sum Problem)
    // =========================================================================
    if (config.enableNtoOne) {
      // Sentido A: N liquidações do Fornecedor = 1 saída do Banco
      for (let i = 0; i < poolBank.length; i++) {
        const bnk = poolBank[i];
        if (bnk.matched) continue;

        const unmappedSuppliers = poolSupplier.filter(s => !s.matched && getDaysDiff(s.date, bnk.date) <= 10);
        const combo = findSubsetSum(unmappedSuppliers, bnk.amount, config.maxNtoOneItems);

        if (combo && combo.length > 1) {
          bnk.matched = true;
          combo.forEach(s => s.matched = true);

          matches.push({
            id: `match_p4_${matches.length + 1}`,
            pass: 4,
            passName: 'Passe 4 — Soma Combinatória N:1 (Fornecedor -> Banco)',
            confidence: 80,
            badgeClass: 'badge-info',
            type: 'N:1',
            bankItems: [bnk],
            ledgerItems: combo,
            notes: `Agrupamento de ${combo.length} lançamentos do Razão Fornecedor somando R$ ${bnk.amount.toFixed(2)}.`
          });
        }
      }

      // Sentido B: 1 liquidação do Fornecedor = N pagamentos fracionados do Banco
      for (let j = 0; j < poolSupplier.length; j++) {
        const sup = poolSupplier[j];
        if (sup.matched) continue;

        const unmappedBanks = poolBank.filter(b => !b.matched && getDaysDiff(sup.date, b.date) <= 10);
        const combo = findSubsetSum(unmappedBanks, sup.amount, config.maxNtoOneItems);

        if (combo && combo.length > 1) {
          sup.matched = true;
          combo.forEach(b => b.matched = true);

          matches.push({
            id: `match_p4_${matches.length + 1}`,
            pass: 4,
            passName: 'Passe 4 — Soma Combinatória 1:N (Banco -> Fornecedor)',
            confidence: 80,
            badgeClass: 'badge-info',
            type: '1:N',
            bankItems: combo,
            ledgerItems: [sup],
            notes: `Agrupamento de ${combo.length} pagamentos do Razão Banco somando R$ ${sup.amount.toFixed(2)}.`
          });
        }
      }
    }

    // =========================================================================
    // PASSE 5: MATCH FUZZY COMPLETO (Confiança 70%)
    // Valor ±R$0.05 + Data ±5 dias + Text similarity ≥ 50%
    // =========================================================================
    for (let i = 0; i < poolBank.length; i++) {
      const bnk = poolBank[i];
      if (bnk.matched) continue;

      let bestSupIdx = -1;
      let highestCompositeScore = 0;

      for (let j = 0; j < poolSupplier.length; j++) {
        const sup = poolSupplier[j];
        if (sup.matched) continue;

        const amountDiff = Math.abs(bnk.amount - sup.amount);
        const dateDiff = getDaysDiff(bnk.date, sup.date);
        const textSim = Similarity.calculateSimilarity(bnk.description, sup.description);

        if (amountDiff <= config.amountTolerance && dateDiff <= 5 && textSim >= 0.50) {
          const valScore = 1 - (amountDiff / config.amountTolerance);
          const dateScore = 1 - (dateDiff / 5);
          const composite = valScore * 0.4 + dateScore * 0.3 + textSim * 0.3;

          if (composite > highestCompositeScore) {
            highestCompositeScore = composite;
            bestSupIdx = j;
          }
        }
      }

      if (bestSupIdx !== -1) {
        const sup = poolSupplier[bestSupIdx];
        bnk.matched = true;
        sup.matched = true;

        matches.push({
          id: `match_p5_${matches.length + 1}`,
          pass: 5,
          passName: 'Passe 5 — Match Fuzzy Completo',
          confidence: 70,
          badgeClass: 'badge-warning',
          type: '1:1',
          bankItems: [bnk],
          ledgerItems: [sup],
          notes: `Ajuste fuzzy: tolerância de valor R$ ${Math.abs(bnk.amount - sup.amount).toFixed(2)}, similaridade ${(highestCompositeScore * 100).toFixed(0)}%.`
        });
      }
    }

    // =========================================================================
    // PASSE 7: IA GEMINI SEMÂNTICA (Quando API Key estiver configurada)
    // =========================================================================
    if (config.enableAI && GeminiAI.isConfigured()) {
      const unmappedBank = poolBank.filter(b => !b.matched);
      const unmappedSupplier = poolSupplier.filter(s => !s.matched);

      if (unmappedBank.length > 0 && unmappedSupplier.length > 0) {
        console.log('🤖 Iniciando conciliação semântica via IA Gemini...');
        const aiMatches = await GeminiAI.reconcileWithAI(unmappedBank, unmappedSupplier);

        aiMatches.forEach(aiMatch => {
          const bnk = aiMatch.bankItems[0];
          const sup = aiMatch.ledgerItems[0];

          // Check if items are still unmapped
          if (!bnk.matched && !sup.matched) {
            bnk.matched = true;
            sup.matched = true;
            matches.push(aiMatch);
          }
        });
      }
    }

    // =========================================================================
    // PASSE 6: SUGESTÕES INTELIGENTES (Para revisão manual)
    // =========================================================================
    const unmappedBank = poolBank.filter(b => !b.matched);
    const unmappedSupplier = poolSupplier.filter(s => !s.matched);

    unmappedBank.forEach(bnk => {
      const candidateList = [];

      unmappedSupplier.forEach(sup => {
        const amountDiff = Math.abs(bnk.amount - sup.amount);
        const dateDiff = getDaysDiff(bnk.date, sup.date);
        const textSim = Similarity.calculateSimilarity(bnk.description, sup.description);

        let score = 0;
        if (amountDiff < 0.01) score += 50;
        else if (amountDiff < 10.0) score += Math.max(0, 40 - amountDiff);

        if (dateDiff === 0) score += 25;
        else if (dateDiff <= 5) score += (25 - dateDiff * 4);

        score += (textSim * 25);

        if (score >= 30) {
          candidateList.push({
            supplierItem: sup,
            score: Math.round(score),
            amountDiff,
            dateDiff,
            textSim
          });
        }
      });

      candidateList.sort((a, b) => b.score - a.score);
      const topCandidates = candidateList.slice(0, 3);

      if (topCandidates.length > 0) {
        suggestions.push({
          id: `sug_${bnk.id}`,
          bankItem: bnk,
          candidates: topCandidates
        });
      }
    });

    const missingInBank = poolSupplier.filter(s => !s.matched);
    const missingInSupplier = poolBank.filter(b => !b.matched);

    return {
      matches,
      suggestions,
      missingInBank,     // Lançamentos no Fornecedor sem correspondente no Banco
      missingInSupplier, // Lançamentos no Banco sem correspondente no Fornecedor
      totalBankCount: bankLedgerItems.length,
      totalSupplierCount: supplierLedgerItems.length,
      reconciledRate: ((matches.length / Math.max(1, bankLedgerItems.length)) * 100).toFixed(1)
    };
  }

  /**
   * Subset Sum solver
   */
  function findSubsetSum(items, targetAmount, maxItems = 8) {
    const targetCents = Math.round(targetAmount * 100);
    const candidates = items.map(item => ({
      item,
      cents: Math.round(item.amount * 100)
    })).filter(c => c.cents <= targetCents);

    let result = null;

    function backtrack(startIndex, currentSum, currentSubset) {
      if (result) return;
      if (currentSum === targetCents) {
        result = currentSubset.map(c => c.item);
        return;
      }
      if (currentSum > targetCents || currentSubset.length >= maxItems) return;

      for (let i = startIndex; i < candidates.length; i++) {
        const nextCandidate = candidates[i];
        if (currentSum + nextCandidate.cents <= targetCents) {
          backtrack(i + 1, currentSum + nextCandidate.cents, [...currentSubset, nextCandidate]);
        }
      }
    }

    backtrack(0, 0, []);
    return result;
  }

  return {
    reconcile
  };

})();
