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
 * CLI:  pnpm exec tsx scripts/release-safety-pr-comment.ts --marker /tmp/rs.json [--base main]
 *         [--rest-status ran|skipped|failed] [--out /tmp/body.md]
 */
import * as fs from 'fs';
import type {
    ApiSurface,
    ReleaseSafetyMarker,
} from './release-safety-contract';

/** Hidden anchor used to find-and-update the single sticky comment. */
export const COMMENT_MARKER = '<!-- release-safety-marker -->';

export type Marker = ReleaseSafetyMarker;

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
     * expand/contract".
     */
    linterBreaking?: boolean;
    /**
     * Why the REST result looks the way it does. A REST check that didn't run
     * reads as routine unless the comment says whether it was deliberately
     * skipped (nothing on the API surface changed) or failed to produce the
     * OpenAPI specs it needed — the second is a broken check, not a clean bill.
     */
    restStatus?: 'ran' | 'skipped' | 'failed';
    declarationGateFailed?: boolean;
    /**
     * The revision this verdict describes. Stamped into the comment so a later
     * `edited` event can tell whether the verdict on the page still applies, and
     * skip recomputing it if so.
     */
    headSha?: string;
    baseSha?: string;
    runId?: string;
    /**
     * Whether the release-safety gates failed for this revision. The stamp
     * carries it because the check is required: a skipped job reports SKIPPED,
     * which satisfies a required check, so short-circuiting a failed verdict
     * would turn a red gate green. Only a passing verdict may be reused.
     */
    gateFailed?: boolean;
}

const SAFE_HEADLINE = '✅ **Safe to upgrade normally.** No downtime needed.';

function escapeMarkdownTableCell(value: string): string {
    return value
        .replace(/\r/g, '')
        .replace(/\n/g, '<br/>')
        .replace(/\|/g, '\\|');
}

function renderDeclaredBreaksCell(marker: Marker): string {
    if (marker.declaredBreaks.length === 0) return 'none';

    const rendered = marker.declaredBreaks.map((declaredBreak, index) => {
        const reason = escapeMarkdownTableCell(declaredBreak.reason);
        const suffix = declaredBreak.requiredStop ? ' (required stop)' : '';
        return `${index + 1}) ${reason}${suffix}`;
    });

    return `${rendered.length} declared breaking change${rendered.length === 1 ? '' : 's'}: ${rendered.join('; ')}`;
}

function renderDeclaredBreakReasons(marker: Marker): string {
    return marker.declaredBreaks
        .map((declaredBreak, index) => {
            const required = declaredBreak.requiredStop ? ' (required stop)' : '';
            return `${index + 1}) ${escapeMarkdownTableCell(declaredBreak.reason)}${required}`;
        })
        .join('; ');
}

/**
 * PURE. Render the sticky PR comment for a marker, in plain language aimed at the
 * PR author. It answers one question — "can self-hosted customers upgrade to this
 * normally, or will it break them mid-upgrade?" — and avoids the internal vocab
 * (marker / rollingUpdateSafe / RollingUpdate / Recreate / detectors / expand-
 * contract). The precise machine fields stay in the collapsed raw JSON.
 */
export function renderPrComment(marker: Marker, opts: RenderOpts = {}): string {
    const { rollingUpdateSafe } = marker.compatibility;
    const migrationsPresent = marker.migrations.present;
    const restBreaking = marker.api.rest.checked && marker.api.rest.breaking === true;
    const mcpBreaking = marker.api.mcp.checked && marker.api.mcp.breaking === true;
    // Did the deterministic linter flag a destructive migration shape? (Used only
    // to phrase the "stop using it first" advice; never shown as jargon.)
    const lintFlagged = opts.linterBreaking ?? false;
    // A destructive migration that the code-aware review cleared because the old
    // version already stopped using the thing being removed.
    const clearedAsSafeDrop = lintFlagged && rollingUpdateSafe === true;
    // The risk comes from an API change (no DB migration) rather than the schema.
    const apiDriven = (restBreaking || mcpBreaking) && migrationsPresent !== true;
    const declarationDriven =
        migrationsPresent !== true &&
        !apiDriven &&
        marker.declaredBreaks.length > 0;
    // Any failed gate needs remediation text, or the downgraded headline below
    // names a problem the comment never explains.
    const needsUnblock =
        rollingUpdateSafe !== true ||
        opts.declarationGateFailed === true ||
        opts.gateFailed === true;

    // ---- the answer, in one line + a plain "why" ----------------------------
    const head: string[] = [];
    const requiredStop = marker.upgrade.requiredStops.includes(marker.version);
    if (requiredStop) {
        head.push(
            `🛑 **Customers can’t skip this version.** Anyone upgrading from an older release has to land on this one first.`,
        );
    }
    if (rollingUpdateSafe === false) {
        head.push("⚠️ **Needs care on upgrade.** A normal (zero-downtime) upgrade would briefly break customers' running app.");
        if (declarationDriven) {
            const reasons = renderDeclaredBreakReasons(marker);
            head.push(`This was declared as a breaking change: ${reasons}`);
        } else {
            head.push(
                apiDriven
                    ? 'This changes the API in a way the already-running version can’t handle. During an upgrade both the old and new versions are live for a moment, so requests would hit errors until it finishes.'
                    : 'When customers upgrade, the old version keeps serving traffic until the new one is fully live. This changes the database in a way the old version can’t handle, so its app would start erroring during that window.',
            );
        }
    } else if (rollingUpdateSafe === 'unknown') {
        head.push('❓ **Couldn’t confirm it’s safe.** Treat it as needing care on upgrade until checked.');
        // Name what actually drove the verdict. An API break with no migration
        // lands here, and so does a PR that changes neither — a check that
        // couldn't run leaves the verdict unknown on its own. Telling that second
        // author "this changes the database" sends them looking for a migration
        // that isn't there, and the code-aware review they're pointed at only
        // runs on a migration or an API break, so it would never clear them.
        if (apiDriven || migrationsPresent === true) {
            const subject = apiDriven ? 'This changes the API' : 'This changes the database';
            head.push(
                opts.draft
                    ? `${subject}. Mark the PR ready for review and an automated, code-aware check will look at whether the old version still uses what changed — it may clear it as safe.`
                    : `${subject} and we couldn’t automatically confirm the old version keeps working through the upgrade.`,
            );
        } else {
            head.push(
                migrationsPresent === false
                    ? 'No database changes here. One of the checks below didn’t complete, so we can’t confirm this either way — the table says which one.'
                    : 'We couldn’t tell what this release changes, because one of the checks below didn’t complete — the table says which one.',
            );
        }
    } else if (clearedAsSafeDrop) {
        head.push(SAFE_HEADLINE);
        head.push('This removes something from the database, but the app already stopped using it in an earlier release, so the old version keeps working fine through the upgrade.');
    } else if (migrationsPresent === true) {
        head.push(SAFE_HEADLINE);
        head.push('This changes the database, and the old version keeps working with those changes through the upgrade.');
    } else {
        head.push(SAFE_HEADLINE);
        head.push('No database changes in this release.');
    }
    // External API/MCP consumers are a separate audience from the in-flight app.
    if (restBreaking) head.push('⚠️ **Also:** this makes a breaking change to the REST API — anyone running their own scripts or integrations against it may need to update.');
    if (mcpBreaking) head.push('⚠️ **Also:** this makes a breaking change to the MCP tools — AI agents or clients using them may need to update.');

    // A REST check that was meant to run and didn't leaves a hole the verdict can't
    // see past: on a PR with no migrations the marker reads "safe" purely because
    // nothing came back. Say so instead of letting the ✅ stand for a check that
    // never happened. (A deliberately skipped check is different — nothing on the
    // API surface changed, so the verdict really does cover this PR.)
    if (opts.restStatus === 'failed' && !marker.api.rest.checked) {
        const safe = head.indexOf(SAFE_HEADLINE);
        if (safe >= 0) {
            head[safe] = '❓ **Couldn’t confirm it’s safe.** Part of the check didn’t run.';
        }
        head.push('⚠️ **The REST API check didn’t run** — its OpenAPI specs couldn’t be generated, so a change that breaks scripts or integrations wouldn’t have been spotted here.');
    }

    // A failed gate is not a verdict about the upgrade: the declaration gate can
    // fail while the marker is green, and that separation is deliberate. The
    // headline is still the line people read, and "Safe to upgrade normally" above
    // a red required check reads as a contradiction — the author trusts one of the
    // two and ignores the other. Keep both facts, and lead with the blocking one.
    if (opts.gateFailed === true || opts.declarationGateFailed === true) {
        const safe = head.indexOf(SAFE_HEADLINE);
        if (safe >= 0) {
            head[safe] = '⚠️ **A required check failed.** The upgrade itself looks safe — this is about the check, not the release.';
        }
    }

    // ---- what we looked at (plain, no internal tool names) ------------------
    const dbResult =
        migrationsPresent === true
            ? `${marker.migrations.count} migration${marker.migrations.count === 1 ? '' : 's'}${marker.migrations.eeCount > 0 ? ' (incl. enterprise)' : ''}`
            : migrationsPresent === false
            ? 'none'
            : 'couldn’t tell (no baseline to compare against)';
    const apiResult = (s: ApiSurface, uncheckedReason?: string): string => {
        if (!s.checked) return uncheckedReason ? `not checked — ${uncheckedReason}` : 'not checked';
        return s.breaking === true
            ? `${s.changes.length} breaking change${s.changes.length === 1 ? '' : 's'}`
            : 'no breaking changes';
    };
    const restUncheckedReason =
        opts.restStatus === 'skipped'
            ? 'nothing on the API surface changed'
            : opts.restStatus === 'failed'
            ? 'the OpenAPI specs could not be generated'
            : undefined;
    const notesResult = requiredStop
        ? 'can’t be skipped'
        : marker.upgrade.minPreviousVersion
        ? `safe from ${marker.upgrade.minPreviousVersion} onward`
        : 'none';
    const configResult = !marker.config.checked
        ? 'not checked'
        : marker.config.breaking === true
          ? `${marker.config.changes.length} breaking change${marker.config.changes.length === 1 ? '' : 's'}`
          : 'no breaking changes';
    const table = [
        '| What | Result |',
        '|---|---|',
        `| Database changes | ${dbResult} |`,
        `| REST API | ${apiResult(marker.api.rest, restUncheckedReason)} |`,
        `| MCP tools | ${apiResult(marker.api.mcp)} |`,
        `| Config / environment | ${configResult} |`,
        `| Declared breaking changes | ${renderDeclaredBreaksCell(marker)} |`,
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
    } else if (requiredStop) {
        advice.push('Call this out in the release notes so customers know they can’t skip this version.');
    }
    const unblock = needsUnblock
        ? [
              '**How to unblock this pull request**',
              '',
              'This required check must pass before merge. For a migration break, follow `packages/backend/src/database/migrations/CLAUDE.md`; for an API or type break, add the verified declaration described in [the release-safety guidance](https://github.com/lightdash/lightdash/blob/main/CLAUDE.md#release-safety-declarations).',
              '',
              'Never declare a break merely to make CI pass. Declaring a break advises every self-hosted customer to use the Recreate strategy.',
              '',
              'A release that ships as `breaking` or `unknown` stops the internal analytics instance upgrading. Every later release inherits the block until someone moves the pin past it by hand.',
          ]
        : [];

    // ---- assemble -----------------------------------------------------------
    const baseLine = opts.baseLabel ? `> Comparing against \`${opts.baseLabel}\`.\n` : '';
    const rawJson = JSON.stringify(marker, null, 2);
    const describes =
        opts.headSha && opts.baseSha && opts.runId
            ? [
                  `<!-- release-safety-describes head:${opts.headSha} base:${opts.baseSha} gate:${
                      opts.gateFailed ? 'fail' : 'pass'
                  } run:${opts.runId} -->`,
              ]
            : [];

    return [
        COMMENT_MARKER,
        ...describes,
        '## 🛡️ Upgrade safety for self-hosted customers',
        baseLine,
        head.map((l) => `- ${l}`).join('\n'),
        '',
        '**What we looked at**',
        '',
        table,
        ...(advice.length ? ['', '**What to do**', '', advice.map((a) => `- ${a}`).join('\n')] : []),
        ...(unblock.length ? ['', ...unblock] : []),
        '',
        '<details><summary>Technical details (raw JSON)</summary>\n',
        '```json',
        rawJson,
        '```',
        '</details>',
        '',
        '---',
        '<sub>Automated upgrade-safety check. Once merged, it ships a small `release-safety.json` with the release so customers’ upgrade automation can read it. It covers database, API, and config/environment changes.</sub>',
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
    const restStatus = arg('rest-status');
    if (restStatus && !['ran', 'skipped', 'failed'].includes(restStatus)) {
        throw new Error(`--rest-status must be one of ran|skipped|failed (got "${restStatus}")`);
    }
    const body = renderPrComment(marker, {
        baseLabel: arg('base'),
        restStatus: restStatus as RenderOpts['restStatus'],
        declarationGateFailed: process.argv.includes('--declaration-gate-failed'),
        headSha: arg('head-sha'),
        baseSha: arg('base-sha'),
        runId: arg('run-id'),
        gateFailed: process.argv.includes('--gate-failed'),
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
