'use strict';

const { RepeatType } = require('../enums');
const { ValidationError } = require('../errors');
const { startOfMinute } = require('./recurrence');

const TITLE_MAX = 100;
const DESCRIPTION_MAX = 1000;
const CATEGORY_NAME_MAX = 40;
const INTERVAL_MAX = 365;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function isColor(value) {
  return typeof value === 'string' && COLOR_RE.test(value);
}

/**
 * Valida e normaliza os dados de um lembrete.
 * - `existing`: lembrete em edição; permite manter uma data já passada se ela
 *   não for alterada (ex.: lembrete atrasado aguardando recuperação).
 */
function validateReminder(input, { now, existing = null }) {
  const src = input ?? {};

  const title = typeof src.title === 'string' ? src.title.trim() : '';
  if (!title) throw new ValidationError('Informe o título do lembrete.', 'title');
  if (title.length > TITLE_MAX) {
    throw new ValidationError(`O título deve ter no máximo ${TITLE_MAX} caracteres.`, 'title');
  }

  const description = typeof src.description === 'string' ? src.description.replace(/\r\n/g, '\n').trim() : '';
  if (description.length > DESCRIPTION_MAX) {
    throw new ValidationError(`A descrição deve ter no máximo ${DESCRIPTION_MAX} caracteres.`, 'description');
  }

  let categoryId = null;
  if (src.categoryId !== null && src.categoryId !== undefined && src.categoryId !== '') {
    categoryId = Number(src.categoryId);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      throw new ValidationError('Categoria inválida.', 'categoryId');
    }
  }

  const rawScheduled = Number(src.scheduledAt);
  if (src.scheduledAt === null || src.scheduledAt === undefined || !Number.isFinite(rawScheduled)
    || Number.isNaN(new Date(rawScheduled).getTime())) {
    throw new ValidationError('Informe uma data e um horário válidos.', 'scheduledAt');
  }
  const scheduledAt = startOfMinute(rawScheduled);

  const unchanged = existing && existing.scheduledAt === scheduledAt;
  if (!unchanged && scheduledAt < startOfMinute(now)) {
    throw new ValidationError('A data e o horário não podem estar no passado.', 'scheduledAt');
  }

  const repeatType = src.repeatType ?? RepeatType.Once;
  if (!Object.values(RepeatType).includes(repeatType)) {
    throw new ValidationError('Tipo de recorrência inválido.', 'repeatType');
  }

  let repeatInterval = 1;
  if (repeatType !== RepeatType.Once && src.repeatInterval !== undefined && src.repeatInterval !== null && src.repeatInterval !== '') {
    repeatInterval = Number(src.repeatInterval);
    if (!Number.isInteger(repeatInterval) || repeatInterval < 1 || repeatInterval > INTERVAL_MAX) {
      throw new ValidationError(`O intervalo deve ser um número inteiro de 1 a ${INTERVAL_MAX}.`, 'repeatInterval');
    }
  }

  let color = null;
  if (src.color !== null && src.color !== undefined && src.color !== '') {
    if (!isColor(src.color)) throw new ValidationError('Cor inválida.', 'color');
    color = src.color.toUpperCase();
  }

  const isActive = src.isActive === undefined ? true : Boolean(src.isActive);

  return { title, description, categoryId, scheduledAt, repeatType, repeatInterval, color, isActive };
}

function validateCategory(input) {
  const src = input ?? {};
  const name = typeof src.name === 'string' ? src.name.trim() : '';
  if (!name) throw new ValidationError('Informe o nome da categoria.', 'name');
  if (name.length > CATEGORY_NAME_MAX) {
    throw new ValidationError(`O nome deve ter no máximo ${CATEGORY_NAME_MAX} caracteres.`, 'name');
  }
  if (!isColor(src.color)) throw new ValidationError('Cor inválida.', 'color');
  return { name, color: src.color.toUpperCase(), isActive: src.isActive === undefined ? true : Boolean(src.isActive) };
}

module.exports = {
  TITLE_MAX,
  DESCRIPTION_MAX,
  CATEGORY_NAME_MAX,
  isColor,
  validateReminder,
  validateCategory,
};
