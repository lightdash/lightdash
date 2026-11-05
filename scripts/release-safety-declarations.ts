import { execFileSync } from 'child_process';
import { isSubstantiveBreakingReason } from './breaking-change-gate-policy';
import { partitionDeclarations } from './release-safety-advisories';

export const DEFAULT_DECLARATIONS_PATH = 'release-safety.declarations.json';

export type NoExternalCallersImpact = {
    kind: 'no-external-callers';
    covers: { rest: string[]; mcp: string[] };
} & (
    | { featureFlag: string; firstPartyOnly?: never }
    | { firstPartyOnly: string; featureFlag?: never }
);

export interface AdvisoryDeclaration {
    id: string;
    reason: string;
    requiredStop: false;
    impact: NoExternalCallersImpact;
}

export interface BreakingChangeDeclarationEntry {
    reason: string;
    requiredStop: boolean;
    migration?: string;
    releasedIn?: string;
    impact?: NoExternalCallersImpact;
}

export interface BreakingChangeDeclaration extends Omit<
    BreakingChangeDeclarationEntry,
    'impact'
> {
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
    advisories: AdvisoryDeclaration[];
    diagnostics: BreakingChangeDeclarationDiagnostic[];
}

const allowedRootKeys = new Set(['$schema', 'declarations']);
const allowedEntryKeys = new Set([
    'reason',
    'requiredStop',
    'migration',
    'releasedIn',
    'impact',
]);
const migrationPath =
    /^packages\/backend\/src\/(ee\/)?database\/migrations\/\d{14}_.+\.(ts|js)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseImpact(value: unknown): NoExternalCallersImpact | null {
    if (!isRecord(value) || value.kind !== 'no-external-callers') return null;
    if (
        Object.keys(value).some(
            (key) =>
                !['kind', 'featureFlag', 'firstPartyOnly', 'covers'].includes(
                    key,
                ),
        )
    )
        return null;
    const covers = value.covers;
    if (
        !isRecord(covers) ||
        Object.keys(covers).some((key) => !['rest', 'mcp'].includes(key))
    )
        return null;
    if (!Array.isArray(covers.rest) || !Array.isArray(covers.mcp)) return null;
    if (
        !covers.rest.every(
            (entry): entry is string =>
                typeof entry === 'string' &&
                /^[A-Z]+ \/\S*(?![\s\S])/.test(entry) &&
                !entry.includes(' — '),
        )
    )
        return null;
    if (
        !covers.mcp.every(
            (entry): entry is string =>
                typeof entry === 'string' && /^[^`\s]+(?![\s\S])/.test(entry),
        )
    )
        return null;
    if (
        covers.rest.length + covers.mcp.length === 0 ||
        new Set(covers.rest).size !== covers.rest.length ||
        new Set(covers.mcp).size !== covers.mcp.length
    )
        return null;
    const parsedCovers = { rest: covers.rest, mcp: covers.mcp };
    if (
        'featureFlag' in value &&
        !('firstPartyOnly' in value) &&
        typeof value.featureFlag === 'string' &&
        value.featureFlag.trim().length > 0
    ) {
        return {
            kind: value.kind,
            featureFlag: value.featureFlag,
            covers: parsedCovers,
        };
    }
    if (
        'firstPartyOnly' in value &&
        !('featureFlag' in value) &&
        typeof value.firstPartyOnly === 'string' &&
        isSubstantiveBreakingReason(value.firstPartyOnly)
    ) {
        return {
            kind: value.kind,
            firstPartyOnly: value.firstPartyOnly,
            covers: parsedCovers,
        };
    }
    return null;
}

export type FeatureFlagValuesSource = () => ReadonlySet<string>;
export const FEATURE_FLAGS_PATH = 'packages/common/src/types/featureFlags.ts';

export function parseFeatureFlagValues(source: string): ReadonlySet<string> {
    const withoutComments = source.replace(
        /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,
        (token) => (token.startsWith('/') ? ' ' : token),
    );
    const codeOnly = withoutComments.replace(
        /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g,
        (token) => ' '.repeat(token.length),
    );
    const headers = [
        ...codeOnly.matchAll(/\bexport\s+enum\s+FeatureFlags\s*\{/g),
    ];
    if (headers.length !== 1)
        throw new Error('could not parse FeatureFlags enum');
    const start = headers[0].index + headers[0][0].length;
    const end = codeOnly.indexOf('}', start);
    if (end < 0) throw new Error('could not parse FeatureFlags enum');
    let remaining = withoutComments.slice(start, end).trim();
    const values = new Set<string>();
    const names = new Set<string>();
    while (remaining.length > 0) {
        const member = /^([A-Za-z_$][\w$]*)\s*=\s*'([^'\\\r\n]+)'\s*,/.exec(
            remaining,
        );
        if (!member || names.has(member[1]))
            throw new Error('could not parse FeatureFlags enum member');
        names.add(member[1]);
        values.add(member[2]);
        remaining = remaining.slice(member[0].length).trim();
    }
    if (values.size === 0) throw new Error('FeatureFlags enum has no values');
    return values;
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
        const impact =
            rawEntry.impact === undefined ? null : parseImpact(rawEntry.impact);
        if (
            rawEntry.impact !== undefined &&
            (impact === null ||
                rawEntry.migration !== undefined ||
                rawEntry.requiredStop !== false ||
                typeof rawEntry.reason !== 'string' ||
                !isSubstantiveBreakingReason(rawEntry.reason))
        ) {
            diagnostics.push({
                file,
                line: 1,
                message: `${where}.impact requires a substantive reason, requiredStop: false, no migration, and kind no-external-callers with exactly one evidence field and non-empty valid covers`,
            });
            continue;
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
                ...(impact === null ? {} : { impact }),
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
        impact:
            entry.impact === undefined
                ? null
                : {
                      kind: entry.impact.kind,
                      featureFlag: entry.impact.featureFlag ?? null,
                      firstPartyOnly: entry.impact.firstPartyOnly ?? null,
                      covers: {
                          rest: [...entry.impact.covers.rest].sort(),
                          mcp: [...entry.impact.covers.mcp].sort(),
                      },
                  },
    };
}

export function diffBreakingChangeDeclarations(
    baseSource: string | null,
    targetSource: string | null,
    file = DEFAULT_DECLARATIONS_PATH,
    flagValuesSource: FeatureFlagValuesSource = () => {
        throw new Error('feature flag values source is unavailable');
    },
): BreakingChangeDeclarationDiff {
    const base = parseBreakingChangeDeclarationsFile(baseSource, file);
    const target = parseBreakingChangeDeclarationsFile(targetSource, file);
    const diagnostics = [...base.diagnostics, ...target.diagnostics];
    const added: (BreakingChangeDeclarationEntry & { id: string })[] = [];

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
                message: `declaration ${JSON.stringify(id)} duplicates ${JSON.stringify(duplicateId)}`,
            });
            continue;
        }
        baseContent.set(
            JSON.stringify({
                reason: entry.reason,
                requiredStop: entry.requiredStop,
            }),
            id,
        );
        added.push({ id, ...entry });
    }

    const { ordinary, advisories } = partitionDeclarations(
        added.sort((left, right) => left.id.localeCompare(right.id)),
    );
    const flagged = advisories.filter(
        ({ impact }) => impact.featureFlag !== undefined,
    );
    if (flagged.length > 0) {
        try {
            const values = flagValuesSource();
            if (values.size === 0)
                throw new Error('FeatureFlags enum has no values');
            for (const { id, impact } of flagged) {
                if (
                    impact.featureFlag !== undefined &&
                    !values.has(impact.featureFlag)
                ) {
                    diagnostics.push({
                        file,
                        line: 1,
                        message: `declaration ${JSON.stringify(id)} names unknown feature flag ${JSON.stringify(impact.featureFlag)}`,
                    });
                }
            }
        } catch (error) {
            diagnostics.push({
                file: FEATURE_FLAGS_PATH,
                line: 1,
                message: `could not validate feature flags: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }
    return { added: ordinary, advisories, diagnostics };
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
        () => {
            const source = readFileAtRef(targetRef, FEATURE_FLAGS_PATH);
            if (source === null)
                throw new Error(
                    `could not read ${FEATURE_FLAGS_PATH} at ${targetRef}`,
                );
            return parseFeatureFlagValues(source);
        },
    );
}
