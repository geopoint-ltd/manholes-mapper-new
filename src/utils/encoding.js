/**
 * Encode a JS string as UTF-16LE with BOM so that Excel on Windows opens it with correct encoding.
 * @param {string} text
 * @returns {Uint8Array}
 */
export function encodeUtf16LeWithBom(text) {
  const buf = new Uint8Array(2 + text.length * 2);
  // BOM FF FE
  buf[0] = 0xFF; buf[1] = 0xFE;
  for (let i = 0, j = 2; i < text.length; i++, j += 2) {
    const code = text.charCodeAt(i);
    buf[j] = code & 0xFF;
    buf[j + 1] = code >> 8;
  }
  return buf;
}


