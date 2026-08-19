import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { parseChangeDeclarations } from './breaking-change-declarations';
import {
    breakingChangeDecisionBrief,
    hollowBreakingReasonMessage,
    isSubstantiveBreakingReason,
} from './breaking-change-gate-policy';
import {
    collectBreakingChangeDeclarationsBetweenRefs,
    DEFAULT_DECLARATIONS_PATH,
} from './release-safety-declarations';
import type { BreakingChangeDeclarationDiff } from './release-safety-declarations';
import { isMigrationPath } from './release-safety-migrations';

interface ApiSurface {
    checked: boolean;
    breaking: boolean | 'unknown';
    changes: string[];
}

export interface ReleaseSafetyGateMarker {
    api: {
        rest: ApiSurface;
        mcp: ApiSurface;
    };
}

export interface GateDiagnostic {
    level: 'error' | 'warning';
    file: string;
    line: number;
    message: string;
}

export interface EvaluateReleaseSafetyGateInput {
    marker: ReleaseSafetyGateMarker;
    markerPath: string;
    declarationChanges: BreakingChangeDeclarationDiff;
    inlineDeclarationDiagnostics?: readonly GateDiagnostic[];
}

export interface ChangedSourceFile {
    file: string;
    source: string;
}

const SOURCE_ROOTS = ['packages/backend/src/', 'packages/common/src/'] as const;

function isNonTestTypeScriptSource(file: string): boolean {
    const normalized = file.replaceAll('\\', '/');
    return (
        SOURCE_ROOTS.some((root) => normalized.startsWith(root)) &&
        /\.(?:ts|tsx)$/.test(normalized) &&
        !/(^|\/)__tests__(\/|$)/.test(normalized) &&
        !/\.(?:test|spec)\.(?:ts|tsx)$/.test(normalized) &&
        !isMigrationPath(normalized)
    );
}

export function detectLegacyInlineBreakingDeclarations(
    sources: readonly ChangedSourceFile[],
): GateDiagnostic[] {
    const diagnostics: GateDiagnostic[] = [];
    for (const source of sources) {
        if (!isNonTestTypeScriptSource(source.file)) continue;
        const parsed = parseChangeDeclarations(source.source, source.file);
        const malformedInlineDeclaration = parsed.diagnostics.find(
            (diagnostic) =>
                diagnostic.declaration === 'breaking' &&
                diagnostic.message.includes('export const breaking'),
        );
        const line = parsed.breaking?.line ?? malformedInlineDeclaration?.line;
        if (line === undefined) continue;
        diagnostics.push({
            level: 'error',
            file: source.file,
            line,
            message: `inline export const breaking is not supported; add a new stable ID to ${DEFAULT_DECLARATIONS_PATH}`,
        });
    }
    return diagnostics;
}

export function evaluateReleaseSafetyGate(
    input: EvaluateReleaseSafetyGateInput,
): GateDiagnostic[] {
    const diagnostics: GateDiagnostic[] =
        input.declarationChanges.diagnostics.map((diagnostic) => ({
            level: 'error',
            file: diagnostic.file,
            line: diagnostic.line,
            message: diagnostic.message,
        }));
    diagnostics.push(...(input.inlineDeclarationDiagnostics ?? []));
    const breakingSurfaces = [
        input.marker.api.rest.checked && input.marker.api.rest.breaking === true
            ? 'REST'
            : null,
        input.marker.api.mcp.checked && input.marker.api.mcp.breaking === true
            ? 'MCP'
            : null,
    ].filter((surface): surface is string => surface !== null);

    if (breakingSurfaces.length === 0) return diagnostics;

    const migrationDeclarations = input.declarationChanges.added.filter(
        (declaration) => declaration.migration !== undefined,
    );
    for (const declaration of migrationDeclarations) {
        diagnostics.push({
            level: 'warning',
            file: DEFAULT_DECLARATIONS_PATH,
            line: 1,
            message: `migration declaration ${JSON.stringify(declaration.id)} does not cover API surface changes`,
        });
    }

    const apiDeclarations = input.declarationChanges.added.filter(
        (declaration) => declaration.migration === undefined,
    );
    const substantiveApiDeclarations = apiDeclarations.filter((declaration) => {
        if (isSubstantiveBreakingReason(declaration.reason)) return true;
        diagnostics.push({
            level: 'error',
            file: DEFAULT_DECLARATIONS_PATH,
            line: 1,
            message: hollowBreakingReasonMessage(DEFAULT_DECLARATIONS_PATH, 1),
        });
        return false;
    });
    if (substantiveApiDeclarations.length === 0) {
        diagnostics.push({
            level: 'error',
            file: input.markerPath,
            line: 1,
            message: breakingChangeDecisionBrief({
                file: input.markerPath,
                line: 1,
                pattern: `breaking ${breakingSurfaces.join(' and ')} API surface change`,
                declarationLocation: `a new stable ID in ${DEFAULT_DECLARATIONS_PATH} with reason and requiredStop`,
            }),
        });
    }

    return diagnostics;
}

function argument(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

function escapeCommandData(value: string): string {
    return value
        .replaceAll('%', '%25')
        .replaceAll('\r', '%0D')
        .replaceAll('\n', '%0A');
}

function escapeCommandProperty(value: string): string {
    return escapeCommandData(value)
        .replaceAll(':', '%3A')
        .replaceAll(',', '%2C');
}

function emit(diagnostic: GateDiagnostic): void {
    console.log(
        `::${diagnostic.level} file=${escapeCommandProperty(diagnostic.file)},line=${diagnostic.line}::${escapeCommandData(diagnostic.message)}`,
    );
}

function changedSourceFiles(baseSha: string): ChangedSourceFile[] {
    const paths = execFileSync(
        'git',
        [
            'diff',
            '--name-only',
            '-z',
            baseSha,
            'HEAD',
            '--',
            'packages/backend/src',
            'packages/common/src',
        ],
        { encoding: 'utf8' },
    )
        .split('\0')
        .filter(Boolean)
        .filter(isNonTestTypeScriptSource)
        .filter((file) => fs.existsSync(file));
    return paths.map((file) => ({
        file,
        source: fs.readFileSync(file, 'utf8'),
    }));
}

function main(): void {
    const baseSha = argument('base-sha');
    const markerPath = argument('marker');
    if (!baseSha) throw new Error('--base-sha is required');
    if (!markerPath) throw new Error('--marker is required');
    const marker = JSON.parse(
        fs.readFileSync(markerPath, 'utf8'),
    ) as ReleaseSafetyGateMarker;
    const diagnostics = evaluateReleaseSafetyGate({
        marker,
        markerPath,
        declarationChanges: collectBreakingChangeDeclarationsBetweenRefs(
            baseSha,
            'HEAD',
        ),
        inlineDeclarationDiagnostics: detectLegacyInlineBreakingDeclarations(
            changedSourceFiles(baseSha),
        ),
    });
    diagnostics.forEach(emit);
    const errors = diagnostics.filter(
        (diagnostic) => diagnostic.level === 'error',
    );
    const warnings = diagnostics.filter(
        (diagnostic) => diagnostic.level === 'warning',
    );
    console.log(
        `[release-safety-pr-gate] ${errors.length} error(s), ${warnings.length} warning(s)`,
    );
    if (errors.length > 0) process.exitCode = 1;
}

const invokedDirectly =
    require.main === module ||
    process.argv[1]?.endsWith('release-safety-pr-gate.ts') === true;

if (invokedDirectly) {
    try {
        main();
    } catch (error) {
        emit({
            level: 'error',
            file: argument('marker') ?? 'scripts/release-safety-pr-gate.ts',
            line: 1,
            message: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
    }
}
