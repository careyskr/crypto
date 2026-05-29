import db from '../db/database.js';

function calcPnL(trade, currentPrice, includeFees = true) {
  const diff = trade.side === 'long'
    ? (currentPrice - trade.entry_price)
    : (trade.entry_price - currentPrice);
  const grossPnl = diff * trade.quantity * trade.leverage;
  if (!includeFees) return grossPnl;
  const exitFee = currentPrice * trade.quantity * 0.001;
  return grossPnl - trade.fee - exitFee;
}

function calcPnLPercent(trade, currentPrice, includeFees = false) {
  const margin = (trade.entry_price * trade.quantity) / trade.leverage;
  if (margin === 0) return 0;
  return (calcPnL(trade, currentPrice, includeFees) / margin) * 100;
}

function calcLiquidationPrice(entryPrice, leverage, side) {
  if (leverage <= 0) return null;
  if (side === 'long') return entryPrice * (1 - 1 / leverage + 0.005);
  return entryPrice * (1 + 1 / leverage - 0.005);
}

function calculateDuration(openedAt) {
  const ms = Date.now() - new Date(openedAt).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function computeTpProgress(trade, currentPrice) {
  if (!trade.take_profit_1 || trade.entry_price === currentPrice) return 0;
  if (trade.side === 'long') {
    if (currentPrice <= trade.entry_price) return 0;
    return Math.min(100, ((currentPrice - trade.entry_price) / (trade.take_profit_1 - trade.entry_price)) * 100);
  }
  if (currentPrice >= trade.entry_price) return 0;
  return Math.min(100, ((trade.entry_price - currentPrice) / (trade.entry_price - trade.take_profit_1)) * 100);
}

function computeSlDistance(trade, currentPrice) {
  if (!trade.stop_loss || trade.entry_price === 0) return null;
  if (trade.side === 'long') return ((currentPrice - trade.stop_loss) / trade.entry_price) * 100;
  return ((trade.stop_loss - currentPrice) / trade.entry_price) * 100;
}

export class PaperTradingService {
  getAccount() { return db.getAccount(); }

  resetAccount(balance = 10000) {
    return db.resetAccount(balance);
  }

  openTrade({ symbol, side, entryPrice, quantity, leverage = 1, stopLoss, tp1, tp2, tp3, signalId, reason, orderType = 'market' }) {
    const isPending = orderType !== 'market';

    if (stopLoss !== undefined && stopLoss !== null) {
      if (side === 'long' && stopLoss > entryPrice) throw new Error('Stop loss must be below entry price for long trades');
      if (side === 'short' && stopLoss < entryPrice) throw new Error('Stop loss must be above entry price for short trades');
    }
    if (tp1 !== undefined && tp1 !== null) {
      if (side === 'long' && tp1 < entryPrice) throw new Error('Take profit must be above entry price for long trades');
      if (side === 'short' && tp1 > entryPrice) throw new Error('Take profit must be below entry price for short trades');
    }
    if (tp2 !== undefined && tp2 !== null) {
      if (side === 'long' && tp2 < entryPrice) throw new Error('Take profit 2 must be above entry price for long trades');
      if (side === 'short' && tp2 > entryPrice) throw new Error('Take profit 2 must be below entry price for short trades');
    }
    if (tp3 !== undefined && tp3 !== null) {
      if (side === 'long' && tp3 < entryPrice) throw new Error('Take profit 3 must be above entry price for long trades');
      if (side === 'short' && tp3 > entryPrice) throw new Error('Take profit 3 must be below entry price for short trades');
    }

    if (!isPending) {
      const account = db.getAccount();
      const fee = entryPrice * quantity * 0.001;
      const margin = (entryPrice * quantity) / leverage;
      if (margin + fee > account.balance) throw new Error('Insufficient balance');

      const trade = db.addTrade({
        account_id: 1, symbol, side, type: 'market',
        entry_price: entryPrice, quantity, leverage,
        stop_loss: stopLoss || null, take_profit_1: tp1 || null,
        take_profit_2: tp2 || null, take_profit_3: tp3 || null,
        trailing_stop: null, trailing_stop_activated: false,
        highest_price: entryPrice, lowest_price: entryPrice,
        current_price: entryPrice,
        fee, signal_id: signalId || null, reason: reason || null,
        pnl: 0, pnl_percent: 0, exit_price: null,
      });

      db.updateAccount({ balance: account.balance - margin - fee });
      return trade;
    }

    // Pending order (limit/stop) — no balance deduction, no PnL tracking
    const trade = db.addTrade({
      account_id: 1, symbol, side, type: orderType,
      entry_price: entryPrice, quantity, leverage,
      stop_loss: stopLoss || null, take_profit_1: tp1 || null,
      take_profit_2: tp2 || null, take_profit_3: tp3 || null,
      trailing_stop: null, trailing_stop_activated: false,
      highest_price: null, lowest_price: null,
      current_price: null,
      fee: 0, signal_id: signalId || null, reason: reason || null,
      pnl: 0, pnl_percent: 0, exit_price: null,
      status: 'pending',
    });

    return trade;
  }

  executePendingOrder(tradeId, currentPrice) {
    const trade = db.getTrade(tradeId);
    if (!trade || trade.status !== 'pending') throw new Error('Order not found or already executed');

    const price = parseFloat(currentPrice);
    const account = db.getAccount();
    const fee = price * trade.quantity * 0.001;
    const margin = (price * trade.quantity) / trade.leverage;

    if (margin + fee > account.balance) throw new Error('Insufficient balance to execute order');

    console.log(`[ORDER EXECUTED] ${trade.symbol} ${trade.side} ${trade.type} at ${price} (was pending entry ${trade.entry_price})`);

    db.updateTrade(tradeId, {
      entry_price: price,
      current_price: price,
      highest_price: price,
      lowest_price: price,
      fee,
      status: 'open',
      type: 'market',
      executed_at: new Date().toISOString(),
    });

    db.updateAccount({ balance: account.balance - margin - fee });
    return db.getTrade(tradeId);
  }

  cancelPendingOrder(tradeId) {
    const trade = db.getTrade(tradeId);
    if (!trade || trade.status !== 'pending') throw new Error('Order not found or already executed');
    db.updateTrade(tradeId, { status: 'cancelled', closed_at: new Date().toISOString(), reason: 'cancelled' });
    return db.getTrade(tradeId);
  }

  modifyPendingOrder(tradeId, updates) {
    const trade = db.getTrade(tradeId);
    if (!trade || trade.status !== 'pending') throw new Error('Order not found or already executed');

    const allowed = {};
    if (updates.entryPrice !== undefined) allowed.entry_price = updates.entryPrice;
    if (updates.stopLoss !== undefined) allowed.stop_loss = updates.stopLoss;
    if (updates.tp1 !== undefined) allowed.take_profit_1 = updates.tp1;
    if (updates.tp2 !== undefined) allowed.take_profit_2 = updates.tp2;
    if (updates.tp3 !== undefined) allowed.take_profit_3 = updates.tp3;
    if (updates.quantity !== undefined) allowed.quantity = updates.quantity;

    db.updateTrade(tradeId, allowed);
    return db.getTrade(tradeId);
  }

  async checkPendingOrders(priceCache) {
    const pendingOrders = db.getPendingOrders();
    const executed = [];

    for (const order of pendingOrders) {
      let raw = priceCache[order.symbol];

      // If price missing, try to fetch it live from Binance
      if (raw === undefined || raw === null) {
        try {
          const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${order.symbol}`);
          if (res.ok) {
            const p = await res.json();
            if (p.symbol && p.price) {
              priceCache[p.symbol] = parseFloat(p.price);
              raw = priceCache[order.symbol];
            }
          }
        } catch {}
        if (!raw) continue;
      }

      const current = parseFloat(raw);
      const entry = parseFloat(order.entry_price);

      if (isNaN(current) || isNaN(entry)) continue;

      let shouldExecute = false;

      if (order.type === 'limit') {
        if (order.side === 'long' && current <= entry) shouldExecute = true;
        if (order.side === 'short' && current >= entry) shouldExecute = true;
      } else if (order.type === 'stop') {
        if (order.side === 'long' && current >= entry) shouldExecute = true;
        if (order.side === 'short' && current <= entry) shouldExecute = true;
      }

      if (shouldExecute) {
        try {
          const executedTrade = await this.executePendingOrder(order.id, current);
          executed.push(executedTrade);
        } catch (err) {
          console.log(`[ORDER FAILED] ${order.symbol}: ${err.message}`);
        }
      }
    }

    return executed;
  }

  getPendingOrders() { return db.getPendingOrders(); }

  closeTrade(tradeId, exitPrice, reason = 'manual') {
    const trade = db.getTrade(tradeId);
    if (!trade || trade.status !== 'open') throw new Error('Trade not found or already closed');

    const grossPnl = +calcPnL(trade, exitPrice, false).toFixed(2);
    const exitFee = +(exitPrice * trade.quantity * 0.001).toFixed(2);
    const netPnl = +(grossPnl - exitFee).toFixed(2);
    const totalFees = +(trade.fee + exitFee).toFixed(2);
    const margin = (trade.entry_price * trade.quantity) / trade.leverage;
    const pnlPercent = margin > 0 ? +((netPnl / margin) * 100).toFixed(2) : 0;
    const isWin = netPnl > 0;
    const account = db.getAccount();

    db.updateTrade(tradeId, {
      exit_price: exitPrice, pnl: netPnl, pnl_percent: pnlPercent,
      fee: totalFees, status: 'closed',
      closed_at: new Date().toISOString(), reason,
    });

    db.updateAccount({
      balance: +((account.balance + margin + netPnl).toFixed(2)),
      total_pnl: +((account.total_pnl + netPnl).toFixed(2)),
      win_count: account.win_count + (isWin ? 1 : 0),
      loss_count: account.loss_count + (isWin ? 0 : 1),
    });

    return db.getTrade(tradeId);
  }

  modifyTrade(tradeId, updates) {
    const trade = db.getTrade(tradeId);
    if (!trade || trade.status !== 'open') throw new Error('Trade not found or already closed');

    const allowed = {};
    if (updates.stopLoss !== undefined) allowed.stop_loss = updates.stopLoss;
    if (updates.tp1 !== undefined) allowed.take_profit_1 = updates.tp1;
    if (updates.tp2 !== undefined) allowed.take_profit_2 = updates.tp2;
    if (updates.tp3 !== undefined) allowed.take_profit_3 = updates.tp3;
    if (updates.trailingStop !== undefined) {
      allowed.trailing_stop = updates.trailingStop ? parseFloat(updates.trailingStop) : null;
      if (updates.trailingStop) {
        allowed.trailing_stop_activated = false;
      }
    }
    if (updates.slToBreakeven) {
      allowed.stop_loss = trade.entry_price;
    }

    if (allowed.stop_loss !== undefined && allowed.stop_loss !== null) {
      if (trade.side === 'long' && allowed.stop_loss > trade.entry_price) throw new Error('Stop loss must be below entry price for long trades');
      if (trade.side === 'short' && allowed.stop_loss < trade.entry_price) throw new Error('Stop loss must be above entry price for short trades');
    }
    if (allowed.take_profit_1 !== undefined && allowed.take_profit_1 !== null) {
      if (trade.side === 'long' && allowed.take_profit_1 < trade.entry_price) throw new Error('Take profit must be above entry price for long trades');
      if (trade.side === 'short' && allowed.take_profit_1 > trade.entry_price) throw new Error('Take profit must be below entry price for short trades');
    }
    if (allowed.take_profit_2 !== undefined && allowed.take_profit_2 !== null) {
      if (trade.side === 'long' && allowed.take_profit_2 < trade.entry_price) throw new Error('Take profit 2 must be above entry price for long trades');
      if (trade.side === 'short' && allowed.take_profit_2 > trade.entry_price) throw new Error('Take profit 2 must be below entry price for short trades');
    }
    if (allowed.take_profit_3 !== undefined && allowed.take_profit_3 !== null) {
      if (trade.side === 'long' && allowed.take_profit_3 < trade.entry_price) throw new Error('Take profit 3 must be above entry price for long trades');
      if (trade.side === 'short' && allowed.take_profit_3 > trade.entry_price) throw new Error('Take profit 3 must be below entry price for short trades');
    }

    db.updateTrade(tradeId, allowed);
    return db.getTrade(tradeId);
  }

  partialClose(tradeId, percentage) {
    const trade = db.getTrade(tradeId);
    if (!trade || trade.status !== 'open') throw new Error('Trade not found or already closed');
    const pct = parseFloat(percentage) / 100;
    if (pct <= 0 || pct > 1) throw new Error('Invalid percentage');

    const closeQty = trade.quantity * pct;
    const remainingQty = trade.quantity - closeQty;

    const grossPnlTotal = +calcPnL(trade, trade.current_price, false).toFixed(2);
    const proportionalGrossPnl = +(grossPnlTotal * pct).toFixed(2);
    const exitFee = +(trade.current_price * closeQty * 0.001).toFixed(2);
    const proportionalNetPnl = +(proportionalGrossPnl - exitFee).toFixed(2);
    const margin = (trade.entry_price * trade.quantity) / trade.leverage;
    const proportionalMargin = +(margin * pct).toFixed(2);
    const isWin = proportionalNetPnl > 0;
    const account = db.getAccount();

    db.addTrade({
      account_id: 1, symbol: trade.symbol, side: trade.side, type: 'market',
      entry_price: trade.entry_price, quantity: closeQty, leverage: trade.leverage,
      stop_loss: null, take_profit_1: null, take_profit_2: null, take_profit_3: null,
      trailing_stop: null, trailing_stop_activated: false,
      highest_price: trade.entry_price, lowest_price: trade.entry_price,
      current_price: trade.current_price,
      fee: +(trade.fee * pct + exitFee).toFixed(2), signal_id: null,
      reason: `partial_close_${percentage}pct`,
      pnl: proportionalNetPnl,
      pnl_percent: proportionalMargin > 0 ? +((proportionalNetPnl / proportionalMargin) * 100).toFixed(2) : 0,
      exit_price: trade.current_price, status: 'closed',
      closed_at: new Date().toISOString(),
    });

    if (remainingQty > 0) {
      const remainingFee = +(trade.fee * (1 - pct)).toFixed(2);
      db.updateTrade(tradeId, {
        quantity: +remainingQty.toFixed(8),
        fee: remainingFee,
      });
    } else {
      db.updateTrade(tradeId, {
        exit_price: trade.current_price, pnl: proportionalNetPnl, status: 'closed',
        closed_at: new Date().toISOString(), reason: 'partial_close_full',
      });
    }

    db.updateAccount({
      balance: +((account.balance + proportionalMargin + proportionalNetPnl).toFixed(2)),
      total_pnl: +((account.total_pnl + proportionalNetPnl).toFixed(2)),
      win_count: account.win_count + (isWin ? 1 : 0),
      loss_count: account.loss_count + (isWin ? 0 : 1),
    });

    return { remaining: remainingQty > 0 ? db.getTrade(tradeId) : null, closed: null };
  }

  getLiveTradeData(trade, currentPrice) {
    const upnl = +calcPnL(trade, currentPrice, false).toFixed(2);
    const upnlPercent = +calcPnLPercent(trade, currentPrice).toFixed(2);
    return {
      ...trade,
      current_price: currentPrice,
      unrealized_pnl: upnl,
      unrealized_pnl_percent: upnlPercent,
      liquidation_price: calcLiquidationPrice(trade.entry_price, trade.leverage, trade.side),
      duration: calculateDuration(trade.opened_at),
      tp_progress: computeTpProgress(trade, currentPrice),
      sl_distance: computeSlDistance(trade, currentPrice),
      margin: +((trade.entry_price * trade.quantity) / trade.leverage).toFixed(2),
      suggestions: this.getSuggestions(trade, currentPrice),
    };
  }

  checkStopLossAndTakeProfit(symbol, currentPrice) {
    const openTrades = db.getOpenTrades().filter(t => t.symbol === symbol);
    for (const trade of openTrades) {
      if (trade.stop_loss) {
        if (trade.side === 'long' && currentPrice <= trade.stop_loss) {
          this.closeTrade(trade.id, trade.stop_loss, 'stop_loss'); continue;
        }
        if (trade.side === 'short' && currentPrice >= trade.stop_loss) {
          this.closeTrade(trade.id, trade.stop_loss, 'stop_loss'); continue;
        }
      }
      for (const [tp, label] of [
        [trade.take_profit_3, 'tp3'], [trade.take_profit_2, 'tp2'], [trade.take_profit_1, 'tp1'],
      ]) {
        if (!tp) continue;
        if (trade.side === 'long' && currentPrice >= tp) {
          this.closeTrade(trade.id, tp, `${label}_hit`); break;
        }
        if (trade.side === 'short' && currentPrice <= tp) {
          this.closeTrade(trade.id, tp, `${label}_hit`); break;
        }
      }
    }
  }

  checkTrailingStops(currentPrice, trade) {
    if (!trade.trailing_stop) return;
    if (trade.side === 'long') {
      if (currentPrice > trade.highest_price) {
        db.updateTrade(trade.id, { highest_price: currentPrice });
      }
      const newSl = trade.highest_price * (1 - trade.trailing_stop / 100);
      if (trade.stop_loss === null || newSl > trade.stop_loss) {
        db.updateTrade(trade.id, { stop_loss: +newSl.toFixed(2), trailing_stop_activated: true });
      }
    } else {
      if (currentPrice < trade.lowest_price) {
        db.updateTrade(trade.id, { lowest_price: currentPrice });
      }
      const newSl = trade.lowest_price * (1 + trade.trailing_stop / 100);
      if (trade.stop_loss === null || newSl < trade.stop_loss) {
        db.updateTrade(trade.id, { stop_loss: +newSl.toFixed(2), trailing_stop_activated: true });
      }
    }
  }

  checkLiquidation(trade, currentPrice) {
    const liqPrice = calcLiquidationPrice(trade.entry_price, trade.leverage, trade.side);
    if (!liqPrice) return false;
    if (trade.side === 'long' && currentPrice <= liqPrice) {
      this.closeTrade(trade.id, liqPrice, 'liquidation');
      return true;
    }
    if (trade.side === 'short' && currentPrice >= liqPrice) {
      this.closeTrade(trade.id, liqPrice, 'liquidation');
      return true;
    }
    return false;
  }

  getSuggestions(trade, currentPrice) {
    const suggestions = [];
    if (!trade || trade.status !== 'open') return suggestions;

    const upnlPercent = calcPnLPercent(trade, currentPrice);
    const slDist = computeSlDistance(trade, currentPrice);
    const tpProgress = computeTpProgress(trade, currentPrice);
    const hasSL = !!trade.stop_loss;
    const hasTP = !!trade.take_profit_1;
    const hasTrail = !!trade.trailing_stop;
    const entryToLiq = trade.entry_price > 0
      ? Math.abs(currentPrice - calcLiquidationPrice(trade.entry_price, trade.leverage, trade.side)) / trade.entry_price * 100
      : null;
    const hoursSinceOpen = trade.opened_at ? (Date.now() - new Date(trade.opened_at).getTime()) / 3600000 : 0;

    // Profit-taking suggestions
    if (upnlPercent > 5 && upnlPercent < 10 && !hasTrail) {
      suggestions.push({ type: 'info', text: 'Move SL to breakeven to lock in gains' });
    }
    if (upnlPercent >= 10 && upnlPercent < 20) {
      suggestions.push({ type: 'take_profit', text: `Take 25-50% profit now (${upnlPercent.toFixed(0)}%) or set trailing stop` });
    }
    if (upnlPercent >= 20) {
      suggestions.push({ type: 'take_profit', text: `Strong profit +${upnlPercent.toFixed(0)}% — take partial profits or move SL up` });
    }
    if (upnlPercent > 2 && tpProgress > 80 && !hasTrail) {
      suggestions.push({ type: 'take_profit', text: `Near TP (${tpProgress.toFixed(0)}%) — consider trailing stop to extend gains` });
    }

    // Loss management
    if (upnlPercent < -2 && upnlPercent >= -8 && hasSL && slDist !== null && slDist < 2) {
      suggestions.push({ type: 'warning', text: `SL close (${slDist.toFixed(1)}%) — monitor or widen` });
    }
    if (upnlPercent < -2 && upnlPercent >= -8 && !hasSL) {
      suggestions.push({ type: 'danger', text: 'No stop loss — price moving against you' });
    }
    if (upnlPercent < -8) {
      suggestions.push({ type: 'danger', text: `Loss ${upnlPercent.toFixed(0)}% — evaluate if thesis is still valid` });
    }
    if (upnlPercent < -2 && entryToLiq !== null && entryToLiq < 5) {
      suggestions.push({ type: 'danger', text: `Liquidation close (${entryToLiq.toFixed(1)}%) — reduce leverage or add margin` });
    }

    // General SL/TP checks
    if (!hasSL) {
      suggestions.push({ type: 'danger', text: 'No stop loss — set one to manage risk' });
    }
    if (slDist !== null && slDist < 1) {
      suggestions.push({ type: 'danger', text: `SL too tight (${slDist.toFixed(1)}%) — risk of premature stop` });
    }
    if (slDist !== null && slDist > 15) {
      suggestions.push({ type: 'info', text: `SL distant (${slDist.toFixed(1)}%) — consider tightening` });
    }

    // Trailing stop
    if (!hasTrail && upnlPercent > 5) {
      suggestions.push({ type: 'info', text: `Enable trailing stop to protect profits (${upnlPercent.toFixed(0)}% up)` });
    }

    // No setup
    if (!hasSL && !hasTP) {
      suggestions.push({ type: 'warning', text: 'No SL or TP set — define your risk/reward' });
    }

    // Time-based: position open long with minimal movement
    if (hoursSinceOpen > 4 && Math.abs(upnlPercent) < 2) {
      suggestions.push({ type: 'info', text: `Position open ${hoursSinceOpen.toFixed(0)}h with little movement — price may be range-bound` });
    }

    // Steady state (always show at least one suggestion)
    if (suggestions.length === 0) {
      if (hasSL && hasTP) {
        suggestions.push({ type: 'info', text: `Holding — SL $${trade.stop_loss}, TP $${trade.take_profit_1}` });
      } else if (hasSL) {
        suggestions.push({ type: 'info', text: `Holding — SL $${trade.stop_loss}, no TP set` });
      } else if (hasTP) {
        suggestions.push({ type: 'info', text: `Holding — TP $${trade.take_profit_1}, no SL set` });
      } else {
        suggestions.push({ type: 'info', text: 'Position open — consider setting SL and TP' });
      }
    }

    return suggestions;
  }

  getOpenTrades() {
    return db.getOpenTrades().filter(t => t.entry_price != null && t.quantity != null);
  }
  getClosedTrades(limit) { return db.getClosedTrades(limit); }
  getAllTrades(limit) { return db.getAllTrades(limit); }
  getTrade(id) { return db.getTrade(id); }

  getLiveOrderData(order, currentPrice) {
    return {
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      entry_price: order.entry_price,
      quantity: order.quantity,
      leverage: order.leverage,
      stop_loss: order.stop_loss,
      take_profit_1: order.take_profit_1,
      take_profit_2: order.take_profit_2,
      take_profit_3: order.take_profit_3,
      current_price: currentPrice || order.entry_price,
      status: 'pending',
      opened_at: order.opened_at,
      margin: +((order.entry_price * order.quantity) / order.leverage).toFixed(2),
    };
  }

  getStats() {
    const account = db.getAccount();
    const trades = db.getClosedTrades(1000);
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);
    const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
    const bestTrade = trades.length > 0 ? trades.reduce((a, b) => a.pnl > b.pnl ? a : b) : null;
    const worstTrade = trades.length > 0 ? trades.reduce((a, b) => a.pnl < b.pnl ? a : b) : null;

    let runningBalance = account.initial_balance;
    const equityCurve = [{ time: 0, value: runningBalance }];
    for (const t of trades) {
      runningBalance += t.pnl;
      equityCurve.push({ time: new Date(t.closed_at).getTime(), value: +runningBalance.toFixed(2) });
    }

    const dailyPnl = {};
    for (const t of trades) {
      const day = t.closed_at?.split('T')[0] || t.closed_at?.split(' ')[0];
      if (day) dailyPnl[day] = (dailyPnl[day] || 0) + t.pnl;
    }

    let maxWinStreak = 0, maxLossStreak = 0, tempWin = 0, tempLoss = 0;
    for (const t of trades) {
      if (t.pnl > 0) { tempWin++; tempLoss = 0; maxWinStreak = Math.max(maxWinStreak, tempWin); }
      else { tempLoss++; tempWin = 0; maxLossStreak = Math.max(maxLossStreak, tempLoss); }
    }

    return {
      account, totalTrades: trades.length, winCount: wins.length, lossCount: losses.length,
      winRate: trades.length > 0 ? (wins.length / trades.length * 100).toFixed(2) : 0,
      totalPnl: +totalPnl.toFixed(2), avgWin: +avgWin.toFixed(2), avgLoss: +avgLoss.toFixed(2),
      profitFactor: avgLoss > 0 ? (avgWin * wins.length / (avgLoss * losses.length)).toFixed(2) : 0,
      bestTrade: bestTrade ? { symbol: bestTrade.symbol, pnl: +bestTrade.pnl.toFixed(2) } : null,
      worstTrade: worstTrade ? { symbol: worstTrade.symbol, pnl: +worstTrade.pnl.toFixed(2) } : null,
      maxWinStreak, maxLossStreak,
      roi: account.initial_balance > 0 ? ((account.total_pnl / account.initial_balance) * 100).toFixed(2) : 0,
      equityCurve, dailyPnl,
      openTradesCount: db.getOpenTrades().length,
      pendingOrdersCount: db.getPendingOrders().length,
    };
  }
}
