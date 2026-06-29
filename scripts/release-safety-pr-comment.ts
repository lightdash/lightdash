/**
 * Renders the release-safety PR preview comment (PROD-8359).
 *
 * Takes a release-safety marker (as the generator would emit for this PR, diffed
 * against the merge-base with the target branch) and produces a sticky markdown
 * comment so the PR author sees — BEFORE merge — the determination, the matrix of
 * which checks ran and what they found, and what would happen when the change is
 * deployed to self-hosted customers.
 *
 * The AI rolling-update review runs on READY PRs (not drafts): it validates
 * whatever the deterministic detectors flagged — migrations, and REST/MCP breaking
 * changes — and folds a verdict into the determination. On a draft the comment
 * invites marking it ready to get that verdict.
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
    // The linter's own finding, independent of the final verdict. Prefer the
    // explicit signal; otherwise infer it from the notes (only detectable while
    // the linter verdict still stands).
    const lintFlagged =
        opts.linterBreaking ??
        (caps.has('sql-lint') &&
            rollingUpdateSafe === false &&
            marker.compatibility.notes.startsWith(LINTER_NOTE_PREFIX));
    // The linter flagged a destructive shape but the AI cleared it (expand/contract).
    const aiClearedLinter = lintFlagged && rollingUpdateSafe === true && caps.has('ai-review');

    // Whether an unsafe/unknown verdict is driven by a schema migration or by a
    // flagged API break (no migration) — so the wording stays accurate either way.
    const apiDriven = (restBreaking || mcpBreaking) && migrationsPresent !== true;
    const breakKind = apiDriven ? 'an API' : 'a schema';

    // ---- determination ------------------------------------------------------
    const lines: string[] = [];
    if (marker.upgrade.requiredStop) {
        lines.push(
            `🛑 **Required stop** — operators must land on this version before upgrading further.` +
                (marker.upgrade.note ? ` ${marker.upgrade.note}` : ''),
        );
    }
    if (rollingUpdateSafe === false) {
        lines.push(
            apiDriven
                ? '⚠️ **Recreate required** — a breaking API change was flagged and the AI review found an in-flight consumer (e.g. the bundled frontend) would break during a rolling update.'
                : '⚠️ **Recreate required** — a breaking schema change was detected; the previous version would not survive a rolling update.',
        );
    } else if (rollingUpdateSafe === 'unknown') {
        lines.push(
            `❓ **Recreate recommended** — this change carries ${breakKind} change and backward-compatibility during a rolling update was not verified.`,
        );
    } else if (aiClearedLinter) {
        lines.push('✅ **Safe to RollingUpdate** — the SQL linter flagged a destructive shape, but the AI review verified the previous release no longer uses it (expand/contract).');
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
        ? aiClearedLinter
            ? '⚠️ flagged a destructive shape (AI cleared it — see below)'
            : '⚠️ breaking schema op(s) found'
        : '✅ no breaking shapes found';

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

    // The deterministic DETECTORS — the inputs the verdict is derived from. The AI
    // rolling-update review is deliberately NOT a row here: it is not a detector,
    // it's the synthesis step that reads these detectors' flagged output and
    // produces the determination above (rendered as the "verdict" line below).
    const matrix = [
        '| Detector | Status | Result |',
        '|---|---|---|',
        row('Migrations', migrationsPresent === 'unknown' ? '⚠️' : '✅ ran', migResult),
        row('SQL-shape linter', caps.has('sql-lint') ? '✅ ran' : '⏭️ n/a', sqlResult),
        row('REST API (oasdiff)', marker.api.rest.checked ? '✅ ran' : '⏭️ skipped', apiResult(marker.api.rest, 'oasdiff or base spec unavailable')),
        row('MCP tool surface', marker.api.mcp.checked ? '✅ ran' : '⏭️ skipped', apiResult(marker.api.mcp, 'no baseline snapshot')),
        row('Upgrade overrides', caps.has('upgrade') ? '✅ ran' : '⏭️ skipped', upgradeResult),
    ].join('\n');

    // How the verdict above was reached. The determination is the precedence
    // ladder's output, NOT the AI's alone: the deterministic detectors set a
    // baseline (a linter-flagged break is ❌ by default), and the AI review then
    // VALIDATES the flagged change(s) and can override it — it is the only path to
    // ✅ safe. So attribute the verdict to what the AI actually did (clear /
    // confirm / couldn't override), or to the deterministic baseline when it
    // didn't run. The AI is the judgement layer feeding the ladder, not a detector.
    const anythingFlagged = migrationsPresent === true || restBreaking || mcpBreaking;
    let verdictLine: string;
    if (caps.has('ai-review')) {
        const role = aiClearedLinter
            ? 'cleared a linter-flagged destructive shape as a safe expand/contract → ✅'
            : rollingUpdateSafe === true
            ? 'cleared them → ✅'
            : rollingUpdateSafe === false
            ? lintFlagged
                ? 'did not clear the SQL-linter floor, which stands → ❌'
                : 'confirmed a breaking change → ❌'
            : 'ran but could not conclude, so the deterministic baseline stands → ❓';
        verdictLine = `🧠 **Verdict** — the detectors below set a deterministic baseline; the AI rolling-update review then validated the flagged change(s) and ${role}. The AI is the only path to ✅ safe — it isn’t a detector.`;
    } else if (opts.draft) {
        verdictLine =
            '🧠 **Verdict** — the detectors below set the baseline; the AI rolling-update review (which validates the flagged change(s) and is the only path to ✅ safe) is skipped on drafts — mark this PR ready to run it.';
    } else if (anythingFlagged) {
        verdictLine =
            '🧠 **Verdict** — a detector flagged a change but the AI rolling-update review did not run or could not conclude, so the determination above is the deterministic baseline from the detectors below.';
    } else {
        verdictLine =
            '🧠 **Verdict** — no detector flagged a change, so the determination above is the deterministic baseline (safe) from the detectors below.';
    }

    // ---- customer-deploy consequence ----------------------------------------
    const consequence: string[] = [];
    consequence.push(
        'On a managed Helm upgrade the migration Job runs first (schema-before-code), then the app does a default **RollingUpdate** — so the *previous* version’s pods keep serving traffic against the already-migrated schema until the rollout finishes.',
    );
    if (rollingUpdateSafe === false && apiDriven) {
        consequence.push(
            '- ⚠️ A breaking API change means an already-loaded frontend (or other in-flight client) hitting a mix of old and new pods can error mid-rollout. Customers whose CI/CD reads the marker would be told **recommendedStrategy: Recreate** — a brief restart shrinks the window in which both versions serve at once.',
        );
    } else if (rollingUpdateSafe === false) {
        consequence.push(
            `- ⚠️ A breaking schema change means those old pods can crash (\`CrashLoopBackOff\`) mid-rollout. Customers whose CI/CD reads the marker would be told **recommendedStrategy: Recreate**${lintFlagged ? ' (flagged deterministically by the SQL linter)' : ''} — a brief restart instead of a crash loop.`,
        );
    } else if (rollingUpdateSafe === 'unknown') {
        const aiHint = opts.draft
            ? ' **Mark this PR ready for review** to run the AI rolling-update review (it doesn’t run on drafts) — it may refine this to ✅ safe.'
            : caps.has('ai-review')
            ? ''
            : ' The AI rolling-update review did not positively clear it.';
        consequence.push(
            `- ❓ Backward-compatibility was not verified, so customers reading the marker get **recommendedStrategy: Recreate** as the cautious default.${aiHint}`,
        );
    } else if (aiClearedLinter) {
        consequence.push('- ✅ The SQL linter flagged a destructive shape (e.g. a drop), but the AI review read the previous release’s code and confirmed it no longer references the object — the **contract** step of an expand/contract. A **RollingUpdate** is safe; old pods won’t touch what’s being removed.');
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

    // ---- what you should do -------------------------------------------------
    const advice: string[] = [];
    if (rollingUpdateSafe === false) {
        advice.push(
            '**If you must merge this change now:** operators upgrading via a default RollingUpdate would hit the impact above. The marker tells their CI/CD to use **Recreate** (a brief restart instead of a crash loop) — call this out in the release notes, and set a `requiredStop` in `release-safety.overrides.json` if older versions must not skip it.',
        );
        advice.push(
            '**Safer alternative — expand/contract (parallel change):** land the app change FIRST. Open a separate PR to `main` that makes the app stop using the affected object (the *expand*), let it release, then add this migration in a follow-up PR. This preview will then verify the previous release no longer uses it and clear the migration as safe.',
        );
    } else if (aiClearedLinter) {
        const floor = marker.upgrade.minPreviousVersion;
        advice.push(
            `This was cleared as the **contract** step of an expand/contract, verified against \`${marker.previousVersion ?? 'the previous release'}\`. It is safe **only when upgrading from ${floor ? `\`${floor}\`` : 'that release'} or later** — an operator skipping up from an older version that still used the object could still crash.`,
        );
        advice.push(
            `The marker auto-sets \`upgrade.minPreviousVersion\`${floor ? ` to \`${floor}\`` : ''} to protect them. If the app actually dropped usage in an **earlier** release, lower it (or set a \`requiredStop\`) in \`release-safety.overrides.json\` so operators aren't forced to stop unnecessarily.`,
        );
    } else if (marker.upgrade.requiredStop) {
        advice.push(
            `This release is a **required stop**${marker.upgrade.minPreviousVersion ? ` (min previous version \`${marker.upgrade.minPreviousVersion}\`)` : ''}. Make sure the release notes tell operators they cannot skip it.`,
        );
    }

    // ---- assemble -----------------------------------------------------------
    const baseLine = opts.baseLabel ? `\n> Compared against \`${opts.baseLabel}\`.\n` : '\n';
    const rawJson = JSON.stringify(marker, null, 2);

    return [
        COMMENT_MARKER,
        '## 🛡️ Release-safety preview',
        baseLine.trimEnd(),
        lines.map((l) => `- ${l}`).join('\n'),
        '',
        verdictLine,
        '',
        '### Detector checks',
        '_The deterministic detectors below set the baseline; the verdict above is the AI review’s judgement of the flagged change(s) on top of it._',
        matrix,
        '',
        '### What would happen on deploy to customers',
        consequence.join('\n'),
        ...(advice.length ? ['', '### What you should do', advice.map((a) => `- ${a}`).join('\n')] : []),
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
