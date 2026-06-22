/* =========================================================================
   Leitor do histórico da tarefa a partir dos comentários do sistema do Runrun.it.

   Os comentários do sistema seguem formatos como:
   - "{Pessoa} moveu a tarefa da etapa '{A}' para a etapa '{B}' no quadro '{Q}'.
      A tarefa permaneceu {Xh Ymin} na etapa '{A}'."
   - "A automação '{Nome}' solicitou aprovação para {Pessoa} nessa tarefa."
   - "A automação '{Nome}' desalocou {Pessoa} da tarefa."
   - "O tempo limite de inatividade de {N} dia(s) na etapa '{Etapa}' foi ultrapassado."

   Módulo puro: recebe a lista de comentários e devolve agregados de tempo
   por contexto (quadro do Bruno x quadro das meninas) e o excedente de aprovação.
   ========================================================================= */

const DAY_SECONDS = 86400;
const APPROVAL_INACTIVITY_LIMIT_SECONDS = DAY_SECONDS; // 1 dia na coluna "Aprovação"

const CREATION_BOARD_HINTS = ['criacao']; // "Criação" e "Demandas de MKT (Criação)"
const MARKETING_BOARD_HINTS = ['demandas de mkt', 'demandas de marketing', 'demandas mkt'];
const CREATION_BOARD_ID = '606409';
const MARKETING_BOARD_ID = '601838';

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// "bruno" (quadro de criação), "marketing" (quadro das meninas) ou "other".
function classifyBoard(boardName, boardId) {
  const id = String(boardId || '').trim();
  if (id === CREATION_BOARD_ID) return 'bruno';
  if (id === MARKETING_BOARD_ID) return 'marketing';
  const name = normalize(boardName);
  if (!name) return 'other';
  // "Criação" precede o casamento de "Demandas de MKT" para não confundir
  // "Demandas de MKT (Criação)" com o quadro das meninas.
  if (CREATION_BOARD_HINTS.some((hint) => name.includes(hint))) return 'bruno';
  if (MARKETING_BOARD_HINTS.some((hint) => name.includes(hint))) return 'marketing';
  return 'other';
}

function isApprovalStage(stageName) {
  // Coluna de aprovação de arte/texto onde vale a regra de 1 dia.
  const stage = normalize(stageName);
  return stage === 'aprovacao' || stage.startsWith('aprovacao de texto') || stage.startsWith('aprovacao de arte');
}

function isExecutionStage(stageName) {
  const stage = normalize(stageName);
  return stage.includes('producao') || stage.includes('fazendo');
}

// "2d 19h 51min", "2h 58min", "1d", "45min", "1h 0min" -> segundos
function parseDurationToSeconds(text) {
  const value = String(text || '').toLowerCase();
  let seconds = 0;
  let matched = false;
  const days = value.match(/(\d+)\s*d\b/);
  const hours = value.match(/(\d+)\s*h\b/);
  const mins = value.match(/(\d+)\s*min\b/);
  if (days) { seconds += Number(days[1]) * DAY_SECONDS; matched = true; }
  if (hours) { seconds += Number(hours[1]) * 3600; matched = true; }
  if (mins) { seconds += Number(mins[1]) * 60; matched = true; }
  return matched ? seconds : 0;
}

function commentText(comment = {}) {
  return String(comment.text || comment.description || comment.comment || comment.body || comment.content || '');
}

function commentDate(comment = {}) {
  const raw = comment.created_at || comment.date || comment.created || comment.inserted_at;
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

const MOVE_RE = /moveu a tarefa da etapa '(.+?)' para a etapa '(.+?)' no quadro '(.+?)'\.\s*a tarefa permaneceu (.+?) na etapa/i;
const LIMIT_EXCEEDED_RE = /tempo limite de inatividade de (\d+) dias? na etapa '(.+?)' foi ultrapassado/i;

/**
 * Reconstrói os tempos da tarefa a partir dos comentários.
 * @param {Array} comments lista de comentários do Runrun.it
 * @param {Object} options { now, currentBoardName, currentBoardId, currentStageName, lastActivityAt }
 * @returns agregados de tempo por contexto
 */
function parseTaskHistory(comments = [], options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const events = (Array.isArray(comments) ? comments : [])
    .map((c) => ({ at: commentDate(c), text: commentText(c) }))
    .filter((e) => e.at && e.text)
    .sort((a, b) => a.at - b.at);

  const boardTime = { bruno: 0, marketing: 0, other: 0 };
  let brunoExecutionSeconds = 0;
  let approvalExcessSeconds = 0;
  const moveOuts = []; // { at } — toda saída de etapa (para fechar janelas de aprovação)
  const limitEvents = []; // { at, stage }

  for (const ev of events) {
    const move = ev.text.match(MOVE_RE);
    if (move) {
      const fromStage = move[1];
      const boardName = move[3];
      const durationText = move[4];
      const seconds = parseDurationToSeconds(durationText);
      const board = classifyBoard(boardName);
      boardTime[board] += seconds;
      if (board === 'bruno' && isExecutionStage(fromStage)) brunoExecutionSeconds += seconds;
      moveOuts.push({ at: ev.at });
      continue;
    }
    const limit = ev.text.match(LIMIT_EXCEEDED_RE);
    if (limit) {
      limitEvents.push({ at: ev.at, stage: limit[2] });
    }
  }

  // Excedente de aprovação: do momento em que o limite de 1 dia é ultrapassado
  // até a tarefa sair da etapa (próxima movimentação) ou até agora.
  for (const limit of limitEvents) {
    const exit = moveOuts.find((m) => m.at > limit.at);
    const end = exit ? exit.at : now;
    approvalExcessSeconds += Math.max(0, Math.round((end.getTime() - limit.at.getTime()) / 1000));
  }

  // Segmento em aberto (etapa atual ainda não foi "deixada", logo não há comentário de duração).
  const lastActivity = options.lastActivityAt ? new Date(options.lastActivityAt) : null;
  if (lastActivity && !Number.isNaN(lastActivity.getTime())) {
    const ongoing = Math.max(0, Math.round((now.getTime() - lastActivity.getTime()) / 1000));
    const board = classifyBoard(options.currentBoardName, options.currentBoardId);
    boardTime[board] += ongoing;
    if (board === 'bruno' && isExecutionStage(options.currentStageName)) brunoExecutionSeconds += ongoing;
    // Se estiver parado na coluna de aprovação além de 1 dia e o evento de limite
    // ainda não estiver nos comentários, contabiliza o excedente atual.
    if (board === 'bruno' && isApprovalStage(options.currentStageName) && !limitEvents.length) {
      approvalExcessSeconds += Math.max(0, ongoing - APPROVAL_INACTIVITY_LIMIT_SECONDS);
    }
  }

  // Tempo no quadro do Bruno que PAUSA o prazo das meninas (tudo menos o excedente de aprovação).
  const pausedSeconds = Math.max(0, boardTime.bruno - approvalExcessSeconds);

  return {
    hasHistory: events.length > 0,
    boardTimeSeconds: boardTime,
    brunoExecutionSeconds,
    approvalExcessSeconds,
    pausedSeconds,
    eventCount: events.length,
  };
}

module.exports = {
  APPROVAL_INACTIVITY_LIMIT_SECONDS,
  classifyBoard,
  isApprovalStage,
  isExecutionStage,
  parseDurationToSeconds,
  parseTaskHistory,
};
