import CryptoJS from "crypto-js";

function base32tohex(base32) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = base32.replace(/\s+/g, "").toUpperCase();
  const unpadded = clean.replace(/=+$/, "");
  if (!unpadded || !/^[A-Z2-7]+$/.test(unpadded))
    throw new Error("Invalid Base32");
  const padding = { 0: 0, 2: 6, 4: 4, 5: 3, 7: 1 }[unpadded.length % 8];
  if (
    padding === undefined ||
    (clean.length !== unpadded.length &&
      clean.length - unpadded.length !== padding)
  )
    throw new Error("Invalid Base32");
  let bits = "";
  for (const char of unpadded)
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  let hex = "";
  let index = 0;
  for (; index + 8 <= bits.length; index += 8)
    hex += parseInt(bits.slice(index, index + 8), 2)
      .toString(16)
      .padStart(2, "0");
  if (bits.slice(index).includes("1"))
    throw new Error("Invalid Base32 padding bits");
  return hex;
}

export function generateTOTP(secret, options = {}) {
  if (!secret) return "NO_KEY";
  try {
    let settings = options;
    let base32Secret = secret;
    if (typeof secret === "string" && secret.startsWith("otpauth://")) {
      const url = new URL(secret);
      if (url.hostname !== "totp") return "INVALID";
      base32Secret = url.searchParams.get("secret");
      settings = {
        algo: url.searchParams.get("algorithm") || "SHA1",
        digits: url.searchParams.get("digits") || 6,
        period: url.searchParams.get("period") || 30,
        ...options,
      };
    }
    const keyHex = base32tohex(base32Secret);
    const digits = Number(settings.digits ?? 6);
    const period = Number(settings.period ?? 30);
    if (
      ![6, 8].includes(digits) ||
      !Number.isInteger(period) ||
      period < 1 ||
      period > 300
    )
      return "INVALID";
    const algorithm = String(settings.algo || settings.algorithm || "SHA-1")
      .replace(/-/g, "")
      .toUpperCase();
    const hmacFunction = {
      SHA1: CryptoJS.HmacSHA1,
      SHA256: CryptoJS.HmacSHA256,
      SHA512: CryptoJS.HmacSHA512,
    }[algorithm];
    if (!hmacFunction) return "INVALID";
    const epoch = Math.floor(Date.now() / 1000);
    const counter = Math.floor(epoch / period);
    if (!Number.isSafeInteger(counter) || counter < 0) return "INVALID";
    const message = counter.toString(16).padStart(16, "0");
    const hash = hmacFunction(
      CryptoJS.enc.Hex.parse(message),
      CryptoJS.enc.Hex.parse(keyHex),
    ).toString();
    const offset = parseInt(hash.slice(-1), 16);
    const binary =
      parseInt(hash.slice(offset * 2, offset * 2 + 8), 16) & 0x7fffffff;
    return String(binary % 10 ** digits).padStart(digits, "0");
  } catch {
    return "INVALID";
  }
}

export function checkTOTP(token, secret, options = {}) {
  return (
    typeof token === "string" &&
    /^\d{6}(\d{2})?$/.test(token) &&
    generateTOTP(secret, options) === token
  );
}
