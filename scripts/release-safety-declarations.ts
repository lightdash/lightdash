import { execFileSync } from 'child_process';

export const DEFAULT_DECLARATIONS_PATH = 'release-safety.declarations.json';

export interface BreakingChangeDeclarationEntry {
    reason: string;
    requiredStop: boolean;
    migration?: string;
    releasedIn?: string;
}

export interface BreakingChangeDeclaration extends BreakingChangeDeclarationEntry {
    id: string;
}

export interface BreakingChangeDeclarationsFile {
    $schema?: string;
    declarations: Record<string, BreakingChangeDeclarationEntry>;
}

export interface BreakingChangeDeclarationDiagnostic {
    file: string;
    line: number;
    message: string;
}

export interface BreakingChangeDeclarationDiff {
    added: BreakingChangeDeclaration[];
    diagnostics: BreakingChangeDeclarationDiagnostic[];
}

const allowedRootKeys = new Set(['$schema', 'declarations']);
const allowedEntryKeys = new Set([
    'reason',
    'requiredStop',
    'migration',
    'releasedIn',
]);
const migrationPath =
    /^packages\/backend\/src\/(ee\/)?database\/migrations\/\d{14}_.+\.(ts|js)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function emptyDeclarations(): BreakingChangeDeclarationsFile {
    return { declarations: {} };
}

export function parseBreakingChangeDeclarationsFile(
    source: string | null,
    file = DEFAULT_DECLARATIONS_PATH,
): {
    value: BreakingChangeDeclarationsFile;
    diagnostics: BreakingChangeDeclarationDiagnostic[];
} {
    if (source === null) return { value: emptyDeclarations(), diagnostics: [] };

    const diagnostics: BreakingChangeDeclarationDiagnostic[] = [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(source);
    } catch (error) {
        return {
            value: emptyDeclarations(),
            diagnostics: [
                {
                    file,
                    line: 1,
                    message: `registry is not valid JSON: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                },
            ],
        };
    }

    if (!isRecord(parsed)) {
        return {
            value: emptyDeclarations(),
            diagnostics: [
                {
                    file,
                    line: 1,
                    message: 'registry root must be an object',
                },
            ],
        };
    }

    for (const key of Object.keys(parsed)) {
        if (!allowedRootKeys.has(key)) {
            diagnostics.push({
                file,
                line: 1,
                message: `registry has unsupported property ${JSON.stringify(key)}`,
            });
        }
    }

    if (!isRecord(parsed.declarations)) {
        diagnostics.push({
            file,
            line: 1,
            message: 'registry.declarations must be an object',
        });
        return { value: emptyDeclarations(), diagnostics };
    }

    const declarations: Record<string, BreakingChangeDeclarationEntry> = {};
    for (const [id, rawEntry] of Object.entries(parsed.declarations)) {
        const where = `registry.declarations[${JSON.stringify(id)}]`;
        if (id.trim().length === 0) {
            diagnostics.push({
                file,
                line: 1,
                message: 'registry declaration IDs must not be empty',
            });
            continue;
        }
        if (!isRecord(rawEntry)) {
            diagnostics.push({
                file,
                line: 1,
                message: `${where} must be an object`,
            });
            continue;
        }
        for (const key of Object.keys(rawEntry)) {
            if (!allowedEntryKeys.has(key)) {
                diagnostics.push({
                    file,
                    line: 1,
                    message: `${where} has unsupported property ${JSON.stringify(key)}`,
                });
            }
        }
        if (
            typeof rawEntry.reason !== 'string' ||
            rawEntry.reason.trim().length === 0
        ) {
            diagnostics.push({
                file,
                line: 1,
                message: `${where}.reason must be a non-empty string`,
            });
        }
        if (typeof rawEntry.requiredStop !== 'boolean') {
            diagnostics.push({
                file,
                line: 1,
                message: `${where}.requiredStop must be a boolean`,
            });
        }
        if (
            rawEntry.migration !== undefined &&
            (typeof rawEntry.migration !== 'string' ||
                !migrationPath.test(rawEntry.migration))
        ) {
            diagnostics.push({
                file,
                line: 1,
                message: `${where}.migration must be a release-safety migration path`,
            });
        }
        if (
            rawEntry.releasedIn !== undefined &&
            (typeof rawEntry.releasedIn !== 'string' ||
                rawEntry.releasedIn.trim().length === 0)
        ) {
            diagnostics.push({
                file,
                line: 1,
                message: `${where}.releasedIn must be a non-empty string`,
            });
        }
        if (
            typeof rawEntry.reason === 'string' &&
            rawEntry.reason.trim().length > 0 &&
            typeof rawEntry.requiredStop === 'boolean' &&
            (rawEntry.migration === undefined ||
                (typeof rawEntry.migration === 'string' &&
                    migrationPath.test(rawEntry.migration))) &&
            (rawEntry.releasedIn === undefined ||
                (typeof rawEntry.releasedIn === 'string' &&
                    rawEntry.releasedIn.trim().length > 0))
        ) {
            declarations[id] = {
                reason: rawEntry.reason,
                requiredStop: rawEntry.requiredStop,
                ...(rawEntry.migration === undefined
                    ? {}
                    : { migration: rawEntry.migration }),
                ...(rawEntry.releasedIn === undefined
                    ? {}
                    : { releasedIn: rawEntry.releasedIn }),
            };
        }
    }

    return { value: { declarations }, diagnostics };
}

function immutableEntry(entry: BreakingChangeDeclarationEntry): object {
    return {
        reason: entry.reason,
        requiredStop: entry.requiredStop,
        migration: entry.migration ?? null,
    };
}

export function diffBreakingChangeDeclarations(
    baseSource: string | null,
    targetSource: string | null,
    file = DEFAULT_DECLARATIONS_PATH,
): BreakingChangeDeclarationDiff {
    const base = parseBreakingChangeDeclarationsFile(baseSource, file);
    const target = parseBreakingChangeDeclarationsFile(targetSource, file);
    const diagnostics = [...base.diagnostics, ...target.diagnostics];
    const added: BreakingChangeDeclaration[] = [];

    for (const [id, baseEntry] of Object.entries(base.value.declarations)) {
        const targetEntry = target.value.declarations[id];
        if (!targetEntry) {
            diagnostics.push({
                file,
                line: 1,
                message: `declaration ${JSON.stringify(id)} was removed; declaration IDs are append-only`,
            });
            continue;
        }
        if (
            JSON.stringify(immutableEntry(baseEntry)) !==
                JSON.stringify(immutableEntry(targetEntry)) ||
            (baseEntry.releasedIn !== undefined &&
                baseEntry.releasedIn !== targetEntry.releasedIn)
        ) {
            diagnostics.push({
                file,
                line: 1,
                message: `declaration ${JSON.stringify(id)} changed; add a new ID for a new breaking change`,
            });
        }
    }

    const baseContent = new Map<string, string>();
    for (const [id, entry] of Object.entries(base.value.declarations)) {
        baseContent.set(
            JSON.stringify({
                reason: entry.reason,
                requiredStop: entry.requiredStop,
            }),
            id,
        );
    }
    for (const [id, entry] of Object.entries(target.value.declarations)) {
        if (base.value.declarations[id]) continue;
        const duplicateId = baseContent.get(
            JSON.stringify({
                reason: entry.reason,
                requiredStop: entry.requiredStop,
            }),
        );
        if (duplicateId) {
            diagnostics.push({
                file,
                line: 1,
                message: `declaration ${JSON.stringify(id)} duplicates ${JSON.stringify(duplicateId)} from the base ref`,
            });
            continue;
        }
        added.push({ id, ...entry });
    }

    return {
        added: added.sort((left, right) => left.id.localeCompare(right.id)),
        diagnostics,
    };
}

function readFileAtRef(ref: string, file: string): string | null {
    try {
        return execFileSync('git', ['show', `${ref}:${file}`], {
            encoding: 'utf8',
            maxBuffer: 16 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    } catch {
        return null;
    }
}

export function collectBreakingChangeDeclarationsBetweenRefs(
    baseRef: string,
    targetRef: string,
    file = DEFAULT_DECLARATIONS_PATH,
): BreakingChangeDeclarationDiff {
    return diffBreakingChangeDeclarations(
        readFileAtRef(baseRef, file),
        readFileAtRef(targetRef, file),
        file,
    );
}
