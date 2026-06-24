/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Socialist Millionaire Protocol (SMP) Implementation
 * Based on the OTR SMP specification
 */

// 1536-bit MODP group (RFC 3526)
export const P = BigInt('0xFFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA237327FFFFFFFFFFFFFFFF');
export const G = BigInt(2);
export const Q = (P - BigInt(1)) / BigInt(2); // Sophie Germain prime property

/**
 * Generate a random private exponent in range [2, Q-1]
 */
export function generatePrivateExponent(): bigint {
  const bytes = new Uint8Array(192); // 1536 bits
  crypto.getRandomValues(bytes);
  let r = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    r = (r << BigInt(8)) | BigInt(bytes[i]);
  }
  r = (r % (Q - BigInt(2))) + BigInt(2);
  return r;
}

/**
 * Modular exponentiation: base^exp mod modulus
 */
export function modPow(base: bigint, exp: bigint, modulus: bigint): bigint {
  if (modulus === BigInt(1)) return BigInt(0);
  let result = BigInt(1);
  base = base % modulus;
  while (exp > BigInt(0)) {
    if (exp % BigInt(2) === BigInt(1)) {
      result = (result * base) % modulus;
    }
    exp = exp >> BigInt(1);
    base = (base * base) % modulus;
  }
  return result;
}

/**
 * Hash a secret string to a group element
 */
export async function hashToGroupElement(secret: string): Promise<bigint> {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  
  let h = BigInt(0);
  for (let i = 0; i < hashArray.length; i++) {
    h = (h << BigInt(8)) | BigInt(hashArray[i]);
  }
  
  // Map to valid group element
  h = h % Q;
  if (h <= BigInt(1)) h = BigInt(2);
  
  return modPow(G, h, P);
}

/**
 * Generate zero-knowledge proof for discrete log
 * Proves knowledge of x in g^x without revealing x
 */
export function generateProof(
  g: bigint,
  x: bigint,
  random: bigint,
  P: bigint
): { c: bigint; d: bigint } {
  // Commitment: t = g^r
  const t = modPow(g, random, P);
  
  // Challenge: c = Hash(g, g^x, t)
  const gx = modPow(g, x, P);
  const challenge = hashBigInts(g, gx, t);
  
  // Response: d = r - c*x (mod Q)
  let d = random - (challenge * x);
  while (d < BigInt(0)) d += Q;
  d = d % Q;
  
  return { c: challenge, d };
}

/**
 * Verify zero-knowledge proof
 */
export function verifyProof(
  g: bigint,
  gx: bigint,
  c: bigint,
  d: bigint,
  P: bigint
): boolean {
  // Recompute t = g^d * (g^x)^c
  const gd = modPow(g, d, P);
  const gxc = modPow(gx, c, P);
  const t = (gd * gxc) % P;
  
  // Recompute challenge
  const cPrime = hashBigInts(g, gx, t);
  
  return c === cPrime;
}

/**
 * Hash multiple bigints to produce a challenge
 */
function hashBigInts(...values: bigint[]): bigint {
  const combined = values.map(v => v.toString(16)).join('|');
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  
  // Synchronous hash approximation (in real implementation, use async SHA-256)
  let hash = BigInt(0);
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << BigInt(5)) - hash + BigInt(data[i])) % Q;
  }
  
  return (hash < BigInt(0) ? hash + Q : hash) % Q;
}

/**
 * SMP Step 1: Creator generates initial values
 */
export interface SMPStep1 {
  g2a: bigint;  // g^(a2)
  g3a: bigint;  // g^(a3)
  a2: bigint;   // private
  a3: bigint;   // private
}

export function smpStep1(): SMPStep1 {
  const a2 = generatePrivateExponent();
  const a3 = generatePrivateExponent();
  const g2a = modPow(G, a2, P);
  const g3a = modPow(G, a3, P);
  
  return { g2a, g3a, a2, a3 };
}

/**
 * SMP Step 2: Joiner responds with their values and proofs
 */
export interface SMPStep2 {
  g2b: bigint;
  g3b: bigint;
  pb: bigint;
  qb: bigint;
  b2: bigint;   // private
  b3: bigint;   // private
}

export async function smpStep2(secret: string, g2a: bigint, g3a: bigint): Promise<SMPStep2> {
  const b2 = generatePrivateExponent();
  const b3 = generatePrivateExponent();
  
  const g2b = modPow(G, b2, P);
  const g3b = modPow(G, b3, P);
  
  const g2 = modPow(g2a, b2, P);  // g^(a2*b2)
  const g3 = modPow(g3a, b3, P);  // g^(a3*b3)
  
  // Pb = g3^r3 * g^secret
  const secretHash = await hashToGroupElement(secret);
  const r3 = generatePrivateExponent();
  const pb = (modPow(g3, r3, P) * modPow(G, await secretToBigInt(secret), P)) % P;
  
  // Qb = g^r3 * g2^secret
  const qb = (modPow(G, r3, P) * modPow(g2, await secretToBigInt(secret), P)) % P;
  
  return { g2b, g3b, pb, qb, b2, b3 };
}

/**
 * SMP Step 3: Creator responds and creates final proof
 */
export interface SMPStep3 {
  pa: bigint;
  qa: bigint;
  ra: bigint;
}

export async function smpStep3(
  secret: string,
  a2: bigint,
  a3: bigint,
  g2b: bigint,
  g3b: bigint,
  pb: bigint,
  qb: bigint
): Promise<SMPStep3> {
  const g2 = modPow(g2b, a2, P);  // g^(a2*b2)
  const g3 = modPow(g3b, a3, P);  // g^(a3*b3)
  
  // Pa = g3^r3 * g^secret
  const r3 = generatePrivateExponent();
  const pa = (modPow(g3, r3, P) * modPow(G, await secretToBigInt(secret), P)) % P;
  
  // Qa = g^r3 * g2^secret
  const qa = (modPow(G, r3, P) * modPow(g2, await secretToBigInt(secret), P)) % P;
  
  // Ra = (Qb / Qa)^a3
  const qbInv = modInverse(qa, P);
  const ratio = (qb * qbInv) % P;
  const ra = modPow(ratio, a3, P);
  
  return { pa, qa, ra };
}

/**
 * SMP Step 4: Joiner computes Ra^b3 as the final proof value.
 * The creator verifies by checking rab * pa ≡ pb (mod P).
 */
export function smpStep4(b3: bigint, ra: bigint): bigint {
  return modPow(ra, b3, P);
}

/**
 * Verify SMP: secrets matched iff rab * pa ≡ pb (mod P),
 * where rab = Ra^b3 = (Qb/Qa)^(a3*b3).
 */
export function verifySMP(rab: bigint, pa: bigint, pb: bigint): boolean {
  return (rab * pa) % P === pb;
}

/**
 * Modular multiplicative inverse
 */
function modInverse(a: bigint, m: bigint): bigint {
  const result = extendedGCD(a, m);
  if (result.gcd !== BigInt(1)) {
    throw new Error('Modular inverse does not exist');
  }
  return ((result.x % m) + m) % m;
}

function extendedGCD(a: bigint, b: bigint): { gcd: bigint; x: bigint; y: bigint } {
  if (b === BigInt(0)) {
    return { gcd: a, x: BigInt(1), y: BigInt(0) };
  }
  const result = extendedGCD(b, a % b);
  return {
    gcd: result.gcd,
    x: result.y,
    y: result.x - (a / b) * result.y,
  };
}

async function secretToBigInt(secret: string): Promise<bigint> {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  
  let h = BigInt(0);
  for (let i = 0; i < hashArray.length; i++) {
    h = (h << BigInt(8)) | BigInt(hashArray[i]);
  }
  
  return h % Q;
}