/* Tutte cloud chats — encrypted on this device before upload.
   Email accounts: the AES-256-GCM key is derived from the user's password at sign-in (PBKDF2, salted
   with their user id). Google/Discord accounts: a random key, stored on the account only wrapped with a
   chat passphrase. Either way the key is kept on this device and the server stores only ciphertext. */
(() => {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const ekKey = uid => "tutte-ek:" + uid;

  async function deriveKey(password, uid) {
    const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: enc.encode("tutte:" + uid), iterations: 150000, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  }

  // called right after a successful sign-in / sign-up, while we still have the password in hand
  async function unlock(password, uid) {
    try { const key = await deriveKey(password, uid);
      const raw = await crypto.subtle.exportKey("raw", key);
      try { localStorage.setItem(ekKey(uid), b64(raw)); } catch {}
      return key;
    } catch { return null; }
  }
  async function keyFor(uid) {
    try { const stored = localStorage.getItem(ekKey(uid)); if (!stored) return null;
      return crypto.subtle.importKey("raw", unb64(stored), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    } catch { return null; }
  }
  const forget = uid => { try { localStorage.removeItem(ekKey(uid)); } catch {} };

  // OAuth users (Google/Discord) have no password to derive a key from, so they set a chat passphrase.
  // Their chat key is random; the account stores it only wrapped (encrypted) with a key derived from that
  // passphrase, so whoever runs the database still can't read it. Older accounts kept the key unwrapped in
  // user_metadata.ek; setting a passphrase wraps that same key (old chats stay readable) and deletes ek.
  const meta = async sb => { const { data, error } = await sb.auth.getUser(); if (error) throw error; return (data.user && data.user.user_metadata) || {}; };
  async function wrapKeyFrom(passphrase, salt) {
    const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  // "ready" (key on this device), "unlock" (wrapped key on the account), "legacy" (unwrapped key on the account), "setup" (no key yet)
  async function vaultState(sb, uid) {
    if (await keyFor(uid)) return "ready";
    const m = await meta(sb);
    if (m.ekw && m.eks) return "unlock";
    return m.ek ? "legacy" : "setup";
  }
  // fresh: start a new key even if one exists (forgotten passphrase; chats saved under the old key stay unreadable)
  async function setupVault(sb, uid, passphrase, fresh) {
    const m = await meta(sb);
    const raw = !fresh && m.ek ? unb64(m.ek) : crypto.getRandomValues(new Uint8Array(32));
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await wrapKeyFrom(passphrase, salt), raw));
    const blob = new Uint8Array(iv.length + ct.length); blob.set(iv); blob.set(ct, iv.length);
    const { error } = await sb.auth.updateUser({ data: { ekw: b64(blob), eks: b64(salt), ek: null } });
    if (error) throw error;
    localStorage.setItem(ekKey(uid), b64(raw));
    return keyFor(uid);
  }
  // null when the passphrase is wrong (AES-GCM refuses to decrypt)
  async function unlockVault(sb, uid, passphrase) {
    const m = await meta(sb); if (!m.ekw || !m.eks) return null;
    const blob = unb64(m.ekw);
    let raw;
    try { raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: blob.subarray(0, 12) }, await wrapKeyFrom(passphrase, unb64(m.eks)), blob.subarray(12)); }
    catch { return null; }
    localStorage.setItem(ekKey(uid), b64(raw));
    if (m.ek) { try { await sb.auth.updateUser({ data: { ek: null } }); } catch {} }
    return keyFor(uid);
  }

  async function encryptObj(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
    const out = new Uint8Array(iv.length + ct.byteLength); out.set(iv); out.set(new Uint8Array(ct), iv.length);
    return b64(out);
  }
  async function decryptBlob(key, blob) {
    const raw = unb64(blob); const iv = raw.subarray(0, 12);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, raw.subarray(12));
    return JSON.parse(dec.decode(pt));
  }

  // list the user's cloud chats, decrypted (skips any that don't decrypt with this key)
  async function list(sb, key) {
    const { data, error } = await sb.from("chats").select("id,blob,updated_at").order("updated_at", { ascending: false });
    if (error || !data) return [];
    const out = [];
    for (const row of data) {
      try { const body = await decryptBlob(key, row.blob);
        out.push({ id: row.id, cloud: true, updated: new Date(row.updated_at).getTime(),
          title: body.title || "Untitled", count: (body.messages || []).length, messages: body.messages || [], summary: body.summary || "" });
      } catch {}
    }
    return out;
  }
  async function get(sb, key, id) {
    const { data, error } = await sb.from("chats").select("blob").eq("id", id).single();
    if (error || !data) return null;
    try { return await decryptBlob(key, data.blob); } catch { return null; }
  }
  async function save(sb, key, uid, chat) {
    const blob = await encryptObj(key, { title: chat.title || "Untitled", messages: chat.messages || [], summary: chat.summary || "" });
    const row = { user_id: uid, blob, updated_at: new Date().toISOString() };
    if (chat.id) row.id = chat.id;
    const { data, error } = await sb.from("chats").upsert(row).select("id").single();
    return error ? null : data.id;
  }
  async function remove(sb, id) { try { await sb.from("chats").delete().eq("id", id); } catch {} }

  window.TutteCloud = { unlock, keyFor, vaultState, setupVault, unlockVault, forget, list, get, save, remove };
})();
