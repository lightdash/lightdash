/**
 * MCP stable/default tool-surface breaking-change detection.
 *
 * Populates the release-safety marker's `api.mcp` block by diffing the committed
 * stable/default MCP surface between the previous release tag and HEAD.
 * Ordinary per-request availability gating does not remove stable tools from
 * this surface. Temporary, off-by-default rollout variants with the same public
 * tool names are intentionally excluded until they replace the defaults.
 *
 * The diff is a deliberately conservative floor: it flags four input-contract
 * regressions, but not additive changes or output, description, or annotation
 * changes. Both snapshot sides are read from git, never the working tree.
 * Missing, unreadable, or unparseable snapshots return `checked: false` rather
 * than asserting an unproven safe result or failing the release.
 *
 * CLI: npx tsx scripts/mcp-tools-diff.ts --last-tag 0.3260.2 [--new-ref HEAD]
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';

export type TriState = boolean | 'unknown';

export interface ApiSurface {
    checked: boolean;
    breaking: TriState;
    changes: string[];
    breakingCount: number;
    advisories: string[];
    advisoryCount: number;
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
 * Returns `breaking`, an uncapped count, and a capped human-readable list. The
 * four rules:
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
): { breaking: boolean; changes: string[]; breakingCount: number } {
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
    return {
        breaking: changes.length > 0,
        changes: capped,
        breakingCount: changes.length,
    };
}

const UNCHECKED: ApiSurface = {
    checked: false,
    breaking: false,
    changes: [],
    breakingCount: 0,
    advisories: [],
    advisoryCount: 0,
};

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

function readSnapshotFile(snapshotPath: string): string | null {
    try {
        return fs.readFileSync(snapshotPath, 'utf-8');
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
    lastTag?: string;
    baseSnapshotPath?: string;
    newRef?: string;
    newSnapshotPath?: string;
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

    if (opts.newRef !== undefined && opts.newSnapshotPath !== undefined) {
        throw new Error('Provide either newRef or newSnapshotPath, not both');
    }
    if ((opts.lastTag === undefined) === (opts.baseSnapshotPath === undefined)) {
        throw new Error('Provide exactly one of lastTag or baseSnapshotPath');
    }

    const oldRaw = opts.baseSnapshotPath
        ? readSnapshotFile(opts.baseSnapshotPath)
        : showAtRef(opts.lastTag as string, SNAPSHOT_PATH);
    if (oldRaw === null) {
        const source = opts.baseSnapshotPath ?? `${opts.lastTag}:${SNAPSHOT_PATH}`;
        log(`snapshot not found at ${source}; api.mcp stays unchecked`);
        return UNCHECKED;
    }
    const newRaw = opts.newSnapshotPath
        ? readSnapshotFile(opts.newSnapshotPath)
        : showAtRef(newRef, SNAPSHOT_PATH);
    if (newRaw === null) {
        const source = opts.newSnapshotPath ?? `${newRef}:${SNAPSHOT_PATH}`;
        log(`snapshot not found at ${source}; api.mcp stays unchecked`);
        return UNCHECKED;
    }

    const oldSnap = parseSnapshot(oldRaw);
    const newSnap = parseSnapshot(newRaw);
    if (!oldSnap || !newSnap) {
        log('could not parse a tool snapshot; api.mcp stays unchecked');
        return UNCHECKED;
    }

    const result = diffSnapshots(oldSnap, newSnap);
    log(
        `api.mcp checked: ${result.breakingCount} breaking, 0 advisory`,
    );
    return {
        checked: true,
        ...result,
        advisories: [],
        advisoryCount: 0,
    };
}

// ---- CLI --------------------------------------------------------------------

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
    const baseSnapshotPath = arg('base-snapshot');
    const lastTag = baseSnapshotPath ? undefined : arg('last-tag') ?? arg('previous-version');
    if (!lastTag && !baseSnapshotPath) {
        throw new Error('--last-tag (or --previous-version) or --base-snapshot is required');
    }
    const newSnapshotPath = arg('new-snapshot');
    const result = diffMcpTools({
        lastTag,
        baseSnapshotPath,
        newRef: newSnapshotPath ? undefined : arg('new-ref'),
        newSnapshotPath,
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
