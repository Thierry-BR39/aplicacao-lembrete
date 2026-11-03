'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveBounds } = require('../../src/domain/rules/windowBounds');

const primary = { x: 0, y: 0, width: 1920, height: 1040 };
const second = { x: 1920, y: 0, width: 1280, height: 1000 };
const fallback = { x: 1600, y: 24, width: 280, height: 240 };

test('sem posição salva usa a padrão', () => {
  assert.deepEqual(resolveBounds(null, [primary], fallback), fallback);
});

test('reaproveita a posição salva quando visível', () => {
  const saved = { x: 300, y: 200, width: 320, height: 260 };
  assert.deepEqual(resolveBounds(saved, [primary], fallback), saved);
});

test('posição em monitor desconectado volta para a padrão, mantendo o tamanho', () => {
  const saved = { x: 2500, y: 100, width: 320, height: 260 };
  assert.deepEqual(resolveBounds(saved, [primary], fallback), { ...fallback, width: 320, height: 260 });
  assert.deepEqual(resolveBounds(saved, [primary, second], fallback), saved);
});

test('limita tamanho absurdo à maior área e respeita o mínimo', () => {
  const huge = resolveBounds({ x: 0, y: 0, width: 9000, height: 9000 }, [primary], fallback);
  assert.equal(huge.width, 1920);
  assert.equal(huge.height, 1040);
  const tiny = resolveBounds({ x: 10, y: 10, width: 10, height: 10 }, [primary], fallback);
  assert.ok(tiny.width >= 200 && tiny.height >= 140);
});

test('valores corrompidos usam a padrão', () => {
  assert.deepEqual(resolveBounds({ x: NaN, y: 0, width: 300, height: 200 }, [primary], fallback), fallback);
});
