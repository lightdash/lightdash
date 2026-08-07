import { assertUnreachable } from '@lightdash/common';
import { Command, InvalidArgumentError, type OptionValues } from 'commander';
import { promises as fs } from 'fs';
import {
    getPreflightCore,
    type PreflightCore,
    type PreflightFinding,
    type PreflightVerdict,
} from './core';
import { deriveCurrentVersion, type MigrationVersion } from './currentVersion';
import { fetchMigrationFacts } from './factsClient';
import { createProbeClient, type ProbeSample } from './probeClient';

export interface PreflightOptions {
    to: string;
    from: string | null;
    facts: string[];
    intervalSeconds: number;
    json: boolean;
}

export interface PreflightCommandDependencies {
    core: () => PreflightCore;
    readFile: (path: string) => Promise<string>;
    fetchFacts: (version: string) => Promise<string>;
    sampleProbe: (
        tables: string[],
        intervalSeconds: number,
    ) => Promise<ProbeSample>;
    stdout: (output: string) => void;
    stderr: (output: string) => void;
}

const defaultDependencies: PreflightCommandDependencies = {
    core: getPreflightCore,
    readFile: (path) => fs.readFile(path, 'utf8'),
    fetchFacts: fetchMigrationFacts,
    sampleProbe: createProbeClient().sample,
    stdout: (output) => process.stdout.write(output),
    stderr: (output) => process.stderr.write(output),
};

const parsePositiveNumber = (value: string): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new InvalidArgumentError(
            `Expected a positive number, received "${value}".`,
        );
    }
    return parsed;
};

export function exitCodeForOutcome(outcome: PreflightVerdict): 0 | 1 | 2;
export function exitCodeForOutcome(outcome: 'error'): 3;
export function exitCodeForOutcome(
    outcome: PreflightVerdict | 'error',
): 0 | 1 | 2 | 3;
export function exitCodeForOutcome(
    outcome: PreflightVerdict | 'error',
): 0 | 1 | 2 | 3 {
    switch (outcome) {
        case 'ok':
            return 0;
        case 'info':
            return 0;
        case 'warn':
            return 1;
        case 'blocker':
            return 2;
        case 'error':
            return 3;
        default:
            return assertUnreachable(outcome, 'Unknown preflight outcome');
    }
}

const normalizeOptions = (options: OptionValues): PreflightOptions => ({
    to: options.to as string,
    from: (options.from as string | undefined) ?? null,
    facts: (options.facts as string[] | undefined) ?? [],
    intervalSeconds: options.interval as number,
    json: options.json as boolean,
});

const tableNamesForFacts = (
    facts: Array<{ tables: Array<{ name: string }> }>,
): string[] => [
    ...new Set(facts.flatMap((fact) => fact.tables.map((table) => table.name))),
];

export const loadFactsContents = async (
    options: Pick<PreflightOptions, 'facts' | 'to'>,
    dependencies: Pick<PreflightCommandDependencies, 'fetchFacts' | 'readFile'>,
): Promise<string[]> =>
    options.facts.length > 0
        ? Promise.all(options.facts.map(dependencies.readFile))
        : [await dependencies.fetchFacts(options.to)];

export const resolveCurrentVersion = ({
    appliedMigrations,
    migrationVersions,
    suppliedVersion,
    stderr,
}: {
    appliedMigrations: string[] | null;
    migrationVersions: MigrationVersion[];
    suppliedVersion: string | null;
    stderr: (output: string) => void;
}): string => {
    if (appliedMigrations === null) {
        if (suppliedVersion !== null) {
            return suppliedVersion;
        }

        throw new Error(
            'This Lightdash instance is too old to report its applied migrations. Pass --from <version> explicitly.',
        );
    }

    const result = deriveCurrentVersion(
        appliedMigrations,
        migrationVersions,
        suppliedVersion,
    );
    if (result.status !== 'matched') {
        throw new Error(result.message);
    }
    if (result.message !== null) {
        stderr(`[preflight] ${result.message}\n`);
    }
    return result.selectedVersion;
};

export const runPreflight = async (
    options: PreflightOptions,
    dependencies: PreflightCommandDependencies = defaultDependencies,
): Promise<0 | 1 | 2> => {
    const factsContents = await loadFactsContents(options, dependencies);
    const core = dependencies.core();
    const factsFiles = factsContents.map(core.parseFactsFile);
    const mergedFacts = core.mergeFactsFiles(factsFiles);
    // Sample every table any fact touches, not just the supplied range's: the
    // range can still change below when --from is reconciled against the
    // database, and a table missing from the sample makes the write-rate and
    // lock-timeout checks skip it silently.
    const tables = tableNamesForFacts(mergedFacts.migrationFacts);
    dependencies.stderr(
        `[preflight] sampling write activity for ${options.intervalSeconds}s across ${tables.length} table(s)...\n`,
    );
    const sample = await dependencies.sampleProbe(
        tables,
        options.intervalSeconds,
    );

    const from = resolveCurrentVersion({
        appliedMigrations: sample.after.appliedMigrations,
        migrationVersions: mergedFacts.migrationFacts.map(
            ({ migration, introducedIn }) => ({
                migration,
                version: introducedIn,
            }),
        ),
        suppliedVersion: options.from,
        stderr: dependencies.stderr,
    });

    const selectedFacts = core.selectFacts(
        mergedFacts.migrationFacts,
        from,
        options.to,
    );
    const rangeCoverage = core.findRangeGaps(factsFiles, from, options.to);
    const findings: PreflightFinding[] = [
        core.analyzeLock(
            sample.after.lockRows,
            sample.after.lastMigrationAgeSeconds,
        ),
    ];
    const rates = core.computeWriteRates(
        sample.before.statRows,
        sample.after.statRows,
        options.intervalSeconds,
    );
    findings.push(...core.analyzeWriteRates(selectedFacts, rates, 10));
    findings.push(
        ...core.analyzeLockTimeouts(
            selectedFacts,
            new Map(rates.map((rate) => [rate.table, rate.liveTuples])),
            100000,
        ),
    );
    findings.push(...core.analyzeActivity(sample.after.activityRows, 300));
    findings.push(...core.analyzeUpgradeStrategy(selectedFacts));

    const skippedBackfills = selectedFacts.filter(
        (fact) => fact.backfill !== null,
    );
    if (skippedBackfills.length > 0) {
        findings.push({
            check: 'row-estimate',
            severity: 'warn',
            migration: null,
            table: null,
            summary: `EXPLAIN-based row-estimate and plan-shape checks are unavailable through the probe endpoint for ${skippedBackfills.length} backfill(s)`,
            action: 'Assess these backfills manually until the server can verify a signed facts artifact and run the required EXPLAIN checks',
            actionKind: 'plan',
            data: {
                skippedMigrations: skippedBackfills.map(
                    (fact) => fact.migration,
                ),
            },
        });
    }

    const report = core.buildReport(
        from,
        options.to,
        selectedFacts,
        findings,
        mergedFacts,
        rangeCoverage,
        mergedFacts.enterpriseMigrationsWithoutFacts,
    );
    dependencies.stdout(
        `${options.json ? JSON.stringify(report, null, 2) : core.renderHuman(report)}\n`,
    );
    return exitCodeForOutcome(report.verdict);
};

export type PreflightAction = (options: PreflightOptions) => Promise<void>;

export interface PreflightActionDependencies {
    run: (options: PreflightOptions) => Promise<0 | 1 | 2>;
    stderr: (output: string) => void;
    exit: (code: 0 | 1 | 2 | 3) => void;
}

const defaultActionDependencies: PreflightActionDependencies = {
    run: runPreflight,
    stderr: (output) => process.stderr.write(output),
    exit: (code) => process.exit(code),
};

export const executePreflightAction = async (
    options: PreflightOptions,
    dependencies: PreflightActionDependencies = defaultActionDependencies,
): Promise<void> => {
    try {
        dependencies.exit(await dependencies.run(options));
    } catch (error) {
        dependencies.stderr(
            `[preflight] ${error instanceof Error ? error.message : String(error)}\n`,
        );
        dependencies.exit(exitCodeForOutcome('error'));
    }
};

const defaultAction: PreflightAction = executePreflightAction;

export const configurePreflightCommand = (
    command: Command,
    action: PreflightAction = defaultAction,
): Command =>
    command
        .description(
            'Check an instance for migration risks before upgrading Lightdash',
        )
        .requiredOption('--to <version>', 'Target Lightdash version')
        .option('--from <version>', 'Current Lightdash version')
        .option(
            '--facts <paths...>',
            'Override the release asset with local facts file(s); skips download',
        )
        .option(
            '--interval <seconds>',
            'Write-rate sample window',
            parsePositiveNumber,
            10,
        )
        .option('--json', 'Emit machine-readable JSON', false)
        .action((options) => action(normalizeOptions(options)));

export const createPreflightCommand = (
    action: PreflightAction = defaultAction,
): Command => configurePreflightCommand(new Command('preflight'), action);

export const registerPreflightCommand = (parent: Command): void => {
    parent.addCommand(createPreflightCommand());
};
