import { describe, it, expect } from 'vitest';
import { normalizeSecret } from './crypto';

describe('normalizeSecret', () => {
  it('lowercases and trims Custom input by default', () => {
    expect(normalizeSecret('  Hello World  ', 'Custom', false, false)).toBe('hello world');
  });

  it('preserves case when caseSensitive=true', () => {
    expect(normalizeSecret('Hello', 'Custom', true, false)).toBe('Hello');
  });

  it('strips all whitespace when ignoreWhitespace=true', () => {
    expect(normalizeSecret('hello world', 'Custom', false, true)).toBe('helloworld');
  });

  it('Email: lowercases and trims', () => {
    expect(normalizeSecret('  User@Example.COM  ', 'Email', false, true)).toBe('user@example.com');
  });

  it('Number: strips non-digit characters', () => {
    expect(normalizeSecret('1,250,000', 'Number', false, true)).toBe('1250000');
  });

  it('Number: preserves decimal point', () => {
    expect(normalizeSecret('3.14', 'Number', false, false)).toBe('3.14');
  });

  it('Date: normalizes dashes to slashes', () => {
    expect(normalizeSecret('2024-12-31', 'Date', false, true)).toBe('2024/12/31');
  });

  it('Person: collapses multiple spaces and trims', () => {
    expect(normalizeSecret('  John   Smith  ', 'Person', false, false)).toBe('john smith');
  });

  it('produces identical output for equivalent inputs (same secret = same hash input)', () => {
    const a = normalizeSecret('Alice', 'Person', false, false);
    const b = normalizeSecret('alice', 'Person', false, false);
    expect(a).toBe(b);
  });

  it('produces different output for different inputs', () => {
    const a = normalizeSecret('Alice', 'Custom', false, false);
    const b = normalizeSecret('Bob', 'Custom', false, false);
    expect(a).not.toBe(b);
  });
});
