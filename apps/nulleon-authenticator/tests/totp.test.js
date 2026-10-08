import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { generateTOTP, checkTOTP } from "../src/utils/totp.js";
import { qrErrorMessage } from "../src/utils/qr.js";
function base32(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  let output = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  for (let i = 0; i < bits.length; i += 5)
    output += alphabet[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  return output;
}
afterEach(() => vi.useRealTimers());
const keys = [
  "12345678901234567890",
  "12345678901234567890123456789012",
  "1234567890123456789012345678901234567890123456789012345678901234",
];
// Published RFC 6238 Appendix B vectors, not user credentials.
const vectors = [
  [59, "94287082", "46119246", "90693936"],
  [1111111109, "07081804", "68084774", "25091201"],
  [1111111111, "14050471", "67062674", "99943326"],
  [1234567890, "89005924", "91819424", "93441116"],
  [2000000000, "69279037", "90698825", "38618901"],
  [20000000000, "65353130", "77737706", "47863826"],
];
describe("complete RFC vectors", () => {
  for (const [time, ...expected] of vectors)
    for (const [i, algo] of ["SHA1", "SHA256", "SHA512"].entries()) {
      it(`${algo} at ${time}`, () => {
        vi.useFakeTimers();
        vi.setSystemTime(time * 1000);
        expect(
          generateTOTP(base32(Buffer.from(keys[i])), { algo, digits: 8 }),
        ).toBe(expected[i]);
      });
    }
});
it("preserves 60-second QR periods and changes on the boundary", () => {
  vi.useFakeTimers();
  vi.setSystemTime(59000);
  const key = base32(Buffer.from(keys[0]));
  const uri = `otpauth://totp/QA?secret=${key}&digits=8&period=60&algorithm=SHA256`;
  const before = generateTOTP(uri);
  expect(before).toBe(
    generateTOTP(key, { digits: 8, period: 60, algo: "SHA256" }),
  );
  vi.setSystemTime(60000);
  expect(generateTOTP(uri)).not.toBe(before);
});
it("decodes complete bytes even for long keys with fractional nibble padding", () => {
  vi.useFakeTimers();
  vi.setSystemTime(59000);
  const bytes = Buffer.alloc(82, 65);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(1n);
  const hash = createHmac("sha1", bytes).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  const expected = String(
    (hash.readUInt32BE(offset) & 0x7fffffff) % 1000000,
  ).padStart(6, "0");
  expect(generateTOTP(base32(bytes))).toBe(expected);
});
it("rejects unsupported parameters and invalid base32", () => {
  const key = base32(Buffer.from(keys[0]));
  for (const options of [
    { algo: "MD5" },
    { digits: 7 },
    { period: 0 },
    { period: -1 },
    { period: 1.5 },
    { period: 301 },
  ])
    expect(generateTOTP(key, options)).toBe("INVALID");
  for (const input of [
    "A",
    "ABCDE1",
    "A=A",
    "ABCDEFGHIJKLMNOPQ",
    "otpauth://hotp/QA?secret=" + key,
  ])
    expect(generateTOTP(input)).toBe("INVALID");
  expect(checkTOTP("INVALID", "bad!")).toBe(false);
  expect(checkTOTP("NO_KEY", "")).toBe(false);
});
it("does not echo secret-bearing native errors to the UI", () => {
  expect(qrErrorMessage("private-data-from-native")).not.toContain(
    "private-data",
  );
  expect(qrErrorMessage("QR_MULTIPLE")).toContain("mais de um");
  expect(qrErrorMessage("QR_CAPTURE_FAILED")).toContain("permissão");
});
