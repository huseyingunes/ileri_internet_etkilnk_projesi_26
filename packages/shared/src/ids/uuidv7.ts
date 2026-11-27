import { Temporal } from '../temporal/temporal.js';

const UUID_BYTES = 16;
const RANDOM_BYTES = 10;

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * RFC 9562 UUIDv7: 48-bit Unix millisecond timestamp followed by random bits.
 * Used for externally visible identifiers and request ids.
 */
export function uuidv7(
  epochMilliseconds: number = Temporal.Now.instant().epochMilliseconds,
  random: Uint8Array = crypto.getRandomValues(new Uint8Array(RANDOM_BYTES)),
): string {
  if (!Number.isSafeInteger(epochMilliseconds) || epochMilliseconds < 0) {
    throw new RangeError('epochMilliseconds must be a non-negative safe integer');
  }
  if (random.length < RANDOM_BYTES) {
    throw new RangeError(`random must contain at least ${RANDOM_BYTES} bytes`);
  }

  const bytes = new Uint8Array(UUID_BYTES);
  let timestamp = epochMilliseconds;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp % 256;
    timestamp = Math.floor(timestamp / 256);
  }
  bytes.set(random.subarray(0, RANDOM_BYTES), 6);
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f); // version 7
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f); // RFC 9562 variant
  return toHex(bytes);
}
