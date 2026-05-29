import dotenv from 'dotenv';
dotenv.config();

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const API_KEY = process.env.OPENROUTER_API_KEY;

function currentPriceFor(trade, priceCache) {
  return priceCache?.[trade.symbol] || trade.current_price || trade.entry_price;
}

export async function getTradeAdvice(trade, priceCache) {
  const currentPrice = currentPriceFor(trade, priceCache);
  const diff = trade.side === 'long' ? currentPrice - trade.entry_price : trade.entry_price - currentPrice;
  const upnl = diff * trade.quantity * trade.leverage;
  const margin = (trade.entry_price * trade.quantity) / trade.leverage;
  const upnlPercent = margin > 0 ? (upnl / margin) * 100 : 0;
  const slDist = trade.stop_loss ? ((trade.side === 'long' ? currentPrice - trade.stop_loss : trade.stop_loss - currentPrice) / trade.entry_price) * 100 : null;

  // Try AI first
  if (API_KEY) {
    const prompt = `You are a crypto trading coach. Give ONE concise actionable suggestion for this open position in 1 short sentence. No preamble.

Position: ${trade.side === 'long' ? 'LONG' : 'SHORT'} ${trade.symbol.replace('USDT', '/USDT')}
Entry: $${trade.entry_price}
Current: $${currentPrice}
PnL: ${upnlPercent.toFixed(1)}%
Leverage: ${trade.leverage}x
Stop Loss: ${trade.stop_loss ? '$' + trade.stop_loss : 'Not set'}
Take Profit: ${trade.take_profit_1 ? '$' + trade.take_profit_1 : 'Not set'}
Trailing Stop: ${trade.trailing_stop ? trade.trailing_stop + '%' : 'Not set'}
SL Distance: ${slDist !== null ? slDist.toFixed(1) + '%' : 'N/A'}

Rules:
- Suggest ONE action: move SL, take partial profit, set TP, enable trailing stop, or hold
- Be specific with numbers/levels
- Max 15 words`;

    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://cryptotrader.app',
        },
        body: JSON.stringify({
          model: 'openai/gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 60,
          temperature: 0.2,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content;
      }
    } catch {}
  }

  // Fallback: rule-based advice
  if (margin === 0) return null;
  if (upnlPercent > 15 && !trade.trailing_stop) return `Profit ${upnlPercent.toFixed(0)}% — set a trailing stop or move SL to $${(currentPrice * (1 - 0.03)).toFixed(2)}`;
  if (upnlPercent > 8 && !trade.trailing_stop) return `Consider moving SL to breakeven to lock in gains`;
  if (upnlPercent > 20) return `Take partial profits now (${upnlPercent.toFixed(0)}% gain)`;
  if (upnlPercent < -8) return `Loss ${upnlPercent.toFixed(0)}% — consider cutting or tightening SL`;
  if (upnlPercent < -3 && !trade.stop_loss) return `Set a stop loss to protect against further downside`;
  if (slDist !== null && slDist < 1) return `SL too tight (${slDist.toFixed(1)}%) — widen to avoid premature stop`;
  if (!trade.stop_loss) return `Set a stop loss at $${(currentPrice * (trade.side === 'long' ? 0.95 : 1.05)).toFixed(2)} to manage risk`;
  if (upnlPercent >= 0 && upnlPercent < 5) return `Holding steady — keep current SL/TP in place`;
  return null;
}

export async function explainSignal(signalData, symbol) {
  if (!API_KEY) {
    return 'AI explanation unavailable — no API key configured.';
  }

  const { signal, confidence, reasons, marketRegime, riskReward, indicators } = signalData;

  const prompt = `You are a crypto trading analyst. Explain this trading signal in 2-3 concise paragraphs.

Symbol: ${symbol}
Signal: ${signal}
Confidence: ${confidence}%
Market Regime: ${marketRegime}
Entry: ${riskReward.entry}
Stop Loss: ${riskReward.stopLoss}
TP1 (1:1): ${riskReward.tp1}
TP2 (1:2): ${riskReward.tp2}
TP3 (1:4): ${riskReward.tp3}
R:R Ratio: ${riskReward.rrRatio}

Technical Reasons:
${reasons.join('\n')}

Key Indicators:
RSI: ${indicators.rsi}, MACD: ${indicators.macd}, ADX: ${indicators.adx}
EMA9: ${indicators.ema9}, EMA20: ${indicators.ema20}, EMA50: ${indicators.ema50}

Rules:
- Explain WHY the signal is what it is based on the indicators
- Describe the current market context
- Mention key risk factors
- Be direct and actionable
- Do NOT give financial advice or say "this is not financial advice"`;

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://cryptosignal.pro',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('OpenRouter error:', err);
      return 'AI explanation temporarily unavailable.';
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || 'No explanation generated.';
  } catch (err) {
    console.error('AI explainer error:', err.message);
    return 'AI explanation unavailable — service error.';
  }
}
