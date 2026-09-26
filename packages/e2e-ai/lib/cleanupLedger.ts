import { assertUnreachable } from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import {
    appendFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
} from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { LightdashApi } from './api';

// Kill-safe fixture cleanup. Each worker writes how to undo every fixture or
// setting it creates to a ledger named after its pid, and marks it done after
// teardown. A run killed or cut off from the API leaves pending entries; the
// next run's global setup replays them for pids that are no longer alive, so
// a parallel live run is never touched.

const LEDGER_DIR = path.join(__dirname, '..', '.fixture-ledger');

const undoSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('http'),
        method: z.enum(['DELETE', 'POST', 'PUT', 'PATCH']),
        path: z.string(),
        body: z.unknown().optional(),
    }),
    // For state the API cannot remove, e.g. an org setting that did not exist.
    z.object({
        kind: z.literal('sql'),
        text: z.string(),
        params: z.array(z.string()),
    }),
]);

export type Undo = z.output<typeof undoSchema>;

const entrySchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('pending'), id: z.string(), undo: undoSchema }),
    z.object({ kind: z.literal('done'), id: z.string() }),
]);

const ledgerFile = (pid: number) => path.join(LEDGER_DIR, `${pid}.jsonl`);

const append = (entry: z.input<typeof entrySchema>) => {
    mkdirSync(LEDGER_DIR, { recursive: true });
    appendFileSync(ledgerFile(process.pid), `${JSON.stringify(entry)}\n`);
};

/** Records how to undo a fixture; returns the id to mark done later. */
export const recordUndo = (undo: Undo) => {
    const id = randomUUID();
    append({ kind: 'pending', id, undo });
    return id;
};

export const markUndone = (id: string) => append({ kind: 'done', id });

/** Applies an undo and returns what happened, for the sweep's log line. */
export const applyUndo = async (
    api: LightdashApi,
    db: Pool,
    undo: Undo,
): Promise<string> => {
    switch (undo.kind) {
        case 'http': {
            // 404 means it is already gone, which is the goal.
            const reply = await api.send(undo.method, undo.path, undo.body);
            return `${undo.method} ${undo.path} -> ${reply.status}`;
        }
        case 'sql': {
            const result = await db.query(undo.text, undo.params);
            return `${undo.text} -> ${result.rowCount ?? 0} row(s)`;
        }
        default:
            return assertUnreachable(undo, 'Unknown undo');
    }
};

const errnoSchema = z.object({ code: z.string() });

const isAlive = (pid: number) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        // EPERM: the process exists but belongs to someone else.
        return errnoSchema.safeParse(error).data?.code === 'EPERM';
    }
};

const pendingUndos = (file: string): Undo[] => {
    const entries = readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line) => {
            if (line.trim() === '') return [];
            try {
                const entry = entrySchema.safeParse(JSON.parse(line));
                return entry.success ? [entry.data] : [];
            } catch {
                return [];
            }
        });
    const done = new Set(
        entries.flatMap((entry) => (entry.kind === 'done' ? [entry.id] : [])),
    );
    return entries.flatMap((entry) =>
        entry.kind === 'pending' && !done.has(entry.id) ? [entry.undo] : [],
    );
};

/** Replays the pending undos left by workers that are gone. */
export const sweepDeadWorkers = async (api: LightdashApi, db: Pool) => {
    if (!existsSync(LEDGER_DIR)) return;
    const deadWorkerFiles = readdirSync(LEDGER_DIR).flatMap((name) => {
        const pid = Number(path.basename(name, '.jsonl'));
        return Number.isInteger(pid) && !isAlive(pid) ? [{ name, pid }] : [];
    });
    for (const { name, pid } of deadWorkerFiles) {
        const file = path.join(LEDGER_DIR, name);
        // Newest first, like teardown: a document goes before its agent.
        for (const undo of pendingUndos(file).reverse()) {
            console.log(
                `[fixture sweep] ${await applyUndo(api, db, undo)} (left by dead worker ${pid})`,
            );
        }
        rmSync(file);
    }
};
