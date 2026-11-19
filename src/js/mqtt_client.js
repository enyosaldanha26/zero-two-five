export const MQTT_BROKERS = [
  { id: 'hivemq', label: 'Global A', url: 'wss://mqtt-dashboard.com:8884/mqtt' },
  { id: 'emqx', label: 'Global B', url: 'wss://broker.emqx.io:8084/mqtt' },
  { id: 'emqx-cn', label: 'Backup C', url: 'wss://broker-cn.emqx.io:8084/mqtt' }
];

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodeUtf8String(str) {
  const utf8 = textEncoder.encode(String(str ?? ''));
  const out = new Uint8Array(2 + utf8.length);
  out[0] = (utf8.length >> 8) & 0xff;
  out[1] = utf8.length & 0xff;
  out.set(utf8, 2);
  return out;
}

export function encodeRemainingLength(len) {
  const out = [];
  let x = len;
  do {
    let encodedByte = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) {
      encodedByte |= 0x80;
    }
    out.push(encodedByte);
  } while (x > 0);
  return new Uint8Array(out);
}

export function decodeRemainingLength(bytes, offset = 1) {
  let multiplier = 1;
  let value = 0;
  let idx = offset;
  let encodedByte = 0;

  do {
    if (idx >= bytes.length) {
      return null; // need more bytes
    }
    encodedByte = bytes[idx++];
    value += (encodedByte & 127) * multiplier;
    if (multiplier > 128 * 128 * 128) {
      throw new Error('Malformed MQTT Remaining Length');
    }
    multiplier *= 128;
  } while ((encodedByte & 128) !== 0);

  return { value, bytesRead: idx - offset };
}

function concatBytes(chunks) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

function wrapPacket(headerByte, chunks) {
  const body = concatBytes(chunks);
  const rem = encodeRemainingLength(body.length);
  const packet = new Uint8Array(1 + rem.length + body.length);
  packet[0] = headerByte;
  packet.set(rem, 1);
  packet.set(body, 1 + rem.length);
  return packet;
}

export function encodeConnectPacket({ clientId, keepAlive = 25, will = null }) {
  let flags = 0x02; // Clean Session
  const chunks = [];

  if (will && will.topic) {
    flags |= 0x04; // Will Flag
    if (will.retain !== false) {
      flags |= 0x20; // Will Retain
    }
  }

  const varHeader = new Uint8Array([
    0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, // "MQTT"
    0x04, // Protocol level 4 (3.1.1)
    flags,
    (keepAlive >> 8) & 0xff,
    keepAlive & 0xff
  ]);
  chunks.push(varHeader);
  chunks.push(encodeUtf8String(clientId));

  if (will && will.topic) {
    chunks.push(encodeUtf8String(will.topic));
    chunks.push(encodeUtf8String(will.payload ?? ''));
  }

  return wrapPacket(0x10, chunks);
}

export function encodePublishPacket(topic, payloadStr = '', { retain = false } = {}) {
  const header = 0x30 | (retain ? 0x01 : 0x00);
  const topicBytes = encodeUtf8String(topic);
  const payloadBytes = textEncoder.encode(String(payloadStr ?? ''));
  return wrapPacket(header, [topicBytes, payloadBytes]);
}

export function encodeSubscribePacket(packetId, topicFilter) {
  const idBytes = new Uint8Array([(packetId >> 8) & 0xff, packetId & 0xff]);
  const filterBytes = encodeUtf8String(topicFilter);
  const qosByte = new Uint8Array([0x00]);
  return wrapPacket(0x82, [idBytes, filterBytes, qosByte]);
}

export function encodeUnsubscribePacket(packetId, topicFilter) {
  const idBytes = new Uint8Array([(packetId >> 8) & 0xff, packetId & 0xff]);
  const filterBytes = encodeUtf8String(topicFilter);
  return wrapPacket(0xa2, [idBytes, filterBytes]);
}

export function encodePubackPacket(packetId) {
  return new Uint8Array([0x40, 0x02, (packetId >> 8) & 0xff, packetId & 0xff]);
}

export function encodePingreqPacket() {
  return new Uint8Array([0xc0, 0x00]);
}

export function encodeDisconnectPacket() {
  return new Uint8Array([0xe0, 0x00]);
}

/**
 * Decodes all complete MQTT packets from `buffer` and returns `{ packets, remainder }`.
 * Handles coalesced bursts (multiple retained PUBLISH packets in one WS frame) and partials.
 */
export function decodePacketsFromBuffer(buffer) {
  const packets = [];
  let offset = 0;

  while (offset < buffer.length) {
    const headerByte = buffer[offset];
    if (offset + 1 >= buffer.length) break;

    const rem = decodeRemainingLength(buffer, offset + 1);
    if (!rem) break;

    const headerLen = 1 + rem.bytesRead;
    const totalLen = headerLen + rem.value;
    if (offset + totalLen > buffer.length) {
      break; // partial frame; wait for remaining bytes
    }

    const bodyStart = offset + headerLen;
    const bodyEnd = offset + totalLen;
    const packetType = headerByte >> 4;
    const qos = (headerByte >> 1) & 0x03;
    const retain = (headerByte & 0x01) === 1;

    if (packetType === 2 && rem.value >= 2) {
      // CONNACK
      packets.push({
        type: 'CONNACK',
        sessionPresent: (buffer[bodyStart] & 0x01) === 1,
        returnCode: buffer[bodyStart + 1]
      });
    } else if (packetType === 3) {
      // PUBLISH
      if (bodyStart + 2 <= bodyEnd) {
        const topicLen = (buffer[bodyStart] << 8) | buffer[bodyStart + 1];
        let cursor = bodyStart + 2;
        const topicEnd = Math.min(bodyEnd, cursor + topicLen);
        const topic = textDecoder.decode(buffer.subarray(cursor, topicEnd));
        cursor = topicEnd;

        let packetId = null;
        if (qos > 0 && cursor + 2 <= bodyEnd) {
          packetId = (buffer[cursor] << 8) | buffer[cursor + 1];
          cursor += 2;
        }
        const payload = textDecoder.decode(buffer.subarray(cursor, bodyEnd));
        packets.push({
          type: 'PUBLISH',
          topic,
          payload,
          retain,
          qos,
          packetId
        });
      }
    } else if (packetType === 9 && rem.value >= 2) {
      packets.push({
        type: 'SUBACK',
        packetId: (buffer[bodyStart] << 8) | buffer[bodyStart + 1]
      });
    } else if (packetType === 11 && rem.value >= 2) {
      packets.push({
        type: 'UNSUBACK',
        packetId: (buffer[bodyStart] << 8) | buffer[bodyStart + 1]
      });
    } else if (packetType === 13) {
      packets.push({ type: 'PINGRESP' });
    }

    offset += totalLen;
  }

  return {
    packets,
    remainder: buffer.slice(offset)
  };
}

export class MqttWsClient {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.ws = null;
    this.broker = null;
    this.brokerIndex = 0;
    this.clientId = `ztf_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36).slice(-4)}`;
    this.status = 'disconnected';
    this.rxBuffer = new Uint8Array(0);
    this.nextPacketId = 1;
    this.pingTimer = null;
    this.subscriptions = new Set();
    this.will = null;
    this.manualDisconnect = false;
  }

  _setStatus(status) {
    this.status = status;
    if (this.callbacks.onStatusChange) {
      this.callbacks.onStatusChange(status, this.broker);
    }
  }

  _sendRaw(bytes) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(bytes);
    return true;
  }

  _allocPacketId() {
    const id = this.nextPacketId;
    this.nextPacketId = (this.nextPacketId % 65535) + 1;
    return id;
  }

  async connect({ brokerIndex = 0, will = null, timeoutMs = 4500 } = {}) {
    await this.disconnect(true);
    this.manualDisconnect = false;
    this.brokerIndex = brokerIndex;
    this.broker = MQTT_BROKERS[brokerIndex] || MQTT_BROKERS[0];
    this.will = will;
    this.rxBuffer = new Uint8Array(0);
    this._setStatus('connecting');

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          this._cleanupSocket();
          this._setStatus('error');
          reject(err);
        } else {
          this._startKeepAlive();
          this._setStatus('connected');
          resolve(this.broker);
        }
      };

      const timer = setTimeout(() => {
        finish(new Error(`Timeout connecting to ${this.broker.url}`));
      }, timeoutMs);

      let ws;
      try {
        ws = new WebSocket(this.broker.url, ['mqtt']);
        ws.binaryType = 'arraybuffer';
        this.ws = ws;
      } catch (err) {
        finish(err);
        return;
      }

      ws.onopen = () => {
        if (this.ws !== ws) return;
        const pkt = encodeConnectPacket({
          clientId: this.clientId,
          keepAlive: 25,
          will: this.will
        });
        ws.send(pkt);
      };

      ws.onmessage = (event) => {
        if (this.ws !== ws) return;
        const chunk = new Uint8Array(event.data);
        const merged = new Uint8Array(this.rxBuffer.length + chunk.length);
        merged.set(this.rxBuffer, 0);
        merged.set(chunk, this.rxBuffer.length);

        const { packets, remainder } = decodePacketsFromBuffer(merged);
        this.rxBuffer = remainder;

        for (const pkt of packets) {
          if (pkt.type === 'CONNACK') {
            if (pkt.returnCode === 0) {
              // Re-subscribe any preserved subscriptions cleanly
              for (const filter of this.subscriptions) {
                this._sendRaw(encodeSubscribePacket(this._allocPacketId(), filter));
              }
              finish(null);
            } else {
              finish(new Error(`MQTT CONNACK refused: ${pkt.returnCode}`));
            }
          } else if (pkt.type === 'PUBLISH') {
            if (pkt.qos === 1 && pkt.packetId != null) {
              this._sendRaw(encodePubackPacket(pkt.packetId));
            }
            if (this.callbacks.onMessage) {
              this.callbacks.onMessage(pkt.topic, pkt.payload, {
                retain: pkt.retain,
                qos: pkt.qos
              });
            }
          }
        }
      };

      ws.onerror = () => {
        if (this.ws !== ws) return;
        finish(new Error(`WebSocket error on ${this.broker.url}`));
      };

      ws.onclose = (ev) => {
        if (this.ws !== ws) return;
        if (!settled) {
          finish(new Error(`WebSocket closed (${ev.code}) on ${this.broker.url}`));
          return;
        }
        this._cleanupSocket();
        this._setStatus('disconnected');
        if (!this.manualDisconnect && this.callbacks.onClose) {
          this.callbacks.onClose(ev.wasClean);
        }
      };
    });
  }

  async connectWithFallback({ will = null, startBrokerIndex = 0 } = {}) {
    const order = [];
    for (let i = 0; i < MQTT_BROKERS.length; i++) {
      order.push((startBrokerIndex + i) % MQTT_BROKERS.length);
    }

    let lastErr = null;
    for (const idx of order) {
      try {
        const broker = await this.connect({ brokerIndex: idx, will });
        return { broker, brokerIndex: idx };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('All online relays unreachable');
  }

  subscribe(topicFilter) {
    this.subscriptions.add(topicFilter);
    if (this.status === 'connected') {
      return this._sendRaw(encodeSubscribePacket(this._allocPacketId(), topicFilter));
    }
    return false;
  }

  unsubscribe(topicFilter) {
    this.subscriptions.delete(topicFilter);
    if (this.status === 'connected') {
      return this._sendRaw(encodeUnsubscribePacket(this._allocPacketId(), topicFilter));
    }
    return false;
  }

  publish(topic, payloadStr = '', { retain = false } = {}) {
    if (this.status !== 'connected') return false;
    return this._sendRaw(encodePublishPacket(topic, payloadStr, { retain }));
  }

  _startKeepAlive() {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.status === 'connected') {
        this._sendRaw(encodePingreqPacket());
      }
    }, 20000);
  }

  _cleanupSocket() {
    clearInterval(this.pingTimer);
    this.pingTimer = null;
    if (this.ws) {
      const sock = this.ws;
      this.ws = null;
      try {
        sock.onopen = null;
        sock.onmessage = null;
        sock.onerror = null;
        sock.onclose = null;
        sock.close();
      } catch {
        // ignore close errors
      }
    }
  }

  async disconnect(preserveSubs = false) {
    this.manualDisconnect = true;
    if (!preserveSubs) {
      this.subscriptions.clear();
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(encodeDisconnectPacket());
      } catch {
        // ignore
      }
    }
    this._cleanupSocket();
    this._setStatus('disconnected');
  }
}
