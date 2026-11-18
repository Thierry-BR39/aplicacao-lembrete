'use strict';

/** Iniciado automaticamente (Windows): deve abrir direto na bandeja, sem mostrar o painel. */
function isHiddenLaunch(argv = process.argv) {
  return Array.isArray(argv) && argv.includes('--hidden');
}

/**
 * Uma segunda execução normalmente pede à instância principal que abra o painel.
 * Mas se ela veio da inicialização automática (por exemplo, a chave Run e o atalho
 * da pasta Inicializar disparando juntos), não deve abrir nada.
 */
function shouldOpenPanelForSecondInstance(argv) {
  return !isHiddenLaunch(argv);
}

module.exports = { isHiddenLaunch, shouldOpenPanelForSecondInstance };
