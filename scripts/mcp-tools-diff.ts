/**
 * MCP tool-surface breaking-change detection (PROD-8359, Phase 3).
 *
 * Populates the release-safety marker's `api.mcp` block by diffing a committed
 * snapshot of the MCP tool surface (`packages/common/src/schemas/json/mcp-tools-1.0.json`,
 * produced by `scripts/gen-mcp-tools-snapshot.ts` and regenerated in
 * `postgenerate-api`) between the PREVIOUS release tag and HEAD.
 *
 * The snapshot is the DECLARED MCP tool set (`mcpToolDefinitions` from
 * `@lightdash/common`, the superset of every MCP-available tool) — not the
 * flag-gated runtime subset. Flag-gating (aiWriteback / content-writes /
 * project-pinned) is an operator's per-request runtime choice, not a release
 * change, so the declared surface is the correct unit for a release signal.
 *
 * The diff is a deliberately CONSERVATIVE floor (à la a SQL-shape linter): it
 * flags the four input-contract regressions a caller would actually hit, may
 * over-flag, but never under-flags them. It does NOT treat additive changes
 * (new tool, new optional input) or output-schema/description/annotation changes
 * as breaking — those don't break a caller's existing request.
 *
 * Both snapshot sides are read from git (`git show <ref>:<path>`), like the P1
 * migration detector and the P2 REST diff — never the working tree.
 *
 * FAIL-SAFE (soft): a snapshot absent at either ref (e.g. the first release
 * after this lands), unreadable, or unparseable degrades to `checked: false`
 * (the honest "not checked" stub); the generator then does NOT add `mcp` to
 * `capabilities`. It never asserts an unproven "no break" and never fails the
 * release.
 *
 * CLI:  npx tsx scripts/mcp-tools-diff.ts --last-tag 0.3260.2 [--new-ref HEAD]
 */
import { execFileSync } from 'child_process';

export type TriState = boolean | 'unknown';

export interface ApiSurface {
    checked: boolean;
    breaking: TriState;
    changes: string[];
}

/** Repo-relative path to the committed MCP tool-surface snapshot. */
export const SNAPSHOT_PATH = 'packages/common/src/schemas/json/mcp-tools-1.0.json';

/** Cap on rendered change lines so a large breaking diff can't bloat the marker. */
const MAX_CHANGES = 50;

/** A JSON-Schema-ish object; we only read top-level `properties` / `required`. */
export interface JsonSchemaish {
    type?: string;
    properties?: Record<string, { type?: string | string[] }>;
    required?: string[];
    [k: string]: unknown;
}

export interface SnapshotTool {
    name: string;
    title?: string;
    description?: string;
    annotations?: Record<string, unknown>;
    inputSchema?: JsonSchemaish | null;
    outputSchema?: JsonSchemaish | null;
}

export interface ToolsSnapshot {
    schemaVersion: string;
    tools: SnapshotTool[];
}

function topLevel(schema: JsonSchemaish | null | undefined): {
    properties: Record<string, { type?: string | string[] }>;
    required: Set<string>;
} {
    const properties = (schema && typeof schema === 'object' && schema.properties) || {};
    const required = new Set<string>(
        Array.isArray(schema?.required) ? (schema!.required as string[]) : [],
    );
    return { properties, required };
}

function typeLabel(t: string | string[] | undefined): string {
    if (Array.isArray(t)) return t.join('|');
    return t ?? 'unknown';
}

/**
 * PURE. Conservative 4-rule breaking-change classifier over two tool snapshots.
 * Returns `breaking` + a capped, human-readable list. The four rules:
 *   R1 tool removed
 *   R2 input field became required (added to `required`)
 *   R3 input field removed (a top-level property disappeared)
 *   R4 input field type changed
 * Additive changes (new tool, new optional field) and output/description/
 * annotation changes are intentionally NOT breaking.
 */
export function diffSnapshots(
    oldSnap: ToolsSnapshot,
    newSnap: ToolsSnapshot,
): { breaking: boolean; changes: string[] } {
    const oldByName = new Map(oldSnap.tools.map((t) => [t.name, t]));
    const newByName = new Map(newSnap.tools.map((t) => [t.name, t]));
    const changes: string[] = [];

    // Stable order: iterate old tools by name for removals/changes, then new for nothing.
    const oldNames = [...oldByName.keys()].sort();
    for (const name of oldNames) {
        const oldTool = oldByName.get(name)!;
        const newTool = newByName.get(name);

        // R1: tool removed.
        if (!newTool) {
            changes.push(`MCP tool \`${name}\` removed`);
            continue;
        }

        const oldIn = topLevel(oldTool.inputSchema);
        const newIn = topLevel(newTool.inputSchema);
        const props = new Set([
            ...Object.keys(oldIn.properties),
            ...Object.keys(newIn.properties),
        ]);
        for (const prop of [...props].sort()) {
            const inOld = prop in oldIn.properties;
            const inNew = prop in newIn.properties;

            // R3: input field removed.
            if (inOld && !inNew) {
                changes.push(`MCP tool \`${name}\`: input \`${prop}\` removed`);
                continue;
            }
            // R2: input field became required (covers newly-added required fields too).
            if (inNew && newIn.required.has(prop) && !oldIn.required.has(prop)) {
                changes.push(`MCP tool \`${name}\`: input \`${prop}\` became required`);
            }
            // R4: input field type changed.
            if (inOld && inNew) {
                const ot = typeLabel(oldIn.properties[prop]?.type);
                const nt = typeLabel(newIn.properties[prop]?.type);
                if (ot !== nt) {
                    changes.push(`MCP tool \`${name}\`: input \`${prop}\` type changed ${ot} → ${nt}`);
                }
            }
        }
    }

    const capped = changes.slice(0, MAX_CHANGES);
    if (changes.length > MAX_CHANGES) {
        capped.push(`… and ${changes.length - MAX_CHANGES} more breaking change(s)`);
    }
    return { breaking: changes.length > 0, changes: capped };
}

const UNCHECKED: ApiSurface = { checked: false, breaking: false, changes: [] };

/** IO: read a file at a git ref. Returns null if the path didn't exist there. */
function showAtRef(ref: string, repoPath: string): string | null {
    try {
        return execFileSync('git', ['show', `${ref}:${repoPath}`], {
            encoding: 'utf-8',
            maxBuffer: 64 * 1024 * 1024,
        });
    } catch {
        return null;
    }
}

function parseSnapshot(raw: string): ToolsSnapshot | null {
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tools)) return null;
        return parsed as ToolsSnapshot;
    } catch {
        return null;
    }
}

export interface DiffMcpToolsOpts {
    lastTag: string;
    newRef?: string;
    log?: (msg: string) => void;
}

/**
 * Diff the committed MCP tool snapshot between `lastTag` and `newRef`. Soft
 * fail-safe: any missing/unparseable side returns the honest `checked: false`
 * stub rather than asserting safety.
 */
export function diffMcpTools(opts: DiffMcpToolsOpts): ApiSurface {
    const log = opts.log ?? (() => {});
    const newRef = opts.newRef ?? 'HEAD';

    const oldRaw = showAtRef(opts.lastTag, SNAPSHOT_PATH);
    if (oldRaw === null) {
        log(`snapshot not found at ${opts.lastTag}:${SNAPSHOT_PATH}; api.mcp stays unchecked`);
        return UNCHECKED;
    }
    const newRaw = showAtRef(newRef, SNAPSHOT_PATH);
    if (newRaw === null) {
        log(`snapshot not found at ${newRef}:${SNAPSHOT_PATH}; api.mcp stays unchecked`);
        return UNCHECKED;
    }

    const oldSnap = parseSnapshot(oldRaw);
    const newSnap = parseSnapshot(newRaw);
    if (!oldSnap || !newSnap) {
        log('could not parse a tool snapshot; api.mcp stays unchecked');
        return UNCHECKED;
    }

    const { breaking, changes } = diffSnapshots(oldSnap, newSnap);
    log(`api.mcp checked: ${breaking ? `BREAKING (${changes.length})` : 'no breaking changes'}`);
    return { checked: true, breaking, changes };
}

// ---- CLI --------------------------------------------------------------------

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
    const lastTag = arg('last-tag') ?? arg('previous-version');
    if (!lastTag) throw new Error('--last-tag (or --previous-version) is required');
    const result = diffMcpTools({
        lastTag,
        newRef: arg('new-ref'),
        log: (m) => console.log(`[mcp-tools-diff] ${m}`),
    });
    console.log(JSON.stringify(result, null, 2));
}

const invokedDirectly =
    require.main === module || process.argv[1]?.endsWith('mcp-tools-diff.ts') === true;
if (invokedDirectly) {
    try {
        main();
    } catch (err) {
        console.error(`[mcp-tools-diff] FAILED: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
}
