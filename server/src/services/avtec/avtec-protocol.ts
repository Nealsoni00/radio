/**
 * Avtec Protocol Implementation
 *
 * Avtec uses two channels:
 * - TCP (port 50911): Metadata packets with call info
 * - UDP (port 50911): RTP audio packets
 *
 * Metadata Packet Format (TCP):
 * - Bytes 0-1: Magic number 0x50 0x4d ("PM")
 * - Bytes 2-3: Reserved (0x00 0x00)
 * - Bytes 4-7: Session ID (uint32 LE) - unique per call
 * - Bytes 8-9: Reserved (0x00 0x00)
 * - Bytes 10-11: Sequence number (uint16 LE)
 * - Bytes 12-13: Message type (uint16 LE)
 * - Bytes 14-15: Payload size (uint16 LE)
 * - Bytes 16+: Payload (varies by message type)
 *
 * Message Types:
 * - 0x0008 (CMD_ENDPOINT_INFO): Start of call
 * - 0x000A (CMD_ENDPOINT_UPDATE): Update during call
 */

// Message type constants
export const CMD_ENDPOINT_INFO = 0x0008;
export const CMD_ENDPOINT_UPDATE = 0x000a;

// Descriptor ID constants
export const DESC_FREQUENCY = 0x03;
export const DESC_ANI = 0x04;
export const DESC_AUDIO_DIRECTION = 0x05;
export const DESC_EMERGENCY_STATE = 0x07;
export const DESC_RX_DIGITAL_STATE = 0x08;
export const DESC_TALKGROUP = 0x0f;

// Audio direction values
export const AUDIO_DIRECTION_INCOMING = 0;
export const AUDIO_DIRECTION_OUTGOING = 1;
export const AUDIO_DIRECTION_BOTH = 2;

/**
 * Create an Avtec metadata header
 */
export function createMetadataHeader(
  sessionId: number,
  sequenceNumber: number,
  messageType: number,
  payloadSize: number
): Buffer {
  const header = Buffer.alloc(16);

  // Magic number "PM"
  header.writeUInt8(0x50, 0);
  header.writeUInt8(0x4d, 1);

  // Reserved
  header.writeUInt16LE(0, 2);

  // Session ID
  header.writeUInt32LE(sessionId, 4);

  // Reserved
  header.writeUInt16LE(0, 8);

  // Sequence number
  header.writeUInt16LE(sequenceNumber, 10);

  // Message type
  header.writeUInt16LE(messageType, 12);

  // Payload size
  header.writeUInt16LE(payloadSize, 14);

  return header;
}

/**
 * Create an endpoint name field (32 bytes, null-padded)
 */
export function createEndpointName(name: string): Buffer {
  const buffer = Buffer.alloc(32);
  const truncatedName = name.substring(0, 31); // Max 31 chars + null
  buffer.write(truncatedName, 'utf8');
  return buffer;
}

/**
 * Create a descriptor (Type-Length-Value format)
 */
export function createDescriptor(id: number, value: Buffer): Buffer {
  const descriptor = Buffer.alloc(2 + value.length);
  descriptor.writeUInt8(id, 0);
  descriptor.writeUInt8(value.length, 1);
  value.copy(descriptor, 2);
  return descriptor;
}

/**
 * Create a string descriptor
 */
export function createStringDescriptor(id: number, value: string): Buffer {
  const valueBuffer = Buffer.from(value, 'utf8');
  return createDescriptor(id, valueBuffer);
}

/**
 * Create a single-byte descriptor
 */
export function createByteDescriptor(id: number, value: number): Buffer {
  const valueBuffer = Buffer.alloc(1);
  valueBuffer.writeUInt8(value, 0);
  return createDescriptor(id, valueBuffer);
}

/**
 * Create a CMD_ENDPOINT_INFO packet (call start)
 */
export function createEndpointInfoPacket(
  sessionId: number,
  sequenceNumber: number,
  endpointName: string,
  ani: string,
  audioDirection: number = AUDIO_DIRECTION_INCOMING,
  talkgroup?: string,
  emergency: boolean = false
): Buffer {
  // Build descriptors
  const descriptors: Buffer[] = [];

  // ANI (unit/source ID)
  if (ani) {
    descriptors.push(createStringDescriptor(DESC_ANI, ani));
  }

  // Audio direction
  descriptors.push(createByteDescriptor(DESC_AUDIO_DIRECTION, audioDirection));

  // Talkgroup
  if (talkgroup) {
    descriptors.push(createStringDescriptor(DESC_TALKGROUP, talkgroup));
  }

  // Emergency state
  descriptors.push(createByteDescriptor(DESC_EMERGENCY_STATE, emergency ? 1 : 0));

  // RX Digital State (always 1 for digital)
  descriptors.push(createByteDescriptor(DESC_RX_DIGITAL_STATE, 1));

  // Create endpoint name (32 bytes)
  const endpointNameBuffer = createEndpointName(endpointName);

  // Concatenate endpoint name + descriptors
  const payload = Buffer.concat([endpointNameBuffer, ...descriptors]);

  // Create header
  const header = createMetadataHeader(sessionId, sequenceNumber, CMD_ENDPOINT_INFO, payload.length);

  return Buffer.concat([header, payload]);
}

/**
 * Create a CMD_ENDPOINT_UPDATE packet (call update)
 */
export function createEndpointUpdatePacket(
  sessionId: number,
  sequenceNumber: number,
  updateType: number = 0,
  ani?: string,
  audioDirection?: number
): Buffer {
  // Build descriptors
  const descriptors: Buffer[] = [];

  if (ani) {
    descriptors.push(createStringDescriptor(DESC_ANI, ani));
  }

  if (audioDirection !== undefined) {
    descriptors.push(createByteDescriptor(DESC_AUDIO_DIRECTION, audioDirection));
  }

  // Update type byte + descriptors
  const updateTypeBuffer = Buffer.alloc(1);
  updateTypeBuffer.writeUInt8(updateType, 0);

  const payload = Buffer.concat([updateTypeBuffer, ...descriptors]);

  // Create header
  const header = createMetadataHeader(sessionId, sequenceNumber, CMD_ENDPOINT_UPDATE, payload.length);

  return Buffer.concat([header, payload]);
}

/**
 * RTP Packet Creation
 *
 * RTP Header Format (12 bytes minimum):
 * - Byte 0: V=2, P=0, X=0, CC=0 -> 0x80
 * - Byte 1: M=0, PT (payload type, e.g., 0 for PCMU)
 * - Bytes 2-3: Sequence number (uint16 BE)
 * - Bytes 4-7: Timestamp (uint32 BE)
 * - Bytes 8-11: SSRC (uint32 BE) - identifies the call
 */

export const RTP_PAYLOAD_TYPE_PCMU = 0; // G.711 μ-law
export const RTP_PAYLOAD_TYPE_PCMA = 8; // G.711 A-law
export const RTP_PAYLOAD_TYPE_L16_MONO = 11; // 16-bit linear PCM mono

/**
 * Create an RTP packet header
 */
export function createRTPHeader(
  sequenceNumber: number,
  timestamp: number,
  ssrc: number,
  payloadType: number = RTP_PAYLOAD_TYPE_PCMU,
  marker: boolean = false
): Buffer {
  const header = Buffer.alloc(12);

  // Version 2, no padding, no extension, no CSRC
  header.writeUInt8(0x80, 0);

  // Marker bit + payload type
  header.writeUInt8((marker ? 0x80 : 0x00) | (payloadType & 0x7f), 1);

  // Sequence number (big endian)
  header.writeUInt16BE(sequenceNumber & 0xffff, 2);

  // Timestamp (big endian)
  header.writeUInt32BE(timestamp >>> 0, 4);

  // SSRC (big endian)
  header.writeUInt32BE(ssrc >>> 0, 8);

  return header;
}

/**
 * Create a complete RTP packet with audio payload
 */
export function createRTPPacket(
  sequenceNumber: number,
  timestamp: number,
  ssrc: number,
  audioPayload: Buffer,
  payloadType: number = RTP_PAYLOAD_TYPE_PCMU,
  marker: boolean = false
): Buffer {
  const header = createRTPHeader(sequenceNumber, timestamp, ssrc, payloadType, marker);
  return Buffer.concat([header, audioPayload]);
}

/**
 * Convert 16-bit signed PCM to 8-bit μ-law (G.711)
 * This is the standard audio format for Avtec
 */
export function linearToMulaw(sample: number): number {
  const MULAW_MAX = 0x1fff;
  const MULAW_BIAS = 33;

  // Get the sign bit
  const sign = (sample >> 8) & 0x80;

  // Get the magnitude
  if (sign !== 0) {
    sample = -sample;
  }

  // Clip the magnitude
  if (sample > MULAW_MAX) {
    sample = MULAW_MAX;
  }

  // Add bias
  sample = sample + MULAW_BIAS;

  // Find the segment
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {
    // empty
  }

  // Extract the mantissa
  const mantissa = (sample >> (exponent + 3)) & 0x0f;

  // Construct the μ-law byte
  const mulawByte = ~(sign | (exponent << 4) | mantissa) & 0xff;

  return mulawByte;
}

/**
 * Convert a buffer of 16-bit signed PCM samples to μ-law
 */
export function pcmToMulaw(pcmBuffer: Buffer): Buffer {
  // Use Math.floor to handle odd-length buffers correctly
  const numSamples = Math.floor(pcmBuffer.length / 2);
  if (numSamples === 0) {
    return Buffer.alloc(0);
  }

  const mulawBuffer = Buffer.alloc(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const offset = i * 2;
    // Safety check to prevent buffer overflow
    if (offset + 1 >= pcmBuffer.length) break;
    const sample = pcmBuffer.readInt16LE(offset);
    mulawBuffer.writeUInt8(linearToMulaw(sample), i);
  }

  return mulawBuffer;
}
