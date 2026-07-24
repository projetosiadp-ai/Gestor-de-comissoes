const ALGORITHM = 'AES-GCM';
const KEY_LENGTH_BITS = 256;
const IV_LENGTH_BYTES = 12;

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importTeamKey(base64Key) {
  const raw = fromBase64(base64Key);
  return crypto.subtle.importKey('raw', raw, { name: ALGORITHM }, false, ['encrypt', 'decrypt']);
}

export async function generateTeamKeyBase64() {
  const key = await crypto.subtle.generateKey({ name: ALGORITHM, length: KEY_LENGTH_BITS }, true, ['encrypt', 'decrypt']);
  const raw = await crypto.subtle.exportKey('raw', key);
  return toBase64(new Uint8Array(raw));
}

export async function encryptJson(base64Key, data) {
  const key = await importTeamKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, plaintext);
  return `${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptJson(base64Key, payload) {
  const [ivPart, ciphertextPart] = String(payload || '').split('.');
  if (!ivPart || !ciphertextPart) throw new Error('Payload cifrado inválido.');
  const key = await importTeamKey(base64Key);
  const iv = fromBase64(ivPart);
  const ciphertext = fromBase64(ciphertextPart);
  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}
