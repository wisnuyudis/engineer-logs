import { T } from '../theme/tokens';

export const NPS_FLAGS = [
  { key: 'promotor', label: 'Promotor', color: T.green, lo: T.greenLo },
  { key: 'passive', label: 'Passive', color: T.amber, lo: T.amberLo },
  { key: 'detractors', label: 'Detractors', color: T.red, lo: T.redLo },
];

export const npsFlag = (score) => {
  const value = Number(score);
  if (value === 4) return NPS_FLAGS[0];
  if (value === 3) return NPS_FLAGS[1];
  if (value === 1 || value === 2) return NPS_FLAGS[2];
  return { key: 'unknown', label: 'N/A', color: T.textMute, lo: T.border };
};

export const countNpsFlags = (items) => {
  const counts = { promotor: 0, passive: 0, detractors: 0 };
  for (const item of items) {
    const flag = item.npsFlag || npsFlag(item.score).key;
    if (counts[flag] !== undefined) counts[flag] += 1;
  }
  return NPS_FLAGS.map((flag) => ({
    ...flag,
    count: counts[flag.key] || 0,
  }));
};
