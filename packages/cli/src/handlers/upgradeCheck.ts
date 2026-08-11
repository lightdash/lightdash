import type { Command } from 'commander';
import fetch from 'node-fetch';
import {
    compareVersions,
    composeReleaseSafetySpan,
    isReleaseVersion,
    parseReleaseSafetyIndex,
    type ReleaseSafetyIndex,
    type ReleaseSafetyMissingRange,
    type TriState,
} from '../releaseSafety';

export const RELEASE_SAFETY_INDEX_URL =
    'https://raw.githubusercontent.com/lightdash/lightdash/main/release-safety-index.json';

export interface UpgradeCheckOptions {
    from: string;
    to: string;
    json?: boolean;
}

export type UpgradeCheckDirection = 'upgrade' | 'same-version';

export interface UpgradeCheckOutput {
    fromVersion: string;
    toVersion: string;
    direction: UpgradeCheckDirection;
    safe: boolean;
    verdict: TriState;
    requiredStops: string[];
    minPreviousVersion: string | null;
    coveredVersions: string[];
    missingRanges: ReleaseSafetyMissingRange[];
}

export interface UpgradeCheckDependencies {
    fetch: typeof fetch;
    writeOutput: (output: string) => void;
    exit: (code: number) => never;
}

const defaultDependencies: UpgradeCheckDependencies = {
    fetch,
    writeOutput: (output) => console.log(output),
    exit: (code) => process.exit(code),
};

function getDirection(
    fromVersion: string,
    toVersion: string,
): UpgradeCheckDirection {
    const comparison = compareVersions(fromVersion, toVersion);
    if (comparison < 0) {
        return 'upgrade';
    }
    if (comparison > 0) {
        throw new Error(
            'Rollback spans are not supported by this command; rollback guidance ships in the upgrade runbook.',
        );
    }
    return 'same-version';
}

function validateEndpoint(name: 'from' | 'to', version: string): void {
    if (!isReleaseVersion(version)) {
        throw new Error(
            `--${name} must be a release version in X.Y.Z format, received ${version}`,
        );
    }
}

function formatMissingRange(range: ReleaseSafetyMissingRange): string {
    if (range.afterVersion === range.beforeVersion) {
        return `version ${range.afterVersion} is not present in the release-safety index`;
    }
    return `after ${range.afterVersion} and before ${range.beforeVersion}`;
}

function findReleaseStates(
    index: ReleaseSafetyIndex,
    output: UpgradeCheckOutput,
): { falseVersions: string[]; unknownVersions: string[] } {
    const coveredVersions = new Set(output.coveredVersions);
    return index.entries.reduce<{
        falseVersions: string[];
        unknownVersions: string[];
    }>(
        (states, entry) => {
            if (!coveredVersions.has(entry.version)) {
                return states;
            }
            if (entry.rollingUpdateSafe === false) {
                states.falseVersions.push(entry.version);
            } else if (entry.rollingUpdateSafe === 'unknown') {
                states.unknownVersions.push(entry.version);
            }
            return states;
        },
        { falseVersions: [], unknownVersions: [] },
    );
}

export function renderUpgradeCheckOutput(
    output: UpgradeCheckOutput,
    index: ReleaseSafetyIndex,
): string {
    const lines = [
        `Release safety check: ${output.fromVersion} -> ${output.toVersion}`,
        `Direction: ${output.direction}`,
        `Verdict: ${output.safe ? 'SAFE' : 'UNSAFE'}`,
    ];
    const { falseVersions, unknownVersions } = findReleaseStates(index, output);

    if (falseVersions.length > 0) {
        lines.push(`Unsafe rolling-update safety: ${falseVersions.join(', ')}`);
    }
    if (unknownVersions.length > 0) {
        lines.push(
            `Unknown rolling-update safety: ${unknownVersions.join(', ')}`,
        );
    }
    if (output.requiredStops.length > 0) {
        lines.push(`Required stops: ${output.requiredStops.join(', ')}`);
    }
    if (output.minPreviousVersion !== null) {
        lines.push(`Minimum previous version: ${output.minPreviousVersion}`);
    }
    if (output.missingRanges.length > 0) {
        lines.push('Missing release-safety index coverage:');
        lines.push(
            ...output.missingRanges.map(
                (range) => `  - ${formatMissingRange(range)}`,
            ),
        );
    }
    if (output.coveredVersions.length > 0) {
        lines.push(`Covered releases: ${output.coveredVersions.join(', ')}`);
    }
    return lines.join('\n');
}

export async function upgradeCheckHandler(
    options: UpgradeCheckOptions,
    dependencies: Partial<UpgradeCheckDependencies> = {},
): Promise<UpgradeCheckOutput> {
    const resolvedDependencies = { ...defaultDependencies, ...dependencies };
    validateEndpoint('from', options.from);
    validateEndpoint('to', options.to);
    const direction = getDirection(options.from, options.to);

    const response = await resolvedDependencies.fetch(RELEASE_SAFETY_INDEX_URL);
    if (!response.ok) {
        throw new Error(
            `Unable to fetch the release-safety index: ${response.status} ${response.statusText}`,
        );
    }

    const index = parseReleaseSafetyIndex(await response.json());
    const composition = composeReleaseSafetySpan(
        index,
        options.from,
        options.to,
    );
    const output: UpgradeCheckOutput = {
        fromVersion: options.from,
        toVersion: options.to,
        direction,
        safe: composition.safe,
        verdict: composition.verdict,
        requiredStops: composition.requiredStops,
        minPreviousVersion: composition.minPreviousVersion,
        coveredVersions: composition.coveredVersions,
        missingRanges: composition.missingRanges,
    };

    resolvedDependencies.writeOutput(
        options.json
            ? JSON.stringify(output)
            : renderUpgradeCheckOutput(output, index),
    );
    if (!output.safe) {
        resolvedDependencies.exit(1);
    }
    return output;
}

export function registerUpgradeCheckCommand(
    command: Command,
    dependencies: Partial<UpgradeCheckDependencies> = {},
): Command {
    return command
        .command('upgrade-check')
        .description(
            'Check release safety for an upgrade using the public release index',
        )
        .requiredOption('--from <version>', 'Current Lightdash version')
        .requiredOption('--to <version>', 'Target Lightdash version')
        .option('--json', 'Print machine-readable JSON', false)
        .action(async (options: UpgradeCheckOptions) => {
            await upgradeCheckHandler(options, dependencies);
        });
}
