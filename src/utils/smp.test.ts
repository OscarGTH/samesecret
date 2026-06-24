import { describe, it, expect } from 'vitest';
import { modPow, P, Q, smpStep1, smpStep2, smpStep3, smpStep4, verifySMP } from './smp';

describe('modPow', () => {
  it('computes basic examples correctly', () => {
    expect(modPow(2n, 10n, 1000n)).toBe(24n);
    expect(modPow(3n, 3n, 7n)).toBe(6n);
  });

  it('returns 0 when modulus is 1', () => {
    expect(modPow(99n, 99n, 1n)).toBe(0n);
  });

  it('handles exponent 0', () => {
    expect(modPow(5n, 0n, 13n)).toBe(1n);
  });

  it('handles large group prime without overflow', () => {
    const base = 4n;
    const result = modPow(base, Q, P);
    // Fermat: in the prime-order subgroup g^Q ≡ 1 (mod P)
    expect(result).toBe(1n);
  });
});

describe('SMP protocol math', () => {
  // Simulate the Socialist Millionaire Protocol:
  //   Alice: A = H_A^a mod P,  C_A = B^a mod P
  //   Bob:   B = H_B^b mod P,  C_B = A^b mod P
  //   Match iff C_A === C_B  ⟺  H_A === H_B

  const smallPrime = 23n; // tiny prime for fast unit tests

  function simulateSmp(hA: bigint, a: bigint, hB: bigint, b: bigint, p: bigint) {
    const A = modPow(hA, a, p);
    const B = modPow(hB, b, p);
    const C_A = modPow(B, a, p); // Alice cross-blinds B with her private key
    const C_B = modPow(A, b, p); // Bob cross-blinds A with his private key
    return { C_A, C_B };
  }

  it('produces C_A === C_B when both parties use the same group element (match)', () => {
    const h = 4n; // H_A === H_B (same secret)
    const a = 3n;
    const b = 5n;
    const { C_A, C_B } = simulateSmp(h, a, h, b, smallPrime);
    expect(C_A).toBe(C_B);
  });

  it('produces C_A !== C_B when parties use different group elements (no match)', () => {
    const hA = 4n;
    const hB = 9n; // Different secret
    const a = 3n;
    const b = 5n;
    const { C_A, C_B } = simulateSmp(hA, a, hB, b, smallPrime);
    expect(C_A).not.toBe(C_B);
  });

  it('works with the real 1024-bit prime P', () => {
    // Use small private keys for speed; the math still validates
    const h = 4n;
    const a = 7919n; // arbitrary private exponents
    const b = 6271n;
    const { C_A, C_B } = simulateSmp(h, a, h, b, P);
    expect(C_A).toBe(C_B);
  });

  it('no match with real P and different secrets', () => {
    const hA = 4n;
    const hB = 9n;
    const a = 7919n;
    const b = 6271n;
    const { C_A, C_B } = simulateSmp(hA, a, hB, b, P);
    expect(C_A).not.toBe(C_B);
  });
});

describe('Full 4-step SMP: smpStep1→4 + verifySMP', () => {
  it('verifySMP returns true for matching secrets', async () => {
    const secret = 'correct horse battery staple';
    const step1 = smpStep1();
    const step2 = await smpStep2(secret, step1.g2a, step1.g3a);
    const step3 = await smpStep3(secret, step1.a2, step1.a3, step2.g2b, step2.g3b, step2.pb, step2.qb);
    const rab   = smpStep4(step2.b3, step3.ra);
    expect(verifySMP(rab, step3.pa, step2.pb)).toBe(true);
  });

  it('verifySMP returns false for different secrets', async () => {
    const step1 = smpStep1();
    const step2 = await smpStep2('wrong answer', step1.g2a, step1.g3a);
    const step3 = await smpStep3('right answer', step1.a2, step1.a3, step2.g2b, step2.g3b, step2.pb, step2.qb);
    const rab   = smpStep4(step2.b3, step3.ra);
    expect(verifySMP(rab, step3.pa, step2.pb)).toBe(false);
  });
});
