import { calculateCharges } from '../services/splitCalculator';

describe('calculateCharges', () => {
  // ─── Basic proportional splits ────────────────────────────────────────────

  it('splits 60/40 on a round amount with no remainder', () => {
    const result = calculateCharges(10000, [
      { cardId: 'c1', percentage: 60 },
      { cardId: 'c2', percentage: 40 },
    ]);
    expect(result).toEqual([
      { cardId: 'c1', amountCents: 6000 },
      { cardId: 'c2', amountCents: 4000 },
    ]);
  });

  it('splits 50/50 evenly', () => {
    const result = calculateCharges(200, [
      { cardId: 'c1', percentage: 50 },
      { cardId: 'c2', percentage: 50 },
    ]);
    expect(result).toEqual([
      { cardId: 'c1', amountCents: 100 },
      { cardId: 'c2', amountCents: 100 },
    ]);
  });

  it('handles 100% single card', () => {
    const result = calculateCharges(5000, [{ cardId: 'c1', percentage: 100 }]);
    expect(result).toEqual([{ cardId: 'c1', amountCents: 5000 }]);
  });

  // ─── Remainder handling ───────────────────────────────────────────────────

  it('assigns remainder to highest-percentage card (33/33/34 split on 10 cents)', () => {
    const result = calculateCharges(10, [
      { cardId: 'c1', percentage: 33 },
      { cardId: 'c2', percentage: 33 },
      { cardId: 'c3', percentage: 34 },
    ]);
    // floor(10*33/100)=3, floor(10*33/100)=3, floor(10*34/100)=3 → sum=9, remainder=1
    // remainder → c3 (34% is highest)
    expect(result[0].amountCents).toBe(3);
    expect(result[1].amountCents).toBe(3);
    expect(result[2].amountCents).toBe(4);
    expect(result.reduce((s, r) => s + r.amountCents, 0)).toBe(10);
  });

  it('always produces exact total — never loses or gains a cent', () => {
    // Intentionally awkward amounts
    const cases: Array<[number, Array<{ cardId: string; percentage: number }>]> = [
      [1,    [{ cardId: 'c1', percentage: 60 }, { cardId: 'c2', percentage: 40 }]],
      [3,    [{ cardId: 'c1', percentage: 33 }, { cardId: 'c2', percentage: 33 }, { cardId: 'c3', percentage: 34 }]],
      [7,    [{ cardId: 'c1', percentage: 25 }, { cardId: 'c2', percentage: 25 }, { cardId: 'c3', percentage: 25 }, { cardId: 'c4', percentage: 25 }]],
      [99,   [{ cardId: 'c1', percentage: 33 }, { cardId: 'c2', percentage: 67 }]],
      [101,  [{ cardId: 'c1', percentage: 50 }, { cardId: 'c2', percentage: 50 }]],
      [9999, [{ cardId: 'c1', percentage: 33 }, { cardId: 'c2', percentage: 33 }, { cardId: 'c3', percentage: 34 }]],
    ];

    for (const [amount, splits] of cases) {
      const result = calculateCharges(amount, splits);
      const total = result.reduce((s, r) => s + r.amountCents, 0);
      expect(total).toBe(amount);
    }
  });

  it('assigns remainder to first card with highest percentage (tie-break)', () => {
    // Two cards at 50% each, amount=1: one card gets 0, other gets 1
    // → first occurrence of 50% wins the remainder
    const result = calculateCharges(1, [
      { cardId: 'c1', percentage: 50 },
      { cardId: 'c2', percentage: 50 },
    ]);
    expect(result.reduce((s, r) => s + r.amountCents, 0)).toBe(1);
    // c1 gets the remainder (first occurrence)
    expect(result[0].amountCents).toBe(1);
    expect(result[1].amountCents).toBe(0);
  });

  it('never produces negative amounts', () => {
    const result = calculateCharges(100, [
      { cardId: 'c1', percentage: 1 },
      { cardId: 'c2', percentage: 99 },
    ]);
    expect(result.every((r) => r.amountCents >= 0)).toBe(true);
  });

  it('handles a large number of cards with small percentages', () => {
    const splits = Array.from({ length: 10 }, (_, i) => ({
      cardId: `c${i}`,
      percentage: 10,
    }));
    const result = calculateCharges(1000, splits);
    expect(result.every((r) => r.amountCents === 100)).toBe(true);
    expect(result.reduce((s, r) => s + r.amountCents, 0)).toBe(1000);
  });

  // ─── Error cases ──────────────────────────────────────────────────────────

  it('throws for zero amount', () => {
    expect(() => calculateCharges(0, [{ cardId: 'c1', percentage: 100 }])).toThrow();
  });

  it('throws for negative amount', () => {
    expect(() => calculateCharges(-100, [{ cardId: 'c1', percentage: 100 }])).toThrow();
  });
});
