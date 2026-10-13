import { s, h, compactMoney, money } from './ui.js';

/**
 * Hand-drawn SVG grouped bar chart (no chart library). Colours come from CSS tokens
 * (.bar.s0 / .bar.s1), so it follows the light and dark themes.
 * - leading months with no activity are trimmed (at least `minPoints` are kept)
 * - the y axis is fitted to the data: the smallest 1/2/2.5/5 step that needs at most 6 ticks
 */
export function barChart(rows, { series, height = 300, minPoints = 3 }) {
  const isEmpty = (d) => series.every((x) => !Number(d[x.key]));
  let first = rows.findIndex((d) => !isEmpty(d));
  if (first < 0) first = rows.length - minPoints;
  const data = rows.slice(Math.max(0, Math.min(first, rows.length - minPoints)));

  const W = 720, H = height, m = { t: 24, r: 8, b: 36, l: 60 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const max = Math.max(1, ...data.flatMap((d) => series.map((x) => Number(d[x.key]) || 0)));
  const step = fitStep(max, 6);
  const top = Math.ceil(max / step) * step;
  const y = (v) => m.t + ih - (v / top) * ih;

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${series.map((x) => x.label).join(' and ')} by month` });
  for (let v = 0; v <= top + 1e-6; v += step) {
    svg.append(s('line', { class: `grid-line${v === 0 ? ' base' : ''}`, x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
    svg.append(s('text', { x: m.l - 12, y: y(v) + 4, 'text-anchor': 'end' }, compactMoney(v)));
  }

  const gw = iw / data.length;
  const bw = Math.min(34, (gw - 28) / series.length), gap = 6;
  const wrap = h('div', { class: 'chart' });
  const tip = h('div', { class: 'chart-tip', role: 'presentation' });
  data.forEach((d, i) => {
    const groupW = bw * series.length + gap * (series.length - 1);
    const x0 = m.l + gw * i + (gw - groupW) / 2;
    series.forEach((x, j) => {
      const v = Number(d[x.key]) || 0;
      const bh = v > 0 ? Math.max(2, (v / top) * ih) : 0;
      const bx = x0 + j * (bw + gap);
      const rect = s('rect', { class: `bar s${j}`, x: bx, y: m.t + ih - bh, width: bw, height: bh,
        style: `animation-delay:${200 + i * 90 + j * 45}ms`, tabindex: 0, 'aria-label': `${d.label}: ${x.label} ${money(v)}` });
      const show = () => {
        tip.replaceChildren(h('b', null, d.month ? `${d.label} ${d.month.slice(0, 4)}` : d.label), ...series.map((q) => h('div', null, `${q.label}  ${money(d[q.key])}`)));
        const b = rect.getBoundingClientRect(), r = wrap.getBoundingClientRect();
        tip.style.left = `${b.left - r.left + b.width / 2}px`;
        tip.style.top = `${b.top - r.top}px`;
        tip.classList.add('on');
      };
      const hide = () => tip.classList.remove('on');
      rect.addEventListener('mouseenter', show); rect.addEventListener('focus', show);
      rect.addEventListener('mouseleave', hide); rect.addEventListener('blur', hide);
      svg.append(rect);
      if (v > 0) svg.append(s('text', { class: 'val', x: bx + bw / 2, y: m.t + ih - bh - 7, 'text-anchor': 'middle' }, compactMoney(v)));
    });
    svg.append(s('text', { x: m.l + gw * i + gw / 2, y: H - 10, 'text-anchor': 'middle' }, d.label));
  });
  wrap.append(svg, tip);
  return wrap;
}

/** Smallest "nice" step (1, 2, 2.5, 5 x 10^k) that covers max in at most maxTicks intervals. */
function fitStep(max, maxTicks) {
  const raw = max / maxTicks;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * p * maxTicks >= max) return f * p;
  return 10 * p;
}
