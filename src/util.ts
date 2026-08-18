/**
 * Reads PNG image dimensions from a base64-encoded PNG string without any external library.
 * PNG stores width/height as big-endian uint32 at bytes 16-23 of the raw binary
 * (after the 8-byte signature + 4-byte chunk length + 4-byte "IHDR" type).
 */
export function getPngDimensions(base64: string): { width: number; height: number } {
    const buf = Buffer.from(base64, 'base64');
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
