'use strict';

const MIN_WIDTH = 200;
const MIN_HEIGHT = 140;
const MIN_VISIBLE = 80;

function intersectionSize(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return { w: Math.max(0, w), h: Math.max(0, h) };
}

/**
 * Decide a posição final de um post-it. Reaproveita a posição salva apenas se
 * ela ainda estiver visível em algum monitor atual (a configuração de monitores
 * pode ter mudado); caso contrário usa a posição padrão.
 *
 * @param saved     {x, y, width, height} | null
 * @param workAreas lista de áreas de trabalho {x, y, width, height}
 * @param fallback  {x, y, width, height} posição padrão
 */
function resolveBounds(saved, workAreas, fallback) {
  const areas = workAreas.length ? workAreas : [fallback];
  if (!saved || ![saved.x, saved.y, saved.width, saved.height].every(Number.isFinite)) return fallback;

  const largest = areas.reduce((best, a) => (a.width * a.height > best.width * best.height ? a : best), areas[0]);
  const width = Math.min(Math.max(saved.width, MIN_WIDTH), largest.width);
  const height = Math.min(Math.max(saved.height, MIN_HEIGHT), largest.height);
  const candidate = { x: saved.x, y: saved.y, width, height };

  const visible = areas.some((area) => {
    const { w, h } = intersectionSize(candidate, area);
    return w >= Math.min(MIN_VISIBLE, width) && h >= Math.min(MIN_VISIBLE, height);
  });
  return visible ? candidate : { ...fallback, width, height };
}

module.exports = { resolveBounds, MIN_WIDTH, MIN_HEIGHT };
