// Runs cloud-chats.js against a fake account and checks how the chat key is stored and unlocked.
// node test/cloud-chats.test.js  (Node 20+)
const fs = require("fs");
const assert = require("assert");
const src = fs.readFileSync(require("path").join(__dirname, "..", "cloud-chats.js"), "utf8");

function device() {
  const store = new Map();
  const window = {};
  const localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  new Function("window", "localStorage", "crypto", "btoa", "atob", "TextEncoder", "TextDecoder", src)(window, localStorage, globalThis.crypto, btoa, atob, TextEncoder, TextDecoder);
  return { C: window.TutteCloud, store };
}
function account(meta = {}) {
  const user = { id: "user-1", user_metadata: { ...meta } };
  return { user, sb: { auth: {
    getUser: async () => ({ data: { user }, error: null }),
    updateUser: async ({ data }) => { Object.assign(user.user_metadata, data); return { data: { user }, error: null }; },
  } } };
}
const raw = d => d.store.get("tutte-ek:user-1");

(async () => {
  // 1. new Google user sets a passphrase
  const a = account(); const d1 = device();
  assert.equal(await d1.C.vaultState(a.sb, "user-1"), "setup");
  assert.ok(await d1.C.setupVault(a.sb, "user-1", "correct horse battery"));
  const m = a.user.user_metadata;
  assert.ok(m.ekw && m.eks, "wrapped key and salt stored on the account");
  assert.equal(m.ek, null, "no unwrapped key on the account");
  assert.ok(!JSON.stringify(m).includes(raw(d1)), "the raw key never appears in account metadata");
  assert.equal(await d1.C.vaultState(a.sb, "user-1"), "ready");
  console.log("ok  setup stores only a wrapped key");

  // 2. same user on a second device
  const d2 = device();
  assert.equal(await d2.C.vaultState(a.sb, "user-1"), "unlock");
  assert.equal(await d2.C.unlockVault(a.sb, "user-1", "wrong passphrase"), null);
  assert.equal(raw(d2), undefined, "nothing saved after a wrong passphrase");
  console.log("ok  wrong passphrase is refused");
  assert.ok(await d2.C.unlockVault(a.sb, "user-1", "correct horse battery"));
  assert.equal(raw(d2), raw(d1), "second device gets the same key");
  console.log("ok  right passphrase unlocks the same key on another device");

  // 3. a chat saved on device 1 decrypts on device 2
  let row;
  const db = { from: () => ({
    upsert: r => { row = { ...r, id: "c1" }; return { select: () => ({ single: async () => ({ data: { id: "c1" }, error: null }) }) }; },
    select: () => ({ eq: () => ({ single: async () => ({ data: { blob: row.blob }, error: null }) }) }),
  }) };
  await d1.C.save(db, await d1.C.keyFor("user-1"), "user-1", { title: "firmware notes", messages: [{ role: "user", content: "hi" }] });
  assert.ok(!row.blob.includes("firmware"), "stored chat is ciphertext");
  const back = await d2.C.get(db, await d2.C.keyFor("user-1"), "c1");
  assert.equal(back.title, "firmware notes");
  console.log("ok  chat saved on one device opens on the other");

  // 4. old account with an unwrapped key: wrapping keeps the same key and deletes the plain copy
  const legacyRaw = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
  const b = account({ ek: legacyRaw }); const d3 = device();
  assert.equal(await d3.C.vaultState(b.sb, "user-1"), "legacy");
  await d3.C.setupVault(b.sb, "user-1", "another passphrase");
  assert.equal(raw(d3), legacyRaw, "existing key kept, so old chats stay readable");
  assert.equal(b.user.user_metadata.ek, null, "plain copy removed");
  console.log("ok  legacy key is wrapped and its plain copy deleted");

  // 5. forgot passphrase: start fresh with a new key
  const d4 = device();
  await d4.C.setupVault(b.sb, "user-1", "brand new passphrase", true);
  assert.notEqual(raw(d4), legacyRaw, "fresh start makes a new key");
  assert.equal(await device().C.unlockVault(b.sb, "user-1", "another passphrase"), null, "old passphrase no longer unlocks");
  console.log("ok  starting fresh replaces the key");
})().catch(e => { console.error("FAIL", e.message); process.exit(1); });
