import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPin, forgetPin, hasPin, looksLikePin, setPin } from "../src/pin.js";

function memoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, value),
    removeItem: (key) => items.delete(key),
  };
}

test("a PIN is stored as a salted hash", async () => {
  const storage = memoryStorage();
  await setPin("4821", storage);
  const stored = storage.getItem("family-bank.pin");
  assert.match(stored, /^[0-9a-f]{32}:[0-9a-f]{64}$/);
  assert.equal(stored.includes("4821"), false);
});

test("checkPin accepts the PIN and rejects others", async () => {
  const storage = memoryStorage();
  await setPin("4821", storage);
  assert.equal(await checkPin("4821", storage), true);
  assert.equal(await checkPin("4822", storage), false);
});

test("hasPin and forgetPin track the stored PIN", async () => {
  const storage = memoryStorage();
  assert.equal(hasPin(storage), false);
  await setPin("1234", storage);
  assert.equal(hasPin(storage), true);
  forgetPin(storage);
  assert.equal(hasPin(storage), false);
  assert.equal(await checkPin("1234", storage), false);
});

test("PINs are 4 to 8 digits", () => {
  assert.equal(looksLikePin("1234"), true);
  assert.equal(looksLikePin("12345678"), true);
  assert.equal(looksLikePin("123"), false);
  assert.equal(looksLikePin("123456789"), false);
  assert.equal(looksLikePin("abcd"), false);
});
