'use strict';

const MIN_INTERVAL_MS = 1000;
const MAX_INTERVAL_MS = 15000;
/** Atraso acima do qual uma ocorrência é considerada "recuperada" (IsOverdue). */
const OVERDUE_TOLERANCE_MS = 60000;

/**
 * Verifica periodicamente as ocorrências vencidas e solicita a exibição dos
 * post-its. Roda no processo principal, independente da janela do painel.
 *
 * Cada passada (`tick`):
 *  1. reivindica, de forma transacional, as ocorrências pendentes vencidas
 *     (inclui as atrasadas da última sessão, recuperadas na inicialização);
 *  2. reapresenta as ocorrências já "exibidas" que ainda não foram fechadas
 *     (ex.: o aplicativo foi encerrado com o post-it aberto). O gerenciador de
 *     janelas ignora as que já estão na tela, então não há duplicidade.
 */
class ReminderSchedulerService {
  constructor({ occurrenceService, settingsService, clock, onShow, logger }) {
    this.occurrenceService = occurrenceService;
    this.settingsService = settingsService;
    this.clock = clock;
    this.onShow = onShow;
    this.logger = logger;
    this.timer = null;
    this.running = false;
    this.started = false;
  }

  intervalMs() {
    const seconds = this.settingsService.get().schedulerIntervalSeconds;
    return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, seconds * 1000));
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.logger?.info('Agendador iniciado.');
    this.loop();
  }

  stop() {
    this.started = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  loop() {
    if (!this.started) return;
    this.tick();
    this.timer = setTimeout(() => this.loop(), this.intervalMs());
  }

  /** Uma passada de verificação. Nunca lança: falhas são registradas e a próxima passada tenta de novo. */
  tick() {
    if (this.running) return;
    this.running = true;
    try {
      const now = this.clock.now();
      const tolerance = OVERDUE_TOLERANCE_MS + this.intervalMs();

      for (const occurrence of this.occurrenceService.findDue(now)) {
        try {
          const overdue = now - occurrence.scheduledAt > tolerance;
          if (this.occurrenceService.markDisplayed(occurrence.id, now, overdue)) {
            this.logger?.info(`Ocorrência ${occurrence.id} exibida${overdue ? ' (recuperada, atrasada)' : ''}.`);
          }
        } catch (err) {
          this.logger?.error(`Falha ao reivindicar a ocorrência ${occurrence.id}.`, err);
        }
      }

      for (const occurrence of this.occurrenceService.findDisplayed()) {
        try {
          this.onShow(occurrence);
        } catch (err) {
          this.logger?.error(`Falha ao abrir o post-it da ocorrência ${occurrence.id}.`, err);
        }
      }
    } catch (err) {
      this.logger?.error('Falha na verificação do agendador.', err);
    } finally {
      this.running = false;
    }
  }
}

module.exports = { ReminderSchedulerService, OVERDUE_TOLERANCE_MS };
