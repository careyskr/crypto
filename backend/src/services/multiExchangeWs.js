import WebSocket from 'ws';

const WS_URLS = {
  binance: 'wss://stream.binance.com:9443/ws',
  bybit: 'wss://stream.bybit.com/v5/public/spot',
  okx: 'wss://ws.okx.com:8443/ws/v5/public',
  kucoin: null,
  coinbase: 'wss://ws-feed.exchange.coinbase.com',
  kraken: 'wss://ws.kraken.com',
};

export class MultiExchangeWebSocketService {
  constructor(io, priceCache = {}) {
    this.io = io;
    this.priceCache = priceCache;
    this.connections = {};
    this.subscriptions = new Map();
    this.clientSubs = new Map();
    this.reconnectTimers = {};
    this.heartbeatTimers = {};
    this.kucoinPolling = {};
    this.coinbaseSubscriptions = new Map();
    this.krakenSubscriptionIds = new Map();
  }

  start() {}

  getStreamKey(exchange, symbol) {
    return `${exchange}:${symbol.toLowerCase()}`;
  }

  subscribe(exchange, symbol, clientId) {
    const key = this.getStreamKey(exchange, symbol);
    if (!this.subscriptions.has(key)) this.subscriptions.set(key, new Set());
    this.subscriptions.get(key).add(clientId);
    if (!this.clientSubs.has(clientId)) this.clientSubs.set(clientId, new Set());
    this.clientSubs.get(clientId).add(key);
    this.connectExchange(exchange);
  }

  unsubscribe(exchange, symbol, clientId) {
    const key = this.getStreamKey(exchange, symbol);
    if (this.subscriptions.has(key)) {
      this.subscriptions.get(key).delete(clientId);
      if (this.subscriptions.get(key).size === 0) this.subscriptions.delete(key);
    }
    if (this.clientSubs.has(clientId)) this.clientSubs.get(clientId).delete(key);
  }

  removeClient(clientId) {
    const keys = this.clientSubs.get(clientId);
    if (keys) {
      for (const key of keys) {
        if (this.subscriptions.has(key)) this.subscriptions.get(key).delete(clientId);
      }
    }
    this.clientSubs.delete(clientId);
  }

  getActiveSymbols(exchange) {
    const symbols = [];
    for (const key of this.subscriptions.keys()) {
      if (key.startsWith(exchange + ':') && this.subscriptions.get(key).size > 0) {
        symbols.push(key.split(':')[1]);
      }
    }
    return [...new Set(symbols)];
  }

  connectExchange(exchange) {
    if (exchange === 'kucoin') { this.startKucoinPolling(); return; }
    if (exchange === 'coinbase') { this.connectCoinbase(); return; }
    if (exchange === 'kraken') { this.connectKraken(); return; }
    if (this.connections[exchange] && this.connections[exchange].readyState === WebSocket.OPEN) {
      this.sendSubscriptions(exchange);
      return;
    }
    if (exchange === 'binance') this.connectBinance();
    else if (exchange === 'bybit') this.connectBybit();
    else if (exchange === 'okx') this.connectOkx();
  }

  connectBinance() {
    const exchange = 'binance';
    const symbols = this.getActiveSymbols(exchange);
    if (symbols.length === 0) return;
    const streams = symbols.map(s => `${s}@ticker`).join('/');
    const url = `${WS_URLS.binance}/stream?streams=${streams}`;
    if (this.connections[exchange]) this.connections[exchange].close();
    const ws = new WebSocket(url);
    this.connections[exchange] = ws;
    ws.on('open', () => { console.log(`[${exchange}] WS connected`); this.clearReconnect(exchange); });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        const payload = msg.data || msg;
        if (payload.e === '24hrTicker') {
          this.emitTicker(exchange, payload.s, {
            symbol: payload.s, lastPrice: parseFloat(payload.c),
            priceChange: parseFloat(payload.p), priceChangePercent: parseFloat(payload.P),
            volume: parseFloat(payload.v), quoteVolume: parseFloat(payload.q),
            highPrice: parseFloat(payload.h), lowPrice: parseFloat(payload.l),
          });
        }
      } catch {}
    });
    ws.on('close', () => { this.scheduleReconnect(exchange); });
    ws.on('error', (err) => {});
  }

  connectBybit() {
    const exchange = 'bybit';
    const symbols = this.getActiveSymbols(exchange);
    if (symbols.length === 0) return;
    if (this.connections[exchange]) this.connections[exchange].close();
    const ws = new WebSocket(WS_URLS.bybit);
    this.connections[exchange] = ws;
    ws.on('open', () => {
      console.log(`[${exchange}] WS connected`);
      this.clearReconnect(exchange);
      const args = symbols.map(s => `tickers.${s.toUpperCase()}`);
      ws.send(JSON.stringify({ op: 'subscribe', args }));
    });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.topic && msg.topic.startsWith('tickers.') && msg.data) {
          const d = msg.data;
          this.emitTicker(exchange, d.symbol, {
            symbol: d.symbol, lastPrice: parseFloat(d.lastPrice),
            priceChange: parseFloat(d.price24h) - parseFloat(d.prevPrice24h),
            priceChangePercent: parseFloat(d.price24hPcnt) * 100,
            volume: parseFloat(d.volume24h), quoteVolume: parseFloat(d.turnover24h),
            highPrice: parseFloat(d.highPrice24h), lowPrice: parseFloat(d.lowPrice24h),
          });
        }
        if (msg.op === 'ping') ws.send(JSON.stringify({ op: 'pong' }));
      } catch {}
    });
    ws.on('close', () => this.scheduleReconnect(exchange));
    ws.on('error', () => {});
  }

  connectOkx() {
    const exchange = 'okx';
    const symbols = this.getActiveSymbols(exchange);
    if (symbols.length === 0) return;
    if (this.connections[exchange]) this.connections[exchange].close();
    const ws = new WebSocket(WS_URLS.okx);
    this.connections[exchange] = ws;
    ws.on('open', () => {
      console.log(`[${exchange}] WS connected`);
      this.clearReconnect(exchange);
      const args = symbols.map(s => ({ channel: 'tickers', instId: s.toUpperCase().replace('USDT', '-USDT') }));
      ws.send(JSON.stringify({ op: 'subscribe', args }));
    });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.arg?.channel === 'tickers' && msg.data) {
          for (const d of msg.data) {
            const symbol = d.instId.replace('-', '');
            const last = parseFloat(d.last);
            const open24h = parseFloat(d.open24h);
            this.emitTicker(exchange, symbol, {
              symbol, lastPrice: last,
              priceChange: last - open24h,
              priceChangePercent: open24h > 0 ? ((last - open24h) / open24h) * 100 : 0,
              volume: parseFloat(d.vol24h), quoteVolume: parseFloat(d.volCcy24h),
              highPrice: parseFloat(d.high24h), lowPrice: parseFloat(d.low24h),
            });
          }
        }
        if (msg.event === 'login' || msg.msg === 'ping') ws.send('pong');
      } catch {}
    });
    ws.on('close', () => this.scheduleReconnect(exchange));
    ws.on('error', () => {});
  }

  connectCoinbase() {
    const exchange = 'coinbase';
    const symbols = this.getActiveSymbols(exchange);
    if (symbols.length === 0) return;
    const wsKey = exchange;
    if (this.connections[wsKey]) this.connections[wsKey].close();
    const ws = new WebSocket(WS_URLS.coinbase);
    this.connections[wsKey] = ws;

    ws.on('open', () => {
      console.log(`[${exchange}] WS connected`);
      this.clearReconnect(exchange);
      const productIds = symbols.map(s => s.replace('USDT', '-USD'));
      const subscribeMsg = {
        type: 'subscribe',
        product_ids: productIds,
        channels: ['ticker'],
      };
      ws.send(JSON.stringify(subscribeMsg));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'ticker' && msg.product_id) {
          const symbol = msg.product_id.replace('-USD', 'USDT');
          this.emitTicker(exchange, symbol, {
            symbol, lastPrice: parseFloat(msg.price),
            priceChange: 0,
            priceChangePercent: msg.price && msg.open_24h ? ((parseFloat(msg.price) - parseFloat(msg.open_24h)) / parseFloat(msg.open_24h)) * 100 : 0,
            volume: parseFloat(msg.volume_24h || 0),
            quoteVolume: parseFloat(msg.volume_24h || 0) * parseFloat(msg.price || 0),
            highPrice: parseFloat(msg.high_24h || 0),
            lowPrice: parseFloat(msg.low_24h || 0),
          });
        }
      } catch {}
    });

    ws.on('close', () => {
      console.log(`[${exchange}] WS disconnected`);
      this.scheduleReconnect(exchange);
    });
    ws.on('error', () => {});

    // Coinbase heartbeat
    this.heartbeatTimers[exchange] = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'heartbeat', on: true }));
      }
    }, 10000);
  }

  connectKraken() {
    const exchange = 'kraken';
    const symbols = this.getActiveSymbols(exchange);
    if (symbols.length === 0) return;
    if (this.connections[exchange]) this.connections[exchange].close();
    const ws = new WebSocket(WS_URLS.kraken);
    this.connections[exchange] = ws;
    let subId = 1;

    ws.on('open', () => {
      console.log(`[${exchange}] WS connected`);
      this.clearReconnect(exchange);
      const pairs = symbols.map(s => s.replace('USDT', '/USDT'));
      const subscribeMsg = {
        event: 'subscribe',
        pair: pairs,
        subscription: { name: 'ticker' },
      };
      ws.send(JSON.stringify(subscribeMsg));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.event === 'heartbeat') return;
        if (Array.isArray(msg) && msg[1] && typeof msg[2] === 'string') {
          const tickerData = msg[1];
          const pairName = msg[3] || msg[2];
          if (tickerData.c && tickerData.c[0]) {
            const symbol = pairName.replace('/', '').replace('USDT', 'USDT');
            const lastPrice = parseFloat(tickerData.c[0]);
            const openPrice = parseFloat(tickerData.o || tickerData.p || 0);
            this.emitTicker(exchange, symbol, {
              symbol, lastPrice,
              priceChange: lastPrice - openPrice,
              priceChangePercent: openPrice > 0 ? ((lastPrice - openPrice) / openPrice) * 100 : 0,
              volume: parseFloat(tickerData.v?.[1] || 0),
              quoteVolume: parseFloat(tickerData.v?.[1] || 0) * lastPrice,
              highPrice: parseFloat(tickerData.h?.[1] || 0),
              lowPrice: parseFloat(tickerData.l?.[1] || 0),
            });
          }
        }
        if (msg.event === 'subscriptionStatus' && msg.status === 'error') {
          console.error(`[${exchange}] Subscription error:`, msg.errorMessage);
        }
      } catch {}
    });

    ws.on('close', () => {
      console.log(`[${exchange}] WS disconnected`);
      this.scheduleReconnect(exchange);
    });
    ws.on('error', () => {});

    // Kraken heartbeat
    this.heartbeatTimers[exchange] = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: 'ping' }));
      }
    }, 20000);
  }

  startKucoinPolling() {
    const exchange = 'kucoin';
    if (this.kucoinPolling[exchange]) return;
    const poll = async () => {
      const symbols = this.getActiveSymbols(exchange);
      if (symbols.length === 0) { this.stopKucoinPolling(); return; }
      for (const sym of symbols) {
        try {
          const kucoinSym = sym.toUpperCase().replace('USDT', '-USDT');
          const res = await fetch(`https://api.kucoin.com/api/v1/market/stats?symbol=${kucoinSym}`);
          const data = await res.json();
          if (data.code === '200000' && data.data) {
            const d = data.data;
            this.emitTicker(exchange, sym.toUpperCase(), {
              symbol: sym.toUpperCase(), lastPrice: parseFloat(d.last),
              priceChange: parseFloat(d.changePrice),
              priceChangePercent: parseFloat(d.changeRate) * 100,
              volume: parseFloat(d.vol), quoteVolume: parseFloat(d.volValue),
              highPrice: parseFloat(d.high), lowPrice: parseFloat(d.low),
            });
          }
        } catch {}
      }
    };
    this.kucoinPolling[exchange] = setInterval(poll, 5000);
    poll();
  }

  stopKucoinPolling() {
    if (this.kucoinPolling.kucoin) {
      clearInterval(this.kucoinPolling.kucoin);
      this.kucoinPolling.kucoin = null;
    }
  }

  sendSubscriptions(exchange) {
    const symbols = this.getActiveSymbols(exchange);
    const ws = this.connections[exchange];
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (exchange === 'binance') { this.connectBinance(); }
    else if (exchange === 'bybit') {
      const args = symbols.map(s => `tickers.${s.toUpperCase()}`);
      ws.send(JSON.stringify({ op: 'subscribe', args }));
    } else if (exchange === 'okx') {
      const args = symbols.map(s => ({ channel: 'tickers', instId: s.toUpperCase().replace('USDT', '-USDT') }));
      ws.send(JSON.stringify({ op: 'subscribe', args }));
    } else if (exchange === 'coinbase') {
      const productIds = symbols.map(s => s.replace('USDT', '-USD'));
      ws.send(JSON.stringify({ type: 'subscribe', product_ids: productIds, channels: ['ticker'] }));
    } else if (exchange === 'kraken') {
      const pairs = symbols.map(s => s.replace('USDT', '/USDT'));
      ws.send(JSON.stringify({ event: 'subscribe', pair: pairs, subscription: { name: 'ticker' } }));
    }
  }

  emitTicker(exchange, symbol, data) {
    data.exchange = exchange;
    const normalizedSymbol = symbol.toUpperCase().replace('-', '');
    if (data.lastPrice) this.priceCache[normalizedSymbol] = data.lastPrice;
    this.io.to(`ticker:${normalizedSymbol}`).emit('ticker', data);
    this.io.to(`exchange:${exchange}:${normalizedSymbol}`).emit('ticker', data);
    this.io.to(`exchange:${exchange}`).emit('ticker', data);
  }

  scheduleReconnect(exchange) {
    this.clearReconnect(exchange);
    this.reconnectTimers[exchange] = setTimeout(() => {
      this.connectExchange(exchange);
    }, 3000);
  }

  clearReconnect(exchange) {
    if (this.reconnectTimers[exchange]) {
      clearTimeout(this.reconnectTimers[exchange]);
      delete this.reconnectTimers[exchange];
    }
  }
}
