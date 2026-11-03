# ADR 0001 — Electron em vez de C#/WPF

**Status:** aceito

## Contexto

A especificação funcional e técnica v1.0 previa C#, .NET 10, WPF, SQLite e Entity Framework Core. O computador de desenvolvimento não tinha o .NET SDK instalado, mas já tinha Node.js 24. Foi decidido seguir com o que já existia.

## Decisão

Implementar o Reminder Desk em **Electron** (JavaScript), com SQLite via `node:sqlite` (embutido no Node 24 e no Electron 45), mantendo:

- a arquitetura em camadas (Domain, Application, Infrastructure, Presentation);
- todas as regras de negócio RN001–RN010;
- o esquema de banco da seção 6, com migrações versionadas;
- o escopo da versão 1.0.

## Mapeamento da especificação

| Especificação | Implementação |
|---|---|
| WPF + MVVM | HTML/CSS/JS; a camada de apresentação só fala com a aplicação por IPC tipado por canal |
| Entity Framework Core | repositórios explícitos sobre `node:sqlite` |
| Microsoft.Extensions.Hosting / DI | `compositionRoot.js` |
| Microsoft.Extensions.Logging | `FileLogger` com arquivo diário |
| `NotifyIcon` | `Tray` do Electron |
| `Topmost`, `ShowInTaskbar=false` | `alwaysOnTop('screen-saver')`, `skipTaskbar` |
| Registro `HKCU\...\Run` | `app.setLoginItemSettings` (grava na mesma chave) |
| Instância única | `app.requestSingleInstanceLock` |

## Consequências

- Maior consumo de memória que um aplicativo WPF nativo (um processo Chromium por janela de post-it).
- Sem módulos nativos: nenhuma etapa de compilação C++ no build.
- Migrar a camada de domínio/aplicação para C# permanece possível: as regras estão isoladas e cobertas por testes.
