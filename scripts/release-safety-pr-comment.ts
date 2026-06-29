/**
 * Renders the release-safety PR preview comment (PROD-8359).
 *
 * Takes the computed release-safety data for a PR (diffed against the merge-base
 * with the target branch) and produces a sticky markdown comment that answers, in
 * plain language for the PR author, one question: can self-hosted customers
 * upgrade to this normally, or will it break their running app mid-upgrade? The
 * internal vocabulary (rollingUpdateSafe / RollingUpdate / Recreate / detectors /
 * expand-contract) stays out of the visible copy; the precise machine fields live
 * in the collapsed raw JSON.
 *
 * On a draft PR the code-aware review hasn't run, so an unverified DB change shows
 * "couldn't confirm" and invites marking the PR ready.
 *
 * Pure `renderPrComment` (unit-tested) + a thin IO `main` that reads the JSON and
 * prints the comment body.
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
    /**
     * True if the PR is a draft. The AI rolling-update review runs only on ready PRs,
     * so on a draft the comment invites the author to mark it ready to get the
     * AI-refined verdict.
     */
    draft?: boolean;
    /**
     * Raw verdict of the deterministic SQL linter (independent of the final
     * marker verdict). Lets the comment show the linter's finding even when the
     * AI later overrode it — e.g. "linter flagged a drop, AI cleared it via
     * expand/contract". Falls back to inferring from the marker notes.
     */
    linterBreaking?: boolean;
}

const LINTER_NOTE_PREFIX = 'Migration linter detected breaking';

/**
 * PURE. Render the sticky PR comment for a marker, in plain language aimed at the
 * PR author. It answers one question — "can self-hosted customers upgrade to this
 * normally, or will it break them mid-upgrade?" — and avoids the internal vocab
 * (marker / rollingUpdateSafe / RollingUpdate / Recreate / detectors / expand-
 * contract). The precise machine fields stay in the collapsed raw JSON.
 */
export function renderPrComment(marker: Marker, opts: RenderOpts = {}): string {
    const caps = new Set(marker.capabilities);
    const { rollingUpdateSafe } = marker.compatibility;
    const migrationsPresent = marker.migrations.present;
    const restBreaking = marker.api.rest.checked && marker.api.rest.breaking === true;
    const mcpBreaking = marker.api.mcp.checked && marker.api.mcp.breaking === true;
    // Did the deterministic linter flag a destructive migration shape? (Used only
    // to phrase the "stop using it first" advice; never shown as jargon.)
    const lintFlagged =
        opts.linterBreaking ??
        (caps.has('sql-lint') &&
            rollingUpdateSafe === false &&
            marker.compatibility.notes.startsWith(LINTER_NOTE_PREFIX));
    // A destructive migration that the code-aware review cleared because the old
    // version already stopped using the thing being removed.
    const clearedAsSafeDrop = lintFlagged && rollingUpdateSafe === true && caps.has('ai-review');
    // The risk comes from an API change (no DB migration) rather than the schema.
    const apiDriven = (restBreaking || mcpBreaking) && migrationsPresent !== true;

    // ---- the answer, in one line + a plain "why" ----------------------------
    const head: string[] = [];
    if (marker.upgrade.requiredStop) {
        head.push(
            `🛑 **Customers can’t skip this version.** Anyone upgrading from an older release has to land on this one first.` +
                (marker.upgrade.note ? ` ${marker.upgrade.note}` : ''),
        );
    }
    if (rollingUpdateSafe === false) {
        head.push("⚠️ **Needs care on upgrade.** A normal (zero-downtime) upgrade would briefly break customers' running app.");
        head.push(
            apiDriven
                ? 'This changes the API in a way the already-running version can’t handle. During an upgrade both the old and new versions are live for a moment, so requests would hit errors until it finishes.'
                : 'When customers upgrade, the old version keeps serving traffic until the new one is fully live. This changes the database in a way the old version can’t handle, so its app would start erroring during that window.',
        );
    } else if (rollingUpdateSafe === 'unknown') {
        head.push('❓ **Couldn’t confirm it’s safe.** Treat it as needing care on upgrade until checked.');
        head.push(
            opts.draft
                ? 'This changes the database. Mark the PR ready for review and an automated, code-aware check will look at whether the old version still uses what changed — it may clear it as safe.'
                : 'This changes the database and we couldn’t automatically confirm the old version keeps working through the upgrade.',
        );
    } else if (clearedAsSafeDrop) {
        head.push('✅ **Safe to upgrade normally.** No downtime needed.');
        head.push('This removes something from the database, but the app already stopped using it in an earlier release, so the old version keeps working fine through the upgrade.');
    } else if (migrationsPresent === true) {
        head.push('✅ **Safe to upgrade normally.** No downtime needed.');
        head.push('This changes the database, and the old version keeps working with those changes through the upgrade.');
    } else {
        head.push('✅ **Safe to upgrade normally.** No downtime needed.');
        head.push('No database changes in this release.');
    }
    // External API/MCP consumers are a separate audience from the in-flight app.
    if (restBreaking) head.push('⚠️ **Also:** this makes a breaking change to the REST API — anyone running their own scripts or integrations against it may need to update.');
    if (mcpBreaking) head.push('⚠️ **Also:** this makes a breaking change to the MCP tools — AI agents or clients using them may need to update.');

    // ---- what we looked at (plain, no internal tool names) ------------------
    const dbResult =
        migrationsPresent === true
            ? `${marker.migrations.count} migration${marker.migrations.count === 1 ? '' : 's'}${marker.migrations.ee ? ' (incl. enterprise)' : ''}`
            : migrationsPresent === false
            ? 'none'
            : 'couldn’t tell (no baseline to compare against)';
    const apiResult = (s: ApiSurface): string => {
        if (!s.checked) return 'not checked';
        return s.breaking === true
            ? `${s.changes.length} breaking change${s.changes.length === 1 ? '' : 's'}`
            : 'no breaking changes';
    };
    const notesResult = marker.upgrade.requiredStop
        ? 'can’t be skipped'
        : marker.upgrade.minPreviousVersion
        ? `safe from ${marker.upgrade.minPreviousVersion} onward`
        : 'none';
    const table = [
        '| What | Result |',
        '|---|---|',
        `| Database changes | ${dbResult} |`,
        `| REST API | ${apiResult(marker.api.rest)} |`,
        `| MCP tools | ${apiResult(marker.api.mcp)} |`,
        `| Upgrade notes | ${notesResult} |`,
    ].join('\n');

    // ---- what to do (only when there's something to do) ---------------------
    const advice: string[] = [];
    if (rollingUpdateSafe === false) {
        advice.push(
            '**Quickest:** customers should restart the app during the upgrade (a few seconds of downtime) instead of a zero-downtime rollout. Their upgrade automation does this for them once this ships.',
        );
        advice.push(
            apiDriven
                ? '**Better:** keep the old API response working alongside the new shape until customers have had a chance to upgrade.'
                : '**Better:** stop using it in the app *first*, in an earlier release, then make this change later. Once the old version no longer uses it, this exact change ships with no downtime.',
        );
    } else if (clearedAsSafeDrop) {
        const floor = marker.upgrade.minPreviousVersion;
        advice.push(
            `Safe **only when upgrading from ${floor ? `\`${floor}\`` : 'that release'} or later** — the release where the app stopped using it. Customers jumping up from an older version could still hit the old code path.`,
        );
        advice.push(
            `This is recorded automatically. If the app actually stopped using it in an earlier release, set a lower version in \`release-safety.overrides.json\`.`,
        );
    } else if (rollingUpdateSafe === 'unknown' && !opts.draft) {
        advice.push('Double-check the old version keeps working with this change. If unsure, customers should restart on upgrade to be safe.');
    } else if (marker.upgrade.requiredStop) {
        advice.push('Call this out in the release notes so customers know they can’t skip this version.');
    }

    // ---- assemble -----------------------------------------------------------
    const baseLine = opts.baseLabel ? `> Comparing against \`${opts.baseLabel}\`.\n` : '';
    const rawJson = JSON.stringify(marker, null, 2);

    return [
        COMMENT_MARKER,
        '## 🛡️ Upgrade safety for self-hosted customers',
        baseLine,
        head.map((l) => `- ${l}`).join('\n'),
        '',
        '**What we looked at**',
        '',
        table,
        ...(advice.length ? ['', '**What to do**', '', advice.map((a) => `- ${a}`).join('\n')] : []),
        '',
        '<details><summary>Technical details (raw JSON)</summary>\n',
        '```json',
        rawJson,
        '```',
        '</details>',
        '',
        '---',
        '<sub>Automated upgrade-safety check. Once merged, it ships a small `release-safety.json` with the release so customers’ upgrade automation can read it. It covers database and API changes; it doesn’t yet catch config/env-var or data-format changes.</sub>',
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
    const body = renderPrComment(marker, {
        baseLabel: arg('base'),
        draft: process.argv.includes('--draft'),
        linterBreaking: process.argv.includes('--linter-breaking')
            ? true
            : process.argv.includes('--no-linter-breaking')
            ? false
            : undefined,
    });
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
