import WebSocket from 'ws';

const BINANCE_WS = 'wss://stream.binance.com:9443/ws';

export class BinanceWebSocketService {
  constructor(io) {
    this.io = io;
    this.ws = null;
    this.subscriptions = new Map(); // stream -> Set<clientId>
    this.clientSubs = new Map();    // clientId -> Set<stream>
    this.klineWs = new Map();       // interval -> ws
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.heartbeatInterval = null;
  }

  start() {
    this.connectTicker();
  }

  connectTicker() {
    const streams = this.getStreamsList();
    if (streams.length === 0) {
      // Connect to a default stream to keep the connection alive
      this.ws = new WebSocket(`${BINANCE_WS}/btcusdt@ticker`);
    } else {
      const streamStr = streams.join('/');
      this.ws = new WebSocket(`${BINANCE_WS}/stream?streams=${streamStr}`);
    }

    this.ws.on('open', () => {
      console.log('Binance WebSocket connected');
      this.reconnectDelay = 1000;
      this.startHeartbeat();
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        // Combined stream format: { stream: "...", data: {...} }
        const stream = msg.stream || '';
        const payload = msg.data || msg;

        if (payload.e === '24hrTicker') {
          this.io.to(`ticker:${payload.s}`).emit('ticker', {
            symbol: payload.s,
            priceChange: parseFloat(payload.p),
            priceChangePercent: parseFloat(payload.P),
            lastPrice: parseFloat(payload.c),
            volume: parseFloat(payload.v),
            quoteVolume: parseFloat(payload.q),
            highPrice: parseFloat(payload.h),
            lowPrice: parseFloat(payload.l),
            count: parseInt(payload.n),
          });
        } else if (payload.e === 'kline') {
          const k = payload.k;
          this.io.to(`kline:${k.s}:${k.i}`).emit('kline', {
            symbol: k.s,
            interval: k.i,
            time: k.t / 1000,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
            isFinal: k.x,
          });
        }
      } catch (err) {
        // Ignore parse errors
      }
    });

    this.ws.on('close', () => {
      console.log('Binance WebSocket disconnected, reconnecting...');
      this.stopHeartbeat();
      setTimeout(() => this.connectTicker(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    });

    this.ws.on('error', (err) => {
      console.error('Binance WebSocket error:', err.message);
    });
  }

  getStreamsList() {
    const streams = [];
    for (const stream of this.subscriptions.keys()) {
      if (this.subscriptions.get(stream).size > 0) {
        streams.push(stream);
      }
    }
    return streams;
  }

  subscribe(symbol, clientId) {
    const stream = `${symbol.toLowerCase()}@ticker`;
    if (!this.subscriptions.has(stream)) {
      this.subscriptions.set(stream, new Set());
    }
    this.subscriptions.get(stream).add(clientId);

    if (!this.clientSubs.has(clientId)) {
      this.clientSubs.set(clientId, new Set());
    }
    this.clientSubs.get(clientId).add(stream);

    // Reconnect to pick up new subscription
    this.reconnect();
  }

  unsubscribe(symbol, clientId) {
    const stream = `${symbol.toLowerCase()}@ticker`;
    if (this.subscriptions.has(stream)) {
      this.subscriptions.get(stream).delete(clientId);
    }
    if (this.clientSubs.has(clientId)) {
      this.clientSubs.get(clientId).delete(stream);
    }
  }

  subscribeKline(symbol, interval, clientId) {
    const stream = `${symbol.toLowerCase()}@kline_${interval}`;
    if (!this.subscriptions.has(stream)) {
      this.subscriptions.set(stream, new Set());
    }
    this.subscriptions.get(stream).add(clientId);

    if (!this.clientSubs.has(clientId)) {
      this.clientSubs.set(clientId, new Set());
    }
    this.clientSubs.get(clientId).add(stream);

    this.reconnect();
  }

  unsubscribeKline(symbol, interval, clientId) {
    const stream = `${symbol.toLowerCase()}@kline_${interval}`;
    if (this.subscriptions.has(stream)) {
      this.subscriptions.get(stream).delete(clientId);
    }
    if (this.clientSubs.has(clientId)) {
      this.clientSubs.get(clientId).delete(stream);
    }
  }

  removeClient(clientId) {
    const streams = this.clientSubs.get(clientId);
    if (streams) {
      for (const stream of streams) {
        if (this.subscriptions.has(stream)) {
          this.subscriptions.get(stream).delete(clientId);
        }
      }
    }
    this.clientSubs.delete(clientId);
  }

  reconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}
