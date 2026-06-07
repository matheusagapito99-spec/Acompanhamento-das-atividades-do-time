# Acompanhamento das atividades do time

Dashboard para acompanhar a produtividade do departamento de Marketing usando dados reais do Runrun.it.

## Escopo inicial

- Pessoas: Allana, Bruno, Bruna e Beatriz.
- Quadros: `Demandas de Marketing` e `Criacao`.
- Visoes: geral do departamento, comparativos, carga, telas individuais, alertas e auditoria das tarefas.
- Periodos: semana, quinzena, mes e intervalo personalizado.

## Variaveis de ambiente

Configure as variaveis abaixo no Vercel e, se for rodar localmente, tambem no terminal local:

```bash
RUNRUNIT_APP_KEY=...
RUNRUNIT_USER_TOKEN=...
```

Opcionais:

```bash
MARKETING_COLLABORATORS=Allana,Bruno,Bruna,Beatriz
RUNRUNIT_BOARD_NAMES=Demandas de Marketing,Criacao
```

As chaves do Runrun.it nunca devem ser salvas no codigo. Se elas ja apareceram em print ou conversa, redefina os tokens antes de publicar uma versao compartilhada.

## Rodar localmente

Este projeto nao depende de instalacao de pacotes.

```bash
node local-server.cjs
```

Depois abra:

```text
http://localhost:4173
```

## Testes

```bash
node --test test/*.test.cjs
```

## Deploy

O projeto esta preparado para Vercel:

- `index.html`, `styles.css` e `app.js` formam a interface.
- `/api/analytics` consulta o Runrun.it no servidor e calcula os indicadores.
- `/api/health` informa se as variaveis obrigatorias estao configuradas.

No painel da Vercel, configure `RUNRUNIT_APP_KEY` e `RUNRUNIT_USER_TOKEN` em Environment Variables. Depois, qualquer push no GitHub deve gerar uma implantacao de preview ou producao conforme a configuracao do projeto.
