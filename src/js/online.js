import { AVATARS } from './constants.js';
import { MqttWsClient, MQTT_BROKERS } from './mqtt_client.js';

export const TOPIC_PREFIX = 'ztf_v1';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(length = 5) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function hashPassword(roomCode, rawPassword) {
  const input = `ztf:${String(roomCode || '').trim().toUpperCase()}:${String(rawPassword ?? '')}`;
  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 = ((h2 << 5) + h2 + c) | 0;
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export function filterPublicRooms(roomsCollection, nowMs = Date.now(), staleMs = 65000) {
  const list =
    roomsCollection instanceof Map
      ? Array.from(roomsCollection.values())
      : Array.isArray(roomsCollection)
        ? roomsCollection
        : [];

  return list
    .filter((room) => {
      if (!room || !room.code) return false;
      if (room.status !== 'waiting') return false;
      if (room.visibility !== 'open' && room.visibility !== 'code_password') return false;
      if (nowMs - (room.updatedAt || 0) > staleMs) return false;
      const seats = Array.isArray(room.seats) ? room.seats : [];
      return seats.some((s) => s.type === 'empty');
    })
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function sanitizeStateForSeat(fullState, targetSeatIndex) {
  if (!fullState) return null;
  return {
    playerCount: fullState.playerCount,
    mode: fullState.mode,
    difficulty: fullState.difficulty,
    roundNumber: fullState.roundNumber,
    maxRounds: fullState.maxRounds,
    disputeNumber: fullState.disputeNumber,
    maxDisputes: fullState.maxDisputes,
    players: fullState.players.map((p) => ({
      index: p.index,
      name: p.name,
      avatar: p.avatar,
      isHuman: Boolean(p.isHuman),
      peerId: p.peerId || null,
      wins: p.wins,
      tokens: [...p.tokens],
      bidCard: p.bidCard ? { ...p.bidCard } : null,
      bidTarget: p.bidTarget,
      totalWinsAllRounds: p.totalWinsAllRounds,
      tiesCaused: p.tiesCaused,
      hand:
        p.index === targetSeatIndex
          ? p.hand.map((c) => ({ id: c.id, suit: c.suit, number: c.number }))
          : Array.from({ length: p.hand.length }, () => ({ hidden: true }))
    })),
    tokenReserve: { ...fullState.tokenReserve },
    leadPlayerIndex: fullState.leadPlayerIndex,
    turnIndex: fullState.turnIndex,
    tableCards: fullState.tableCards.map((tc) => ({
      playerIndex: tc.playerIndex,
      card: { ...tc.card }
    })),
    playedHistory: [],
    phase: fullState.phase,
    lastDisputeResult: fullState.lastDisputeResult
      ? {
          ...fullState.lastDisputeResult,
          tableCards: fullState.lastDisputeResult.tableCards.map((tc) => ({
            playerIndex: tc.playerIndex,
            card: { ...tc.card }
          }))
        }
      : null,
    lastRoundSummary: fullState.lastRoundSummary
      ? JSON.parse(JSON.stringify(fullState.lastRoundSummary))
      : null,
    gameResult: fullState.gameResult
      ? JSON.parse(JSON.stringify(fullState.gameResult))
      : null
  };
}

export class OnlineManager {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.peerId = `p_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
    this.rooms = new Map();
    this.currentRoom = null;
    this.role = null; // null | 'host' | 'guest'
    this.localSeatIndex = 0;
    this.brokerIndex = 0;
    this.hostHeartbeatTimer = null;
    this.guestHeartbeatTimer = null;
    this.guestLastSeen = new Map();
    this.lastHostSeen = 0;
    this.pendingJoin = null;
    this.pendingRoomLookups = new Map();

    this.client = new MqttWsClient({
      onStatusChange: (status, broker) => {
        if (this.callbacks.onConnectionStatus) {
          this.callbacks.onConnectionStatus(status, broker, this.brokerIndex);
        }
      },
      onMessage: (topic, payload) => this._handleMessage(topic, payload),
      onClose: () => {
        if (this.callbacks.onConnectionLost) {
          this.callbacks.onConnectionLost();
        }
      }
    });
  }

  get isConnected() {
    return this.client.status === 'connected';
  }

  getPublicRooms() {
    return filterPublicRooms(this.rooms);
  }

  async ensureConnected(preferredBrokerIndex = 0) {
    if (this.client.status === 'connected') {
      return { broker: this.client.broker, brokerIndex: this.brokerIndex };
    }
    const res = await this.client.connectWithFallback({ startBrokerIndex: preferredBrokerIndex });
    this.brokerIndex = res.brokerIndex;
    this.client.subscribe(`${TOPIC_PREFIX}/rooms/+`);
    return res;
  }

  async refreshDirectory() {
    await this.ensureConnected(this.brokerIndex);
    this.client.unsubscribe(`${TOPIC_PREFIX}/rooms/+`);
    this.client.subscribe(`${TOPIC_PREFIX}/rooms/+`);
    this._emitRoomsChanged();
  }

  _emitRoomsChanged() {
    if (this.callbacks.onRoomsChanged) {
      this.callbacks.onRoomsChanged(this.getPublicRooms());
    }
  }

  _emitRoomState() {
    if (this.callbacks.onRoomStateChanged) {
      this.callbacks.onRoomStateChanged(this.currentRoom);
    }
  }

  _handleMessage(topic, rawPayload) {
    const roomsPrefix = `${TOPIC_PREFIX}/rooms/`;
    if (topic.startsWith(roomsPrefix)) {
      const code = topic.slice(roomsPrefix.length);
      if (!rawPayload) {
        this.rooms.delete(code);
        this._resolveRoomLookup(code, null);
        this._emitRoomsChanged();
        if (this.role === 'guest' && this.currentRoom && this.currentRoom.code === code) {
          this._handleRemoteRoomClosed('host_closed');
        }
        return;
      }

      let room = null;
      try {
        room = JSON.parse(rawPayload);
      } catch {
        return;
      }
      if (!room || !room.code) return;

      this.rooms.set(code, room);
      this._resolveRoomLookup(code, room);
      this._emitRoomsChanged();

      if (this.role === 'guest' && this.currentRoom && this.currentRoom.code === code) {
        this.currentRoom = room;
        this.lastHostSeen = Date.now();
        this._emitRoomState();
      }
      return;
    }

    if (!rawPayload) return;
    let msg;
    try {
      msg = JSON.parse(rawPayload);
    } catch {
      return;
    }
    if (!msg || !msg.type) return;

    if (this.role === 'host' && this.currentRoom) {
      const hostTopic = `${TOPIC_PREFIX}/room/${this.currentRoom.code}/to_host`;
      if (topic === hostTopic) {
        this._handleHostMessage(msg);
        return;
      }
    }

    if (this.role === 'guest' || this.pendingJoin) {
      const code = this.currentRoom?.code || this.pendingJoin?.code;
      if (!code) return;
      const clientTopic = `${TOPIC_PREFIX}/room/${code}/to_client/${this.peerId}`;
      const bcastTopic = `${TOPIC_PREFIX}/room/${code}/broadcast`;
      if (topic === clientTopic || topic === bcastTopic) {
        this._handleGuestMessage(msg);
      }
    }
  }

  _resolveRoomLookup(code, room) {
    const waiters = this.pendingRoomLookups.get(code);
    if (!waiters) return;
    this.pendingRoomLookups.delete(code);
    for (const w of waiters) {
      w(room);
    }
  }

  _waitForRoomRecord(code, timeoutMs = 3000) {
    const existing = this.rooms.get(code);
    if (existing && Date.now() - (existing.updatedAt || 0) <= 65000) {
      return Promise.resolve(existing);
    }
    this.client.subscribe(`${TOPIC_PREFIX}/rooms/${code}`);
    return new Promise((resolve) => {
      const arr = this.pendingRoomLookups.get(code) || [];
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        resolve(this.rooms.get(code) || null);
      }, timeoutMs);
      arr.push((room) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(room);
      });
      this.pendingRoomLookups.set(code, arr);
    });
  }

  // ================= HOST =================

  async createRoom({
    roomName,
    playerCount = 4,
    mode = 'basic',
    difficulty = 'tactical',
    visibility = 'open',
    password = '',
    autoFillAi = true,
    hostName = 'Anfitrião',
    hostAvatar = 'defy'
  }) {
    await this.leaveOrCloseSilently();
    await this.ensureConnected(this.brokerIndex);

    let code = generateRoomCode();
    let guard = 0;
    while (this.rooms.has(code) && guard < 10) {
      code = generateRoomCode();
      guard++;
    }

    // Reconnect on the same broker with LWT so tab closure removes the room from the lobby
    const will = {
      topic: `${TOPIC_PREFIX}/rooms/${code}`,
      payload: '',
      retain: true
    };
    this.client.subscribe(`${TOPIC_PREFIX}/rooms/+`);
    this.client.subscribe(`${TOPIC_PREFIX}/room/${code}/to_host`);
    await this.client.connect({ brokerIndex: this.brokerIndex, will });

    const cleanName = (roomName || `Mesa de ${hostName}`).trim().slice(0, 24) || `Mesa ${code}`;
    const cleanHost = (hostName || 'Anfitrião').trim().slice(0, 14) || 'Anfitrião';

    const seats = [];
    for (let i = 0; i < playerCount; i++) {
      if (i === 0) {
        seats.push({
          seatIndex: 0,
          type: 'human',
          peerId: this.peerId,
          name: cleanHost,
          avatar: hostAvatar
        });
      } else {
        seats.push({
          seatIndex: i,
          type: 'empty',
          peerId: null,
          name: null,
          avatar: null
        });
      }
    }

    const room = {
      code,
      brokerIndex: this.brokerIndex,
      name: cleanName,
      visibility, // 'open' | 'code' | 'code_password'
      passwordHash: visibility === 'code_password' ? hashPassword(code, password) : null,
      playerCount,
      mode,
      difficulty,
      autoFillAi: Boolean(autoFillAi),
      hostPeerId: this.peerId,
      hostName: cleanHost,
      status: 'waiting', // 'waiting' | 'playing'
      createdAt: Date.now(),
      updatedAt: Date.now(),
      seats
    };

    this.role = 'host';
    this.localSeatIndex = 0;
    this.currentRoom = room;
    this.guestLastSeen.clear();
    this._publishHostRoom(true);
    this._startHostHeartbeat();
    this._emitRoomState();
    return room;
  }

  _publishHostRoom(broadcastAlso = false) {
    if (!this.currentRoom || this.role !== 'host') return;
    this.currentRoom.updatedAt = Date.now();
    this.rooms.set(this.currentRoom.code, this.currentRoom);
    this.client.publish(`${TOPIC_PREFIX}/rooms/${this.currentRoom.code}`, JSON.stringify(this.currentRoom), {
      retain: true
    });
    if (broadcastAlso) {
      this.broadcastEvent({ type: 'room_update', room: this.currentRoom });
    }
    this._emitRoomsChanged();
  }

  _startHostHeartbeat() {
    clearInterval(this.hostHeartbeatTimer);
    this.hostHeartbeatTimer = setInterval(() => {
      if (this.role !== 'host' || !this.currentRoom) return;
      const now = Date.now();

      if (this.currentRoom.status === 'playing') {
        for (const seat of this.currentRoom.seats) {
          if (seat.seatIndex === 0 || seat.type !== 'human' || !seat.peerId) continue;
          const seen = this.guestLastSeen.get(seat.peerId) || now;
          if (now - seen > 45000) {
            this._convertSeatToAi(seat.seatIndex, 'disconnect');
          }
        }
      }

      this._publishHostRoom(false);
    }, 20000);
  }

  setAutoFillAi(enabled) {
    if (this.role !== 'host' || !this.currentRoom) return;
    this.currentRoom.autoFillAi = Boolean(enabled);
    this._publishHostRoom(true);
    this._emitRoomState();
  }

  _handleHostMessage(msg) {
    const room = this.currentRoom;
    if (!room) return;

    if (msg.type === 'heartbeat' && msg.peerId) {
      this.guestLastSeen.set(msg.peerId, Date.now());
      return;
    }

    if (msg.type === 'join_req') {
      const replyTopic = `${TOPIC_PREFIX}/room/${room.code}/to_client/${msg.peerId}`;
      if (room.status !== 'waiting') {
        this.client.publish(replyTopic, JSON.stringify({ type: 'join_ack', ok: false, reason: 'already_started' }));
        return;
      }
      if (room.visibility === 'code_password' && msg.passwordHash !== room.passwordHash) {
        this.client.publish(replyTopic, JSON.stringify({ type: 'join_ack', ok: false, reason: 'wrong_password' }));
        return;
      }

      let seat = room.seats.find((s) => s.peerId === msg.peerId);
      if (!seat) {
        seat = room.seats.find((s) => s.type === 'empty');
      }
      if (!seat) {
        this.client.publish(replyTopic, JSON.stringify({ type: 'join_ack', ok: false, reason: 'room_full' }));
        return;
      }

      seat.type = 'human';
      seat.peerId = msg.peerId;
      seat.name = String(msg.name || `Jogador ${seat.seatIndex + 1}`).trim().slice(0, 14) || `Jogador ${seat.seatIndex + 1}`;
      seat.avatar = msg.avatar || AVATARS[seat.seatIndex % AVATARS.length].id;
      this.guestLastSeen.set(msg.peerId, Date.now());

      this._publishHostRoom(true);
      this._emitRoomState();
      this.client.publish(
        replyTopic,
        JSON.stringify({
          type: 'join_ack',
          ok: true,
          seatIndex: seat.seatIndex,
          room
        })
      );
      return;
    }

    if (msg.type === 'leave' && msg.peerId) {
      const seat = room.seats.find((s) => s.peerId === msg.peerId);
      if (!seat) return;
      if (room.status === 'waiting') {
        seat.type = 'empty';
        seat.peerId = null;
        seat.name = null;
        seat.avatar = null;
        this.guestLastSeen.delete(msg.peerId);
        this._publishHostRoom(true);
        this._emitRoomState();
      } else {
        this._convertSeatToAi(seat.seatIndex, 'left');
      }
      return;
    }

    if (msg.type === 'action' && msg.peerId) {
      const seat = room.seats.find((s) => s.peerId === msg.peerId && s.seatIndex === msg.seatIndex);
      if (!seat) return;
      this.guestLastSeen.set(msg.peerId, Date.now());
      if (this.callbacks.onHostRemoteAction) {
        this.callbacks.onHostRemoteAction(seat.seatIndex, msg.action, msg.cardId);
      }
      return;
    }

    if (msg.type === 'jokenpo_pick' && msg.peerId) {
      const seat = room.seats.find((s) => s.peerId === msg.peerId && s.seatIndex === msg.seatIndex);
      if (!seat) return;
      if (this.callbacks.onHostRemoteJokenpoPick) {
        this.callbacks.onHostRemoteJokenpoPick(seat.seatIndex, msg.suit);
      }
    }
  }

  _convertSeatToAi(seatIndex, reason) {
    if (!this.currentRoom || this.role !== 'host') return;
    const seat = this.currentRoom.seats[seatIndex];
    if (!seat || seat.type !== 'human') return;
    seat.type = 'ai';
    seat.peerId = null;
    if (!String(seat.name || '').endsWith('(IA)')) {
      seat.name = `${seat.name || 'Bot'} (IA)`.slice(0, 14);
    }
    this._publishHostRoom(false);
    if (this.callbacks.onGuestConvertedToAi) {
      this.callbacks.onGuestConvertedToAi(seatIndex, seat.name, reason);
    }
  }

  prepareRoomMatchPlayers() {
    if (!this.currentRoom || this.role !== 'host') return null;
    const room = this.currentRoom;
    const emptySeats = room.seats.filter((s) => s.type === 'empty');

    if (emptySeats.length > 0 && !room.autoFillAi) {
      return { ok: false, reason: 'need_players_or_ai' };
    }

    const usedAvatars = new Set(room.seats.filter((s) => s.avatar).map((s) => s.avatar));
    const availableAvatars = AVATARS.filter((a) => !usedAvatars.has(a.id));
    let aiIdx = 0;

    for (const seat of room.seats) {
      if (seat.type === 'empty') {
        const av = availableAvatars[aiIdx % Math.max(1, availableAvatars.length)] || AVATARS[seat.seatIndex % AVATARS.length];
        aiIdx++;
        seat.type = 'ai';
        seat.peerId = null;
        seat.name = av.name;
        seat.avatar = av.id;
      }
    }

    room.status = 'playing';
    this._publishHostRoom(true);
    this._emitRoomState();

    const customPlayers = room.seats.map((s) => ({
      name: s.name,
      avatar: s.avatar,
      isHuman: s.type === 'human',
      peerId: s.peerId || null
    }));

    return { ok: true, customPlayers, room };
  }

  broadcastMatchState(fullState, event = null) {
    if (this.role !== 'host' || !this.currentRoom || !fullState) return;
    const code = this.currentRoom.code;
    for (const seat of this.currentRoom.seats) {
      if (seat.seatIndex === 0 || seat.type !== 'human' || !seat.peerId) continue;
      const view = sanitizeStateForSeat(fullState, seat.seatIndex);
      this.client.publish(
        `${TOPIC_PREFIX}/room/${code}/to_client/${seat.peerId}`,
        JSON.stringify({ type: 'state', view, event })
      );
    }
  }

  broadcastEvent(payload) {
    if (this.role !== 'host' || !this.currentRoom) return;
    this.client.publish(
      `${TOPIC_PREFIX}/room/${this.currentRoom.code}/broadcast`,
      JSON.stringify(payload)
    );
  }

  // ================= GUEST =================

  async joinRoom({ code, password = '', name = 'Jogador', avatar = 'defy', preferredBrokerIndex = null }) {
    const cleanCode = String(code || '').trim().toUpperCase();
    if (!cleanCode) {
      throw new Error('invalid_code');
    }

    await this.leaveOrCloseSilently();
    const targetBroker =
      preferredBrokerIndex !== null && MQTT_BROKERS[preferredBrokerIndex]
        ? preferredBrokerIndex
        : this.brokerIndex;
    await this.ensureConnected(targetBroker);

    const room = await this._waitForRoomRecord(cleanCode, 3000);
    if (!room) {
      throw new Error('not_found');
    }
    if (room.status !== 'waiting') {
      throw new Error('already_started');
    }
    if (!Array.isArray(room.seats) || !room.seats.some((s) => s.type === 'empty')) {
      throw new Error('room_full');
    }

    const pwdHash = room.visibility === 'code_password' ? hashPassword(cleanCode, password) : null;
    if (room.visibility === 'code_password' && pwdHash !== room.passwordHash) {
      throw new Error('wrong_password');
    }

    const clientTopic = `${TOPIC_PREFIX}/room/${cleanCode}/to_client/${this.peerId}`;
    const bcastTopic = `${TOPIC_PREFIX}/room/${cleanCode}/broadcast`;
    this.client.subscribe(clientTopic);
    this.client.subscribe(bcastTopic);

    const ack = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingJoin) {
          this.pendingJoin = null;
          this.client.unsubscribe(clientTopic);
          this.client.unsubscribe(bcastTopic);
          reject(new Error('host_timeout'));
        }
      }, 6000);

      this.pendingJoin = {
        code: cleanCode,
        resolve: (data) => {
          clearTimeout(timer);
          resolve(data);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        }
      };

      this.client.publish(
        `${TOPIC_PREFIX}/room/${cleanCode}/to_host`,
        JSON.stringify({
          type: 'join_req',
          peerId: this.peerId,
          name: String(name || 'Jogador').trim().slice(0, 14) || 'Jogador',
          avatar,
          passwordHash: pwdHash
        })
      );
    });

    this.role = 'guest';
    this.localSeatIndex = ack.seatIndex;
    this.currentRoom = ack.room;
    this.lastHostSeen = Date.now();
    this._startGuestHeartbeat();
    this._emitRoomState();
    return { room: ack.room, seatIndex: ack.seatIndex };
  }

  _startGuestHeartbeat() {
    clearInterval(this.guestHeartbeatTimer);
    this.guestHeartbeatTimer = setInterval(() => {
      if (this.role !== 'guest' || !this.currentRoom) return;
      this.client.publish(
        `${TOPIC_PREFIX}/room/${this.currentRoom.code}/to_host`,
        JSON.stringify({
          type: 'heartbeat',
          peerId: this.peerId,
          seatIndex: this.localSeatIndex
        })
      );
    }, 10000);
  }

  _handleGuestMessage(msg) {
    this.lastHostSeen = Date.now();

    if (msg.type === 'join_ack' && this.pendingJoin) {
      const pj = this.pendingJoin;
      this.pendingJoin = null;
      if (msg.ok) {
        pj.resolve(msg);
      } else {
        pj.reject(new Error(msg.reason || 'join_failed'));
      }
      return;
    }

    if (this.role !== 'guest') return;

    if (msg.type === 'room_update' && msg.room) {
      this.currentRoom = msg.room;
      this._emitRoomState();
    } else if (msg.type === 'room_closed') {
      this._handleRemoteRoomClosed(msg.reason || 'host_closed');
    } else if (msg.type === 'state' && msg.view) {
      if (this.callbacks.onMatchStateReceived) {
        this.callbacks.onMatchStateReceived(msg.view, msg.event || null);
      }
    } else if (msg.type === 'callout') {
      if (this.callbacks.onCallout) {
        this.callbacks.onCallout(msg);
      }
    } else if (msg.type === 'hide_callout') {
      if (this.callbacks.onHideCallout) {
        this.callbacks.onHideCallout();
      }
    } else if (msg.type === 'round_modal') {
      if (this.callbacks.onRoundModal) {
        this.callbacks.onRoundModal(msg);
      }
    } else if (msg.type === 'gameover_modal') {
      if (this.callbacks.onGameOverModal) {
        this.callbacks.onGameOverModal(msg);
      }
    } else if (msg.type === 'jokenpo_state') {
      if (this.callbacks.onJokenpoState) {
        this.callbacks.onJokenpoState(msg);
      }
    } else if (msg.type === 'speech_bubble') {
      if (this.callbacks.onSpeechBubble) {
        this.callbacks.onSpeechBubble(msg.playerIndex, msg.text, msg.durationMs);
      }
    }
  }

  _handleRemoteRoomClosed(reason) {
    const code = this.currentRoom?.code;
    this._clearTimers();
    if (code) {
      this.client.unsubscribe(`${TOPIC_PREFIX}/room/${code}/to_client/${this.peerId}`);
      this.client.unsubscribe(`${TOPIC_PREFIX}/room/${code}/broadcast`);
      this.rooms.delete(code);
    }
    this.role = null;
    this.localSeatIndex = 0;
    this.currentRoom = null;
    this._emitRoomsChanged();
    this._emitRoomState();
    if (this.callbacks.onRoomClosed) {
      this.callbacks.onRoomClosed(reason);
    }
  }

  sendAction(action, cardId) {
    if (this.role !== 'guest' || !this.currentRoom) return false;
    return this.client.publish(
      `${TOPIC_PREFIX}/room/${this.currentRoom.code}/to_host`,
      JSON.stringify({
        type: 'action',
        peerId: this.peerId,
        seatIndex: this.localSeatIndex,
        action,
        cardId
      })
    );
  }

  sendJokenpoPick(suit) {
    if (this.role !== 'guest' || !this.currentRoom) return false;
    return this.client.publish(
      `${TOPIC_PREFIX}/room/${this.currentRoom.code}/to_host`,
      JSON.stringify({
        type: 'jokenpo_pick',
        peerId: this.peerId,
        seatIndex: this.localSeatIndex,
        suit
      })
    );
  }

  _clearTimers() {
    clearInterval(this.hostHeartbeatTimer);
    clearInterval(this.guestHeartbeatTimer);
    this.hostHeartbeatTimer = null;
    this.guestHeartbeatTimer = null;
  }

  async leaveRoom() {
    const prevRole = this.role;
    const room = this.currentRoom;
    this._clearTimers();
    this.pendingJoin = null;

    if (!room) {
      this.role = null;
      this.localSeatIndex = 0;
      return;
    }

    if (prevRole === 'host') {
      this.broadcastEvent({ type: 'room_closed', reason: 'host_closed' });
      this.client.publish(`${TOPIC_PREFIX}/rooms/${room.code}`, '', { retain: true });
      this.client.unsubscribe(`${TOPIC_PREFIX}/room/${room.code}/to_host`);
      this.rooms.delete(room.code);
      this._emitRoomsChanged();
    } else if (prevRole === 'guest') {
      this.client.publish(
        `${TOPIC_PREFIX}/room/${room.code}/to_host`,
        JSON.stringify({ type: 'leave', peerId: this.peerId })
      );
      this.client.unsubscribe(`${TOPIC_PREFIX}/room/${room.code}/to_client/${this.peerId}`);
      this.client.unsubscribe(`${TOPIC_PREFIX}/room/${room.code}/broadcast`);
    }

    this.role = null;
    this.localSeatIndex = 0;
    this.currentRoom = null;
    this._emitRoomState();
  }

  async leaveOrCloseSilently() {
    if (this.currentRoom) {
      await this.leaveRoom();
    }
  }
}
