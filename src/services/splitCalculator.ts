/**
 * Split Calculator
 *
 * Distributes an integer amount (cents) across cards proportionally.
 * All arithmetic is integer-only — no floats ever enter the calculation.
 *
 * Algorithm:
 *   1. floor(amount * percentage / 100) for each card
 *   2. Sum the floored amounts
 *   3. remainder = totalAmount - sum  (always 0 ≤ remainder < splits.length)
 *   4. Add remainder to the card with the highest percentage
 *      (ties broken by first occurrence — deterministic)
 *
 * This guarantees:
 *   - sum(chargeAmounts) === totalAmount  (exact, no rounding loss)
 *   - every chargeAmount >= 1 cent (enforced by min 1% split in Phase 5)
 */

export interface SplitInput {
  cardId: string;
  percentage: number; // integer 1-100, all must sum to 100
}

export interface ChargeAllocation {
  cardId: string;
  amountCents: number;
}

export function calculateCharges(
  totalAmountCents: number,
  splits: SplitInput[],
): ChargeAllocation[] {
  if (totalAmountCents <= 0) {
    throw new Error(`Top-up amount must be positive, got ${totalAmountCents}`);
  }

  // Step 1: floor allocation for each card
  const allocations: ChargeAllocation[] = splits.map((s) => ({
    cardId: s.cardId,
    amountCents: Math.floor((totalAmountCents * s.percentage) / 100),
  }));

  // Step 2: compute remainder
  const allocated = allocations.reduce((sum, a) => sum + a.amountCents, 0);
  const remainder = totalAmountCents - allocated;

  // Step 3: assign remainder to card with highest percentage (deterministic)
  if (remainder > 0) {
    let maxIdx = 0;
    for (let i = 1; i < splits.length; i++) {
      if (splits[i].percentage > splits[maxIdx].percentage) {
        maxIdx = i;
      }
    }
    allocations[maxIdx].amountCents += remainder;
  }

  return allocations;
}
