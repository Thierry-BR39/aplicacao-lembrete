'use strict';

const { EventEmitter } = require('node:events');

/**
 * Barramento de eventos da aplicação.
 *   data-changed        { entity, id }          dados persistidos mudaram
 *   occurrence-cancelled { occurrenceId }       post-it exibido precisa ser fechado
 *   settings-changed    { settings }            configurações atualizadas
 */
class EventBus extends EventEmitter {
  /** Listeners com erro não podem derrubar quem emitiu o evento. */
  emitSafe(event, payload, onError) {
    for (const listener of this.listeners(event)) {
      try {
        listener(payload);
      } catch (err) {
        onError?.(err);
      }
    }
  }
}

module.exports = { EventBus };
