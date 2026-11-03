'use strict';

const { RepeatType } = require('../enums');

const DAY_MS = 24 * 60 * 60 * 1000;
const APPROX_PERIOD_MS = {
  [RepeatType.Daily]: DAY_MS,
  [RepeatType.Weekly]: 7 * DAY_MS,
  [RepeatType.Monthly]: 30.4375 * DAY_MS,
};

/**
 * Soma meses preservando o horário local. Quando o dia não existe no mês de
 * destino (ex.: 31 em fevereiro), usa o último dia válido do mês (RN006).
 */
function addMonthsClamped(date, months) {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

/**
 * Instante da n-ésima ocorrência (n = 0 é a âncora). Sempre calculada a partir
 * da âncora original, o que evita deriva (31/01 -> 28/02 -> 31/03) e preserva o
 * horário local mesmo atravessando mudanças de horário de verão.
 */
function occurrenceAt(anchorMs, repeatType, interval, n) {
  const anchor = new Date(anchorMs);
  switch (repeatType) {
    case RepeatType.Daily: {
      anchor.setDate(anchor.getDate() + n * interval);
      return anchor.getTime();
    }
    case RepeatType.Weekly: {
      anchor.setDate(anchor.getDate() + 7 * n * interval);
      return anchor.getTime();
    }
    case RepeatType.Monthly:
      return addMonthsClamped(anchor, n * interval).getTime();
    default:
      throw new Error(`Tipo de recorrência não suportado: ${repeatType}`);
  }
}

/**
 * Primeira ocorrência estritamente posterior a `afterMs`, ou null quando o
 * lembrete é único e a data já passou. Usada para consolidar ocorrências
 * perdidas em uma só (RN010).
 */
function nextOccurrenceAfter(anchorMs, repeatType, interval, afterMs) {
  if (repeatType === RepeatType.Once) {
    return anchorMs > afterMs ? anchorMs : null;
  }
  const step = Math.max(1, interval);
  if (anchorMs > afterMs) return anchorMs;
  const approx = APPROX_PERIOD_MS[repeatType] * step;
  let n = Math.max(0, Math.floor((afterMs - anchorMs) / approx) - 2);
  while (occurrenceAt(anchorMs, repeatType, step, n) <= afterMs) n += 1;
  return occurrenceAt(anchorMs, repeatType, step, n);
}

/** Arredonda para baixo, para o início do minuto. */
function startOfMinute(ms) {
  return Math.floor(ms / 60000) * 60000;
}

/**
 * Instante da primeira ocorrência pendente de um lembrete ativo: a própria
 * âncora quando ainda não passou (ou quando é único, para ser recuperado) e a
 * próxima futura nos demais casos.
 */
function firstPendingAt({ scheduledAt, repeatType, repeatInterval }, nowMs) {
  if (scheduledAt >= startOfMinute(nowMs) || repeatType === RepeatType.Once) return scheduledAt;
  return nextOccurrenceAfter(scheduledAt, repeatType, repeatInterval, nowMs);
}

module.exports = {
  addMonthsClamped,
  occurrenceAt,
  nextOccurrenceAfter,
  startOfMinute,
  firstPendingAt,
};
