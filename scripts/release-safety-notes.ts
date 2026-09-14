import * as fs from 'fs';
import type { ReleaseSafetyMarker } from './release-safety-contract';

function verdictLabel(marker: ReleaseSafetyMarker): string {
    const verdict = marker.compatibility.rollingUpdateSafe;
    if (verdict === true) return 'Rolling update safe';
    if (verdict === false) return 'Rolling update unsafe';
    return 'Safety unknown — treat as unsafe';
}

export function renderReleaseSafetyNotes(
    marker: ReleaseSafetyMarker,
): string {
    const lines = [
        '## Upgrade safety',
        '',
        `**${verdictLabel(marker)}.** Recommended strategy: **${marker.compatibility.recommendedStrategy}**.`,
        '',
        `Database migrations: ${marker.migrations.count} (${marker.migrations.coreCount} core, ${marker.migrations.eeCount} Enterprise).`,
    ];

    for (const migration of marker.migrations.files) {
        const tables = migration.tables.length
            ? migration.tables.join(', ')
            : 'tables unknown';
        lines.push(`- \`${migration.name}\` (${migration.edition}; ${tables})`);
    }

    if (marker.declaredBreaks.length > 0) {
        lines.push('', 'Declared breaking changes:');
        for (const declaredBreak of marker.declaredBreaks) {
            const migration = declaredBreak.migration
                ? ` (${declaredBreak.migration})`
                : '';
            lines.push(
                `- \`${declaredBreak.id}\`${migration}: ${declaredBreak.reason}${declaredBreak.requiredStop ? ' (required stop)' : ''}`,
            );
        }
    }

    const surfaceChanges = [
        ...marker.api.rest.changes.map((change) => `REST: ${change}`),
        ...marker.api.mcp.changes.map((change) => `MCP: ${change}`),
        ...marker.config.changes.map((change) => {
            if (change.type === 'removed') {
                return `Configuration: removed \`${change.name}\``;
            }
            if (change.type === 'renamed') {
                return `Configuration: renamed \`${change.previousName}\` to \`${change.name}\``;
            }
            return `Configuration: changed default for \`${change.name}\``;
        }),
    ];
    if (surfaceChanges.length > 0) {
        lines.push('', 'Compatibility changes:');
        for (const change of surfaceChanges) lines.push(`- ${change}`);
    }

    if (marker.upgrade.requiredStops.length > 0) {
        lines.push(
            '',
            `Required stops: ${marker.upgrade.requiredStops.map((version) => `\`${version}\``).join(', ')}.`,
        );
    }
    if (marker.upgrade.minPreviousVersion !== null) {
        lines.push(
            `Minimum previous version: \`${marker.upgrade.minPreviousVersion}\`.`,
        );
    }

    return `${lines.join('\n')}\n`;
}

function cliArg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

function main(): void {
    const markerPath = cliArg('marker');
    if (!markerPath) throw new Error('--marker is required');
    const marker = JSON.parse(
        fs.readFileSync(markerPath, 'utf-8'),
    ) as ReleaseSafetyMarker;
    process.stdout.write(renderReleaseSafetyNotes(marker));
}

const invokedDirectly =
    require.main === module ||
    process.argv[1]?.endsWith('release-safety-notes.ts') === true;
if (invokedDirectly) main();
