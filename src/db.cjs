/* =========================================================================
   Camada de dados (Postgres / Neon).

   Estratégia: o sync periódico grava um SNAPSHOT (tasks/users/boards em JSONB,
   já com o histórico anexado) numa única linha, e mantém a tabela card_due com o
   PRIMEIRO prazo visto de cada card. A leitura monta de volta a lista de tasks
   sobrepondo o primeiro prazo (exposto como first_desired_date, que o motor de
   métricas já prioriza). Tudo desligado/ignorado quando DATABASE_URL não existe.
   ========================================================================= */

function dbEnabled(env = process.env) {
  return Boolean(env.DATABASE_URL);
}

function getSql(env = process.env) {
  const { neon } = require('@neondatabase/serverless');
  return neon(env.DATABASE_URL);
}

async function ensureSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS snapshots (
    id integer PRIMARY KEY DEFAULT 1,
    synced_at timestamptz NOT NULL DEFAULT now(),
    tasks jsonb NOT NULL,
    users jsonb,
    boards jsonb,
    source jsonb,
    CONSTRAINT snapshots_single_row CHECK (id = 1)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS card_due (
    card_id text PRIMARY KEY,
    first_due_at timestamptz NOT NULL,
    first_seen_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS sync_state (
    id integer PRIMARY KEY DEFAULT 1,
    synced_at timestamptz,
    ok boolean,
    card_count integer,
    note text,
    CONSTRAINT sync_state_single_row CHECK (id = 1)
  )`;
}

// --- helpers puros (testáveis sem banco) -----------------------------------

function resolveDue(task = {}) {
  const value = task.first_desired_date
    || task.original_desired_date
    || task.desired_date_with_time
    || task.desired_date
    || task.estimated_delivery_date
    || task.due_date;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getTaskId(task = {}) {
  const id = task.id ?? task.task_id ?? task.taskId;
  return id === undefined || id === null ? null : String(id);
}

function buildDueList(tasks = []) {
  const list = [];
  for (const task of tasks) {
    const id = getTaskId(task);
    const due = resolveDue(task);
    if (id && due) list.push({ id, due });
  }
  return list;
}

// Sobrepõe o primeiro prazo persistido como first_desired_date (o motor prioriza esse campo).
function overlayFirstDue(tasks = [], dueMap = {}) {
  return tasks.map((task) => {
    const id = getTaskId(task);
    const firstDue = id ? dueMap[id] : null;
    return firstDue ? { ...task, first_desired_date: firstDue } : task;
  });
}

// --- escrita / leitura -----------------------------------------------------

async function writeSnapshot(sql, { tasks = [], users = [], boards = [], source = {} } = {}) {
  await sql`INSERT INTO snapshots (id, tasks, users, boards, source, synced_at)
    VALUES (1, ${JSON.stringify(tasks)}::jsonb, ${JSON.stringify(users)}::jsonb, ${JSON.stringify(boards)}::jsonb, ${JSON.stringify(source)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET
      tasks = EXCLUDED.tasks, users = EXCLUDED.users, boards = EXCLUDED.boards,
      source = EXCLUDED.source, synced_at = now()`;

  const dueList = buildDueList(tasks);
  if (dueList.length) {
    await sql`INSERT INTO card_due (card_id, first_due_at)
      SELECT e->>'id', (e->>'due')::timestamptz
      FROM jsonb_array_elements(${JSON.stringify(dueList)}::jsonb) AS e
      ON CONFLICT (card_id) DO NOTHING`;
  }
  return { cardCount: tasks.length, dueCount: dueList.length };
}

async function readSnapshot(sql) {
  const rows = await sql`SELECT tasks, users, boards, source, synced_at FROM snapshots WHERE id = 1`;
  if (!rows.length) return null;
  const row = rows[0];
  const dues = await sql`SELECT card_id, first_due_at FROM card_due`;
  const dueMap = {};
  for (const d of dues) dueMap[String(d.card_id)] = new Date(d.first_due_at).toISOString();
  return {
    tasks: overlayFirstDue(Array.isArray(row.tasks) ? row.tasks : [], dueMap),
    users: Array.isArray(row.users) ? row.users : [],
    boards: Array.isArray(row.boards) ? row.boards : [],
    source: row.source || {},
    syncedAt: row.synced_at ? new Date(row.synced_at).toISOString() : null,
  };
}

async function setSyncState(sql, { ok, cardCount = 0, note = '' } = {}) {
  await sql`INSERT INTO sync_state (id, synced_at, ok, card_count, note)
    VALUES (1, now(), ${Boolean(ok)}, ${cardCount}, ${note})
    ON CONFLICT (id) DO UPDATE SET synced_at = now(), ok = EXCLUDED.ok, card_count = EXCLUDED.card_count, note = EXCLUDED.note`;
}

async function getSyncState(sql) {
  const rows = await sql`SELECT synced_at, ok, card_count, note FROM sync_state WHERE id = 1`;
  return rows.length ? rows[0] : null;
}

module.exports = {
  dbEnabled,
  getSql,
  ensureSchema,
  resolveDue,
  getTaskId,
  buildDueList,
  overlayFirstDue,
  writeSnapshot,
  readSnapshot,
  setSyncState,
  getSyncState,
};
