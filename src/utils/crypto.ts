/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatchTemplate } from '../types';

/**
 * Normalizes a secret based on the selected match template and matching rules.
 */
export function normalizeSecret(
  secret: string,
  template: MatchTemplate,
  caseSensitive: boolean,
  ignoreWhitespace: boolean
): string {
  let val = secret;

  // 1. Template-specific normalization
  if (template === 'Email') {
    // Trim, convert to lowercase, remove everything except the standard email characters
    val = val.trim().toLowerCase();
  } else if (template === 'Person') {
    // Normalise names: capitalize words, remove prefixes/suffixes or keep simple, trim multiple spaces etc.
    // For comparison, standard option allows case-insensitivity which we handle below.
    val = val.replace(/\s+/g, ' ').trim();
  } else if (template === 'Number') {
    // Strip everything except digits and decimal point
    val = val.replace(/[^\d.]/g, '').trim();
  } else if (template === 'Date') {
    // Normalize simple date separators
    val = val.replace(/[-\s]/g, '/').trim();
  } else if (template === 'MultipleChoice') {
    // Exact match from predefined options — just trim
    val = val.trim();
  } else {
    // Custom / Default
    val = val.trim();
  }

  // 2. Advanced rules
  if (!caseSensitive) {
    val = val.toLowerCase();
  }

  if (ignoreWhitespace) {
    // Remove ALL whitespace for hyper-resilient matching
    val = val.replace(/\s+/g, '');
  }

  return val;
}

/**
 * Computes the SHA-256 hash of a string using browser's subtle crypto API.
 */
export async function sha256(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Encrypts a clean text message using Web Crypto AES-GCM with a raw 32-byte key.
 * Prepends the 12-byte IV and returns a clean HEX encoded string.
 */
export async function encryptAES(text: string, keyBytes: Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    data
  );

  const fullArray = new Uint8Array(iv.length + encryptedBuffer.byteLength);
  fullArray.set(iv, 0);
  fullArray.set(new Uint8Array(encryptedBuffer), iv.length);

  return Array.from(fullArray).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Decrypts a cipher hex string using Web Crypto AES-GCM with a raw 32-byte key.
 */
export async function decryptAES(hexData: string, keyBytes: Uint8Array): Promise<string> {
  try {
    if (!hexData || hexData.length < 24) {
      throw new Error('Ciphertext too short');
    }

    const rawData = new Uint8Array(hexData.length / 2);
    for (let i = 0; i < rawData.length; i++) {
      rawData[i] = parseInt(hexData.substring(i * 2, i * 2 + 2), 16);
    }

    const iv = rawData.slice(0, 12);
    const ciphertext = rawData.slice(12);

    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      ciphertext
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (e) {
    console.error('Decryption failed:', e);
    throw new Error('Decryption failed. Please make sure you have the correct key handshake link.');
  }
}

/**
 * Generates a privacy-preserving random nickname.
 */
export function generateNickname(): string {
  const adjectives = [
    'Zealous', 'Ardent', 'Vibrant', 'Noble', 'Serene', 'Cryptic', 'Swift', 'Bold', 
    'Silent', 'Dynamic', 'Gentle', 'Loyal', 'Radiant', 'Stellar', 'Wandering', 'Cosmic',
    'Agile', 'Quiet', 'Patient', 'Proud', 'Hidden', 'Careful', 'Eager', 'Fearless'
  ];
  const nouns = [
    'Sentry', 'Explorer', 'Phoenix', 'Cipher', 'Falcon', 'Seer', 'Comet', 'Guardian', 
    'Sage', 'Nomad', 'Beast', 'Rider', 'Specter', 'Vanguard', 'Patriot', 'Seafarer',
    'Hawk', 'Wolf', 'Runner', 'Warden', 'Shadow', 'Keeper', 'Pathfinder', 'Navigator'
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj} ${noun}`;
}


