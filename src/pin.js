const PIN_KEY = "family-bank.pin";
const ITERATIONS = 120_000;

const hex = (bytes) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const bytes = (text) => Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));

export function looksLikePin(value) {
  return /^\d{4,8}$/.test(String(value).trim());
}

export function hasPin(storage = globalThis.localStorage) {
  return Boolean(storage?.getItem(PIN_KEY));
}

async function derive(pin, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(pin).trim()),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return hex(new Uint8Array(bits));
}

export async function setPin(pin, storage = globalThis.localStorage) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  storage?.setItem(PIN_KEY, `${hex(salt)}:${await derive(pin, salt)}`);
}

export async function checkPin(pin, storage = globalThis.localStorage) {
  const stored = storage?.getItem(PIN_KEY);
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  return (await derive(pin, bytes(salt))) === hash;
}

export function forgetPin(storage = globalThis.localStorage) {
  storage?.removeItem(PIN_KEY);
}
