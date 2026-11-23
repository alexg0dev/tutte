"use strict";

// Encrypts saved chats at rest with AES-256-GCM.
//
// The 32-byte key is generated once per install and stored wrapped with Windows DPAPI
// (CurrentUser scope), so it only unlocks for the same Windows user on the same machine.
// Chats written by an earlier version in plain JSON remain readable and are encrypted the
// next time they are saved.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const MAGIC = "TUTTE-ENC1:";
const KEY_DIR = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".tutte"), "Tutte", "keys");
const KEY_FILE = path.join(KEY_DIR, "chats.key");

function ps(script) {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    windowsHide: true, encoding: "utf8", timeout: 20000,
  }).trim();
}

// DPAPI wrap / unwrap on Windows. On other platforms the key file is restricted to the user instead.
function dpapi(b64, op) {
  return ps(
    "Add-Type -AssemblyName System.Security; " +
    "$b = [Convert]::FromBase64String('" + b64 + "'); " +
    "[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::" + op + "($b, $null, 'CurrentUser'))"
  );
}

let cachedKey = null;

function key() {
  if (cachedKey) return cachedKey;
  fs.mkdirSync(KEY_DIR, { recursive: true });
  const win = process.platform === "win32";

  if (fs.existsSync(KEY_FILE)) {
    const stored = fs.readFileSync(KEY_FILE, "utf8").trim();
    const raw = win && stored.startsWith("dpapi:")
      ? dpapi(stored.slice(6), "Unprotect")
      : stored.replace(/^raw:/, "");
    cachedKey = Buffer.from(raw, "base64");
    return cachedKey;
  }

  cachedKey = crypto.randomBytes(32);
  const b64 = cachedKey.toString("base64");
  let out = "raw:" + b64;
  if (win) {
    try { out = "dpapi:" + dpapi(b64, "Protect"); } catch { /* fall back to a restricted plain key file */ }
  }
  fs.writeFileSync(KEY_FILE, out, { mode: 0o600 });
  return cachedKey;
}

function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  return MAGIC + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

function decrypt(text) {
  if (!String(text).startsWith(MAGIC)) return JSON.parse(text); // legacy plain-JSON chat
  const buf = Buffer.from(String(text).slice(MAGIC.length), "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8"));
}

function isEncrypted(text) {
  return String(text).startsWith(MAGIC);
}

module.exports = { encrypt, decrypt, isEncrypted, KEY_FILE };
