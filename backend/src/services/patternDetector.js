/**
 * Auto Chart Pattern Detection Engine
 * Detects: Head & Shoulders, Double Top/Bottom, Triangles, Flags, Breakouts
 */
export function detectPatterns(klines) {
  if (!klines || klines.length < 50) return [];

  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const len = klines.length;

  const patterns = [];

  // Find swing points
  const swings = findSwingPoints(highs, lows, closes, klines);

  // Detect each pattern
  const dt = detectDoubleTop(swings, closes, klines);
  if (dt) patterns.push(dt);

  const db = detectDoubleBottom(swings, closes, klines);
  if (db) patterns.push(db);

  const hs = detectHeadAndShoulders(swings, closes, klines);
  if (hs) patterns.push(hs);

  const tri = detectTriangles(swings, highs, lows, closes, klines);
  patterns.push(...tri);

  const flags = detectFlags(closes, highs, lows, klines);
  patterns.push(...flags);

  const breakout = detectBreakout(swings, highs, lows, closes, klines);
  if (breakout) patterns.push(breakout);

  const sr = detectSupportResistance(swings, highs, lows, closes, klines);
  patterns.push(...sr);

  return patterns.filter(p => p.confidence >= 50).sort((a, b) => b.confidence - a.confidence);
}

function findSwingPoints(highs, lows, closes, klines) {
  const swingHighs = [];
  const swingLows = [];

  for (let i = 3; i < highs.length - 3; i++) {
    if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && highs[i] > highs[i-3] &&
        highs[i] > highs[i+1] && highs[i] > highs[i+2] && highs[i] > highs[i+3]) {
      swingHighs.push({ index: i, price: highs[i], time: klines[i].time });
    }
    if (lows[i] < lows[i-1] && lows[i] < lows[i-2] && lows[i] < lows[i-3] &&
        lows[i] < lows[i+1] && lows[i] < lows[i+2] && lows[i] < lows[i+3]) {
      swingLows.push({ index: i, price: lows[i], time: klines[i].time });
    }
  }

  return { highs: swingHighs, lows: swingLows };
}

function detectDoubleTop(swings, closes, klines) {
  const sh = swings.highs;
  if (sh.length < 2) return null;

  const last = sh[sh.length - 1];
  const prev = sh[sh.length - 2];

  // Two highs at similar level
  const diff = Math.abs(last.price - prev.price) / prev.price;
  if (diff > 0.03) return null; // Within 3%

  // Check for valley between them
  const valleyStart = prev.index;
  const valleyEnd = last.index;
  const valley = Math.min(...closes.slice(valleyStart, valleyEnd));
  const depth = ((prev.price - valley) / prev.price) * 100;

  if (depth < 1) return null;

  const latest = closes[closes.length - 1];
  const confirmed = latest < valley;

  return {
    type: 'double_top',
    direction: 'bearish',
    confidence: confirmed ? 80 : 60,
    description: `Double top at ${prev.price.toFixed(2)} and ${last.price.toFixed(2)}`,
    keyLevel: valley,
    target: valley - (prev.price - valley),
    confirmed,
    points: [prev, last],
  };
}

function detectDoubleBottom(swings, closes, klines) {
  const sl = swings.lows;
  if (sl.length < 2) return null;

  const last = sl[sl.length - 1];
  const prev = sl[sl.length - 2];

  const diff = Math.abs(last.price - prev.price) / prev.price;
  if (diff > 0.03) return null;

  const peakStart = prev.index;
  const peakEnd = last.index;
  const peak = Math.max(...closes.slice(peakStart, peakEnd));
  const depth = ((peak - prev.price) / prev.price) * 100;

  if (depth < 1) return null;

  const latest = closes[closes.length - 1];
  const confirmed = latest > peak;

  return {
    type: 'double_bottom',
    direction: 'bullish',
    confidence: confirmed ? 80 : 60,
    description: `Double bottom at ${prev.price.toFixed(2)} and ${last.price.toFixed(2)}`,
    keyLevel: peak,
    target: peak + (peak - prev.price),
    confirmed,
    points: [prev, last],
  };
}

function detectHeadAndShoulders(swings, closes, klines) {
  const sh = swings.highs;
  if (sh.length < 3) return null;

  const left = sh[sh.length - 3];
  const head = sh[sh.length - 2];
  const right = sh[sh.length - 1];

  // Head must be higher
  if (head.price <= left.price || head.price <= right.price) return null;

  // Shoulders similar height
  const shoulderDiff = Math.abs(left.price - right.price) / left.price;
  if (shoulderDiff > 0.05) return null;

  const neckline = Math.min(
    ...closes.slice(left.index, head.index),
    ...closes.slice(head.index, right.index)
  );

  const latest = closes[closes.length - 1];
  const confirmed = latest < neckline;

  return {
    type: 'head_and_shoulders',
    direction: 'bearish',
    confidence: confirmed ? 85 : 65,
    description: `Head & Shoulders pattern — Head at ${head.price.toFixed(2)}`,
    keyLevel: neckline,
    target: neckline - (head.price - neckline),
    confirmed,
    points: [left, head, right],
  };
}

function detectTriangles(swings, highs, lows, closes, klines) {
  const patterns = [];
  const len = closes.length;
  const lookback = Math.min(40, len);

  const recentHighs = highs.slice(-lookback);
  const recentLows = lows.slice(-lookback);

  // Check for converging highs and lows
  const highSlope = calcSlope(recentHighs);
  const lowSlope = calcSlope(recentLows);

  if (highSlope < -0.1 && lowSlope > 0.1) {
    patterns.push({
      type: 'symmetrical_triangle',
      direction: 'neutral',
      confidence: 65,
      description: 'Symmetrical triangle — breakout pending',
      keyLevel: closes[len - 1],
      confirmed: false,
    });
  } else if (Math.abs(highSlope) < 0.05 && lowSlope > 0.2) {
    patterns.push({
      type: 'ascending_triangle',
      direction: 'bullish',
      confidence: 70,
      description: 'Ascending triangle — bullish bias',
      keyLevel: Math.max(...recentHighs),
      confirmed: false,
    });
  } else if (highSlope < -0.2 && Math.abs(lowSlope) < 0.05) {
    patterns.push({
      type: 'descending_triangle',
      direction: 'bearish',
      confidence: 70,
      description: 'Descending triangle — bearish bias',
      keyLevel: Math.min(...recentLows),
      confirmed: false,
    });
  }

  return patterns;
}

function detectFlags(closes, highs, lows, klines) {
  const patterns = [];
  const len = closes.length;
  if (len < 30) return patterns;

  const pole = closes.slice(-30, -15);
  const flag = closes.slice(-15);

  const poleMove = (pole[pole.length - 1] - pole[0]) / pole[0] * 100;
  const flagMove = (flag[flag.length - 1] - flag[0]) / flag[0] * 100;

  // Bull flag: strong up move followed by slight down consolidation
  if (poleMove > 5 && flagMove < 0 && flagMove > -3) {
    patterns.push({
      type: 'bull_flag',
      direction: 'bullish',
      confidence: 70,
      description: `Bull flag after ${poleMove.toFixed(1)}% rally`,
      keyLevel: Math.max(...highs.slice(-30)),
      confirmed: closes[len - 1] > Math.max(...highs.slice(-15)),
    });
  }

  // Bear flag: strong down move followed by slight up consolidation
  if (poleMove < -5 && flagMove > 0 && flagMove < 3) {
    patterns.push({
      type: 'bear_flag',
      direction: 'bearish',
      confidence: 70,
      description: `Bear flag after ${Math.abs(poleMove).toFixed(1)}% drop`,
      keyLevel: Math.min(...lows.slice(-30)),
      confirmed: closes[len - 1] < Math.min(...lows.slice(-15)),
    });
  }

  return patterns;
}

function detectBreakout(swings, highs, lows, closes, klines) {
  const len = closes.length;
  const latest = closes[len - 1];
  const lookback = Math.min(30, len);
  const recentHigh = Math.max(...highs.slice(-lookback));
  const recentLow = Math.min(...lows.slice(-lookback));

  if (latest >= recentHigh * 0.998) {
    return {
      type: 'breakout',
      direction: 'bullish',
      confidence: 75,
      description: `Breakout above resistance at ${recentHigh.toFixed(2)}`,
      keyLevel: recentHigh,
      confirmed: latest > recentHigh,
    };
  }

  if (latest <= recentLow * 1.002) {
    return {
      type: 'breakdown',
      direction: 'bearish',
      confidence: 75,
      description: `Breakdown below support at ${recentLow.toFixed(2)}`,
      keyLevel: recentLow,
      confirmed: latest < recentLow,
    };
  }

  return null;
}

function detectSupportResistance(swings, highs, lows, closes, klines) {
  const patterns = [];
  const latest = closes[closes.length - 1];

  // Find strong S/R levels (multiple touches)
  const levels = [];

  for (const sh of swings.highs.slice(-5)) {
    const touches = swings.highs.filter(h => Math.abs(h.price - sh.price) / sh.price < 0.01).length;
    if (touches >= 2) {
      levels.push({ type: 'resistance', price: sh.price, touches, distance: Math.abs(latest - sh.price) / latest * 100 });
    }
  }

  for (const sl of swings.lows.slice(-5)) {
    const touches = swings.lows.filter(l => Math.abs(l.price - sl.price) / sl.price < 0.01).length;
    if (touches >= 2) {
      levels.push({ type: 'support', price: sl.price, touches, distance: Math.abs(latest - sl.price) / latest * 100 });
    }
  }

  for (const level of levels.slice(0, 3)) {
    patterns.push({
      type: level.type,
      direction: level.type === 'support' ? 'bullish' : 'bearish',
      confidence: 50 + level.touches * 10,
      description: `${level.type === 'support' ? 'Support' : 'Resistance'} at ${level.price.toFixed(2)} (${level.touches} touches)`,
      keyLevel: level.price,
      confirmed: false,
      distance: level.distance,
    });
  }

  return patterns;
}

function calcSlope(data) {
  if (data.length < 2) return 0;
  const n = data.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += data[i];
    sumXY += i * data[i];
    sumX2 += i * i;
  }
  return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
}
