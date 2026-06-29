/**
 * Renders the release-safety PR preview comment (PROD-8359).
 *
 * Takes a release-safety marker (as the generator would emit for this PR, diffed
 * against the merge-base with the target branch) and produces a sticky markdown
 * comment so the PR author sees — BEFORE merge — the determination, the matrix of
 * which checks ran and what they found, and what would happen when the change is
 * deployed to self-hosted customers.
 *
 * The AI review does not run on PRs (it's release-time only), so a migration PR
 * typically shows "unknown / Recreate" here unless the deterministic SQL linter
 * positively finds a break — the comment says so.
 *
 * Pure `renderPrComment` (unit-tested) + a thin IO `main` that reads the marker
 * JSON and prints the comment body.
 *
 * CLI:  npx tsx scripts/release-safety-pr-comment.ts --marker /tmp/rs.json [--base main] [--out /tmp/body.md]
 */
import * as fs from 'fs';

/** Hidden anchor used to find-and-update the single sticky comment. */
export const COMMENT_MARKER = '<!-- release-safety-marker -->';

type TriState = boolean | 'unknown';

interface ApiSurface {
    checked: boolean;
    breaking: TriState;
    changes: string[];
}

export interface Marker {
    version: string;
    previousVersion: string | null;
    capabilities: string[];
    migrations: { present: TriState; count: number; files: string[]; ee: boolean };
    compatibility: {
        rollingUpdateSafe: TriState;
        recommendedStrategy: string;
        notes: string;
    };
    api: { rest: ApiSurface; mcp: ApiSurface };
    upgrade: { minPreviousVersion: string | null; requiredStop: boolean; note: string | null };
}

export interface RenderOpts {
    /** Human label for the comparison base, e.g. "main (a1b2c3d)". */
    baseLabel?: string;
}

const LINTER_NOTE_PREFIX = 'Migration linter detected breaking';

function row(check: string, ran: string, result: string): string {
    return `| ${check} | ${ran} | ${result} |`;
}

/** PURE. Render the full sticky comment body for a marker. */
export function renderPrComment(marker: Marker, opts: RenderOpts = {}): string {
    const caps = new Set(marker.capabilities);
    const { rollingUpdateSafe } = marker.compatibility;
    const migrationsPresent = marker.migrations.present;
    const restBreaking = marker.api.rest.checked && marker.api.rest.breaking === true;
    const mcpBreaking = marker.api.mcp.checked && marker.api.mcp.breaking === true;
    const lintFlagged =
        caps.has('sql-lint') &&
        rollingUpdateSafe === false &&
        marker.compatibility.notes.startsWith(LINTER_NOTE_PREFIX);

    // ---- determination ------------------------------------------------------
    const lines: string[] = [];
    if (marker.upgrade.requiredStop) {
        lines.push(
            `🛑 **Required stop** — operators must land on this version before upgrading further.` +
                (marker.upgrade.note ? ` ${marker.upgrade.note}` : ''),
        );
    }
    if (rollingUpdateSafe === false) {
        lines.push('⚠️ **Recreate required** — a breaking schema change was detected; the previous version would not survive a rolling update.');
    } else if (rollingUpdateSafe === 'unknown') {
        lines.push('❓ **Recreate recommended** — this change touches the schema and backward-compatibility was not verified.');
    } else if (migrationsPresent === true) {
        lines.push('✅ **Safe to RollingUpdate** — migrations were verified backward-compatible.');
    } else {
        lines.push('✅ **No database migrations** — safe to RollingUpdate (per the checks below).');
    }
    if (restBreaking) lines.push('⚠️ **REST API breaking change** — external API consumers may break across this upgrade.');
    if (mcpBreaking) lines.push('⚠️ **MCP tool breaking change** — MCP clients/agents may break across this upgrade.');

    // ---- check matrix -------------------------------------------------------
    const migResult =
        migrationsPresent === true
            ? `${marker.migrations.count} added${marker.migrations.ee ? ' (incl. EE)' : ''}`
            : migrationsPresent === false
            ? 'none'
            : 'could not determine (no baseline)';

    const sqlResult = !caps.has('sql-lint')
        ? '—'
        : lintFlagged
        ? '⚠️ breaking schema op(s) found'
        : '✅ no breaking shapes found';

    const aiResult = caps.has('ai-review')
        ? 'ran'
        : '⏭️ release-time only (not run on PRs)';

    const apiResult = (s: ApiSurface, missingNote: string): string => {
        if (!s.checked) return `⏭️ not checked (${missingNote})`;
        return s.breaking === true ? `⚠️ ${s.changes.length} breaking change(s)` : '✅ no breaking changes';
    };

    const upgradeResult = !caps.has('upgrade')
        ? '⏭️ not consulted'
        : marker.upgrade.requiredStop
        ? '🛑 required stop'
        : marker.upgrade.minPreviousVersion
        ? `min previous: ${marker.upgrade.minPreviousVersion}`
        : '✅ no required stop';

    const matrix = [
        '| Check | Status | Result |',
        '|---|---|---|',
        row('Migrations', migrationsPresent === 'unknown' ? '⚠️' : '✅ ran', migResult),
        row('SQL-shape linter', caps.has('sql-lint') ? '✅ ran' : '⏭️ n/a', sqlResult),
        row('AI migration review', caps.has('ai-review') ? '✅ ran' : '⏭️ skipped', aiResult),
        row('REST API (oasdiff)', marker.api.rest.checked ? '✅ ran' : '⏭️ skipped', apiResult(marker.api.rest, 'oasdiff or base spec unavailable')),
        row('MCP tool surface', marker.api.mcp.checked ? '✅ ran' : '⏭️ skipped', apiResult(marker.api.mcp, 'no baseline snapshot')),
        row('Upgrade overrides', caps.has('upgrade') ? '✅ ran' : '⏭️ skipped', upgradeResult),
    ].join('\n');

    // ---- customer-deploy consequence ----------------------------------------
    const consequence: string[] = [];
    consequence.push(
        'On a managed Helm upgrade the migration Job runs first (schema-before-code), then the app does a default **RollingUpdate** — so the *previous* version’s pods keep serving traffic against the already-migrated schema until the rollout finishes.',
    );
    if (rollingUpdateSafe === false) {
        consequence.push(
            `- ⚠️ A breaking schema change means those old pods can crash (\`CrashLoopBackOff\`) mid-rollout. Customers whose CI/CD reads the marker would be told **recommendedStrategy: Recreate**${lintFlagged ? ' (flagged deterministically by the SQL linter)' : ''} — a brief restart instead of a crash loop.`,
        );
    } else if (rollingUpdateSafe === 'unknown') {
        consequence.push(
            '- ❓ Backward-compatibility was not verified, so customers reading the marker get **recommendedStrategy: Recreate** as the cautious default. The release-time **AI review may refine this to ✅ safe** — it does not run on PRs.',
        );
    } else if (migrationsPresent === true) {
        consequence.push('- ✅ Migrations were verified additive/backward-compatible, so a **RollingUpdate** is safe — no special handling for customers.');
    } else {
        consequence.push('- ✅ No schema change, so a **RollingUpdate** is safe.');
    }
    if (marker.upgrade.requiredStop) {
        consequence.push('- 🛑 Customers upgrading from an older version and **skipping this one** would hit failures — the marker flags it as a required stop.');
    }
    if (restBreaking) consequence.push('- ⚠️ External REST API consumers may break across this upgrade (see `api.rest`).');
    if (mcpBreaking) consequence.push('- ⚠️ MCP clients/agents may break across this upgrade (see `api.mcp`).');

    // ---- assemble -----------------------------------------------------------
    const baseLine = opts.baseLabel ? `\n> Compared against \`${opts.baseLabel}\`.\n` : '\n';
    const rawJson = JSON.stringify(marker, null, 2);

    return [
        COMMENT_MARKER,
        '## 🛡️ Release-safety preview',
        baseLine.trimEnd(),
        lines.map((l) => `- ${l}`).join('\n'),
        '',
        '### Check matrix',
        matrix,
        '',
        '### What would happen on deploy to customers',
        consequence.join('\n'),
        '',
        '<details><summary>Raw marker JSON</summary>\n',
        '```json',
        rawJson,
        '```',
        '</details>',
        '',
        '---',
        'ℹ️ The published release asset is currently **disabled** (dark-launch: `RELEASE_SAFETY_MARKER_ENABLED=false`), so this preview is informational and does not affect releases yet.',
        '_Blind spot: only the checks above are covered — code-only/config-only breaking changes (env defaults, removed Helm values, serialization changes) are not detected._',
        '',
    ].join('\n');
}

// ---- IO ---------------------------------------------------------------------

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
    const markerPath = arg('marker');
    if (!markerPath) throw new Error('--marker <path> is required');
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8')) as Marker;
    const body = renderPrComment(marker, { baseLabel: arg('base') });
    const out = arg('out');
    if (out) {
        fs.writeFileSync(out, body);
        console.log(`[release-safety-pr-comment] wrote ${out}`);
    } else {
        process.stdout.write(body);
    }
}

const invokedDirectly =
    require.main === module || process.argv[1]?.endsWith('release-safety-pr-comment.ts') === true;
if (invokedDirectly) {
    try {
        main();
    } catch (err) {
        console.error(`[release-safety-pr-comment] FAILED: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
}
