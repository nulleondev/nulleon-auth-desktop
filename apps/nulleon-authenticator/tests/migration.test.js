import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateVaultIfNeeded, V2_SCHEMA_VERSION } from '../src/utils/migration.js';
import { generateTOTP } from '../src/utils/totp.js';

globalThis.window = { crypto: globalThis.crypto };

function base32Encode(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = Buffer.from(value, 'ascii');
  let bits = '';
  let encoded = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  for (let index = 0; index < bits.length; index += 5) {
    encoded += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  }
  return encoded;
}

describe('vault migration compatibility', () => {
  it('preserves existing V2 item IDs and secrets exactly', () => {
    const original = {
      vaultVersion: 2,
      items: [{ id: 'existing-id', type: 'totp', name: 'Conta', secret: 'JBSWY3DPEHPK3PXP' }],
    };

    const migrated = migrateVaultIfNeeded(original);

    expect(migrated.vaultVersion).toBe(V2_SCHEMA_VERSION);
    expect(migrated.items).toEqual(original.items);
  });

  it('normalizes legacy fields without dropping their original data', () => {
    const migrated = migrateVaultIfNeeded([
      { name: 'Legado 2FA', key: 'JBSWY3DPEHPK3PXP' },
      { name: 'Nota', note: 'conteúdo preservado' },
    ]);

    expect(migrated.items).toHaveLength(2);
    expect(migrated.items[0]).toMatchObject({
      name: 'Legado 2FA',
      key: 'JBSWY3DPEHPK3PXP',
      secret: 'JBSWY3DPEHPK3PXP',
      type: 'totp',
    });
    expect(migrated.items[1]).toMatchObject({
      name: 'Nota',
      note: 'conteúdo preservado',
      content: 'conteúdo preservado',
      type: 'note',
    });
    expect(migrated.items.every((item) => typeof item.id === 'string')).toBe(true);
  });

  it('rejects malformed containers instead of silently overwriting data', () => {
    expect(() => migrateVaultIfNeeded({ items: { secret: 'unexpected' } })).toThrow();
    expect(() => migrateVaultIfNeeded(null)).toThrow();
    expect(() => migrateVaultIfNeeded({vaultVersion: 99, items: []})).toThrow();
    expect(() => migrateVaultIfNeeded([null])).toThrow();
  });
});

describe('RFC 6238 TOTP compatibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(59_000));
  });

  it.each([
    ['SHA-1', '12345678901234567890', '94287082'],
    ['SHA-256', '12345678901234567890123456789012', '46119246'],
    ['SHA-512', '1234567890123456789012345678901234567890123456789012345678901234', '90693936'],
  ])('matches the %s reference vector', (algo, secret, expected) => {
    expect(generateTOTP(base32Encode(secret), { algo, digits: 8, period: 30 })).toBe(expected);
  });

  it('rejects invalid Base32 instead of silently discarding characters', () => {
    expect(generateTOTP('INVALID-SECRET!')).toBe('INVALID');
  });
});
