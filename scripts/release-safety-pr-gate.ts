import { execFileSync } from 'child_process';
import * as fs from 'fs';
import {
    collectBreakingChangeDeclarations,
    formatChangeDeclarationDiagnostic,
} from './breaking-change-declarations';

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
    changedFiles: readonly string[];
    readFile?: (path: string) => string;
}

const TYPESCRIPT_SOURCE = /^packages\/(backend|common)\/src\/.+\.tsx?$/;
const TYPESCRIPT_TEST = /(^|\/)__tests__\/|\.(test|spec)\.tsx?$/;
const MIGRATION_SOURCE =
    /^packages\/backend\/src\/(ee\/)?database\/migrations\//;

export function evaluateReleaseSafetyGate(
    input: EvaluateReleaseSafetyGateInput,
): GateDiagnostic[] {
    const breakingSurfaces = [
        input.marker.api.rest.checked && input.marker.api.rest.breaking === true
            ? 'REST'
            : null,
        input.marker.api.mcp.checked && input.marker.api.mcp.breaking === true
            ? 'MCP'
            : null,
    ].filter((surface): surface is string => surface !== null);

    if (breakingSurfaces.length === 0) return [];

    const sourceFiles = input.changedFiles.filter(
        (file) => TYPESCRIPT_SOURCE.test(file) && !TYPESCRIPT_TEST.test(file),
    );
    const declarations = collectBreakingChangeDeclarations(
        sourceFiles,
        input.readFile,
    );
    const diagnostics: GateDiagnostic[] = declarations.diagnostics
        .filter((diagnostic) => diagnostic.declaration !== 'classification')
        .map((diagnostic) => ({
            level: 'error',
            file: diagnostic.file,
            line: diagnostic.line,
            message: formatChangeDeclarationDiagnostic(diagnostic),
        }));

    const migrationDeclarations = declarations.breaking.filter((declaration) =>
        MIGRATION_SOURCE.test(declaration.file),
    );
    for (const declaration of migrationDeclarations) {
        diagnostics.push({
            level: 'warning',
            file: declaration.file,
            line: declaration.line,
            message: `${declaration.file}:${declaration.line} migration breaking declarations do not cover API surface changes`,
        });
    }

    const apiDeclarations = declarations.breaking.filter(
        (declaration) => !MIGRATION_SOURCE.test(declaration.file),
    );
    if (apiDeclarations.length === 0) {
        diagnostics.push({
            level: 'error',
            file: input.markerPath,
            line: 1,
            message: `${input.markerPath}:1 breaking ${breakingSurfaces.join(' and ')} changes require export const breaking = { reason: string, requiredStop: boolean } in a changed non-migration TypeScript source file under packages/backend or packages/common`,
        });
    }

    return diagnostics;
}

function changedFiles(baseSha: string): string[] {
    return execFileSync(
        'git',
        ['diff', '--name-only', '--diff-filter=ACMR', baseSha, 'HEAD', '--'],
        { encoding: 'utf8' },
    )
        .split('\n')
        .filter(Boolean);
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
        changedFiles: changedFiles(baseSha),
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
