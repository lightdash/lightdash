/**
 * Corpus benchmark: downloads real app bundles from a Lightdash instance,
 * runs the extractor, and reports resolution rates + top unresolved patterns.
 *
 * Usage:
 *   LIGHTDASH_URL=https://... LIGHTDASH_API_KEY=ldpat_... \
 *   LIGHTDASH_PROJECT_UUID=... pnpm tsx scripts/benchmarkDataAppReferences.ts \
 *     [--apps slug1,slug2] [--limit 50] [--verbose]
 */
import {
    extractDataAppDataReferences,
    type DataAppCodeDownload,
    type ExtractedDataReference,
} from '../src/ee';

type CliArgs = { apps: string[] | null; limit: number; verbose: boolean };

function parseArgs(argv: string[]): CliArgs {
    const args: CliArgs = { apps: null, limit: 50, verbose: false };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--apps' && argv[i + 1]) {
            args.apps = argv[i + 1].split(',').map((s) => s.trim());
            i += 1;
        } else if (argv[i] === '--limit' && argv[i + 1]) {
            args.limit = Number(argv[i + 1]);
            i += 1;
        } else if (argv[i] === '--verbose') {
            args.verbose = true;
        }
    }
    return args;
}

const referenceIdentity = (ref: ExtractedDataReference): string | null => {
    switch (ref.kind) {
        case 'query':
            return ref.explore;
        case 'savedChart':
            return ref.chartUuid;
        case 'externalFetch':
            return ref.alias;
        case 'globalFilter':
            return ref.field;
        default:
            return null;
    }
};

async function main() {
    const baseUrl = process.env.LIGHTDASH_URL ?? 'http://localhost:3000';
    const apiKey = process.env.LIGHTDASH_API_KEY;
    const projectUuid = process.env.LIGHTDASH_PROJECT_UUID;
    if (!apiKey || !projectUuid) {
        console.error(
            'Set LIGHTDASH_API_KEY and LIGHTDASH_PROJECT_UUID (and optionally LIGHTDASH_URL).',
        );
        process.exit(1);
    }
    const { apps: appFilter, limit, verbose } = parseArgs(process.argv.slice(2));

    const get = async <T>(path: string): Promise<T> => {
        const res = await fetch(`${baseUrl}${path}`, {
            headers: { Authorization: `ApiKey ${apiKey}` },
        });
        if (!res.ok) {
            throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
        }
        const body = (await res.json()) as { results: T };
        return body.results;
    };

    const appsBase = `/api/v1/ee/projects/${projectUuid}/apps`;
    const allApps = await get<{ appUuid: string; name: string; slug: string }[]>(
        appsBase,
    );
    const apps = allApps
        .filter((a) => !appFilter || appFilter.includes(a.slug))
        .slice(0, limit);
    console.log(
        `Benchmarking ${apps.length} of ${allApps.length} apps in project ${projectUuid}\n`,
    );

    const totals = {
        apps: 0,
        appsFailed: 0,
        callSites: 0,
        fullyResolved: 0,
        partiallyResolved: 0,
        unresolved: 0,
        parseErrors: 0,
    };
    const unresolvedExamples = new Map<string, string[]>(); // `<kind>:<part>` -> locations

    for (const appMeta of apps) {
        let app: DataAppCodeDownload;
        try {
            app = await get<DataAppCodeDownload>(
                `${appsBase}/${appMeta.slug}/download`,
            );
        } catch (err) {
            totals.appsFailed += 1;
            console.error(
                `SKIP ${appMeta.slug}: ${err instanceof Error ? err.message.slice(0, 200) : err}`,
            );
            continue;
        }
        totals.apps += 1;
        const files = app.files.map((f) => ({
            path: f.path,
            content: Buffer.from(f.contentBase64, 'base64').toString('utf-8'),
        }));
        const result = extractDataAppDataReferences(files);
        totals.callSites += result.stats.callSites;
        totals.fullyResolved += result.stats.fullyResolved;
        totals.partiallyResolved += result.stats.partiallyResolved;
        totals.unresolved += result.stats.unresolved;
        totals.parseErrors += result.parseErrors.length;

        for (const ref of result.references) {
            for (const part of ref.unresolved) {
                const key = `${ref.kind}:${part}`;
                const examples = unresolvedExamples.get(key) ?? [];
                if (examples.length < 8) {
                    examples.push(
                        `${appMeta.slug}/${ref.location.path}:${ref.location.line}`,
                    );
                }
                unresolvedExamples.set(key, examples);
            }
        }

        const s = result.stats;
        const pct =
            s.callSites === 0
                ? '—'
                : `${Math.round((s.fullyResolved / s.callSites) * 100)}%`;
        console.log(
            `${appMeta.slug}: ${s.callSites} call sites, ${pct} fully resolved` +
                `${s.partiallyResolved ? `, ${s.partiallyResolved} partial` : ''}` +
                `${s.unresolved ? `, ${s.unresolved} unresolved` : ''}` +
                `${result.parseErrors.length ? `, ${result.parseErrors.length} parse errors` : ''}`,
        );
        if (verbose) {
            for (const ref of result.references.filter(
                (r) => r.unresolved.length > 0,
            )) {
                console.log(
                    `    ${ref.location.path}:${ref.location.line} ${ref.kind}(${referenceIdentity(ref) ?? '?'}) unresolved: ${ref.unresolved.join(',')}`,
                );
            }
            for (const err of result.parseErrors) {
                console.log(`    PARSE ${err.path}: ${err.message.slice(0, 120)}`);
            }
        }
    }

    console.log('\n=== Corpus summary ===');
    console.log(`apps analyzed: ${totals.apps} (${totals.appsFailed} failed to download)`);
    console.log(`call sites: ${totals.callSites}`);
    if (totals.callSites > 0) {
        const pct = (n: number) => `${((n / totals.callSites) * 100).toFixed(1)}%`;
        console.log(`  fully resolved: ${totals.fullyResolved} (${pct(totals.fullyResolved)})`);
        console.log(`  partially resolved: ${totals.partiallyResolved} (${pct(totals.partiallyResolved)})`);
        console.log(`  unresolved: ${totals.unresolved} (${pct(totals.unresolved)})`);
    }
    console.log(`parse errors: ${totals.parseErrors}`);
    if (unresolvedExamples.size > 0) {
        console.log('\nTop unresolved patterns:');
        const sorted = [...unresolvedExamples.entries()].sort(
            (a, b) => b[1].length - a[1].length,
        );
        for (const [key, examples] of sorted) {
            console.log(`  ${key} — e.g. ${examples.slice(0, 3).join(', ')}`);
        }
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
