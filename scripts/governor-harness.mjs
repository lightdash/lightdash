#!/usr/bin/env node
/**
 * Concurrency-governor harness for the coding agent (slice 10).
 *
 * The governor lives in-memory on the AiWritebackService singleton, so this
 * drives the ONE running backend with concurrent HTTP turns the UI can't
 * produce (the composer disables Send during a run).
 *
 *   D1 — per-workstream lock: two concurrent turns continuing the SAME PR.
 *        editRepo holds the lock through clone+edit+push, so the 2nd turn's
 *        editRepo is rejected: "An edit is already in progress for this pull
 *        request in this conversation."
 *
 *   D2 — per-thread cap (3): four concurrent turns each continuing a DISTINCT
 *        PR (distinct lock keys, so the per-workstream lock doesn't mask it).
 *        The 4th in-flight turn is rejected: "Too many edits are already in
 *        progress in this conversation (limit 3)."
 *
 * `generate` answers the thread's latest unanswered prompt, so for D2 we post
 * each message and fire its generate before posting the next (a short spacing
 * lets each generate capture its own prompt); editRepo's ~minute-long lock hold
 * keeps all four overlapping.
 *
 * NOTE: D1 is deterministic and reliable. D2 is best-effort — LLM agents fan out
 * (one turn may batch-edit several PRs despite "only that PR"), so four clean
 * concurrent single-workstream turns can't be guaranteed; the cap may surface as
 * a per-workstream lock rejection instead. The authoritative, deterministic
 * proof of BOTH the lock and the cap lives in the unit tests:
 *   AiWritebackService.test.ts › "AiWritebackService workstream concurrency".
 * This harness validates the governor is wired into the live editRepo path.
 */
import { execSync } from 'node:child_process';

const PORT = process.env.PORT || '8130';
const BASE = `http://localhost:${PORT}/api/v1`;
const PROJECT = '3675b69e-8324-4110-bdca-059031aa8da3';
const AGENT = '379fb1de-0c74-4957-ba55-ec860166b542';
const REPO = 'charliedowler/jaffle';

// The agent paraphrases the governor's tool error rather than quoting it, so
// match intent, not exact text. The authoritative signal is still the
// side-effect (commit counts), checked via gh after the run.
const LOCK_RE =
    /already in progress|still being processed|being processed on the server|wait (a moment|for it to finish)|another edit|currently being processed|in progress for this/i;
const CAP_RE =
    /too many edits|limit of 3|\(limit 3\)|limit 3\b|maximum number|3 edits are already|already in progress in this conversation/i;
const SUCCESS_RE = /pushed|updated the pull request|appended|added (a|another) line|now reads|new commit/i;

let cookie = '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login() {
    const res = await fetch(`${BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: 'demo@lightdash.com',
            password: 'demo_password!',
        }),
    });
    if (!res.ok) throw new Error(`login failed: ${res.status}`);
    cookie = (res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')])
        .filter(Boolean)
        .map((c) => c.split(';')[0])
        .join('; ');
    if (!cookie) throw new Error('no session cookie');
}

const api = (path, body) =>
    fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

const agentBase = `/projects/${PROJECT}/aiAgents/${AGENT}/threads`;

async function createThread(prompt) {
    const r = await api(`${agentBase}`, { prompt });
    const j = await r.json();
    if (j.status !== 'ok') throw new Error(`createThread: ${JSON.stringify(j)}`);
    return j.results.uuid;
}

async function postMessage(threadUuid, prompt) {
    const r = await api(`${agentBase}/${threadUuid}/messages`, { prompt });
    const j = await r.json();
    if (j.status !== 'ok') throw new Error(`postMessage: ${JSON.stringify(j)}`);
}

// Returns the agent's final text response (non-streaming).
async function generate(threadUuid) {
    const r = await api(`${agentBase}/${threadUuid}/generate`);
    const j = await r.json();
    if (j.status !== 'ok') return `__ERROR__ ${JSON.stringify(j).slice(0, 300)}`;
    return j.results.response ?? '';
}

// Newest `n` open PR URLs on the repo, oldest-first, via gh.
function newestOpenPrUrls(n) {
    const out = execSync(
        `gh api 'repos/${REPO}/pulls?state=open&sort=created&direction=desc&per_page=${n}' --jq '.[].html_url'`,
        { encoding: 'utf8' },
    );
    return out.trim().split('\n').filter(Boolean).reverse();
}

async function runD1() {
    console.log('\n=== D1: per-workstream lock ===');
    // Setup: open a PR in a fresh thread.
    const thread = await createThread(
        `Use the editRepo tool on ${REPO}: append a line to the bottom of README.md that reads "D1 governor base". Open a pull request with that change.`,
    );
    console.log('D1 thread', thread, '— opening base PR...');
    const setup = await generate(thread);
    console.log('  base PR turn done:', setup.slice(0, 120).replace(/\n/g, ' '));

    // Concurrent phase: one follow-up message continuing that PR, two
    // generates firing it at once.
    await postMessage(
        thread,
        `Continue that same pull request: append another line to README.md that reads "D1 governor follow". Push it to the same PR.`,
    );
    console.log('  firing 2 concurrent generates on the same PR...');
    const [a, b] = await Promise.all([generate(thread), generate(thread)]);
    const responses = [a, b];
    const locked = responses.filter((r) => LOCK_RE.test(r)).length;
    const succeeded = responses.filter(
        (r) => SUCCESS_RE.test(r) && !LOCK_RE.test(r),
    ).length;
    responses.forEach((r, i) =>
        console.log(`  resp ${i}:`, r.slice(0, 180).replace(/\n/g, ' ')),
    );
    // Governor working ⇒ exactly one turn pushes; the other is rejected. A
    // governor failure would let both push (2 successes → 3 commits / conflict).
    const pass = succeeded === 1 && locked >= 1;
    console.log(
        `D1 ${pass ? 'PASS' : 'FAIL'} — lockRejections=${locked} succeeded=${succeeded} (verify: PR should have base+1 commit)`,
    );
    return { test: 'D1', pass, locked, succeeded, thread };
}

async function runD2() {
    console.log('\n=== D2: per-thread cap (3) ===');
    const N = 4;
    // Setup: open N distinct PRs sequentially in one thread.
    const thread = await createThread(
        `Use the editRepo tool on ${REPO}: append a line to the bottom of README.md that reads "D2 base 1". Open a NEW pull request with that change.`,
    );
    console.log('D2 thread', thread, `— opening ${N} distinct PRs...`);
    await generate(thread); // PR 1
    for (let i = 2; i <= N; i += 1) {
        await postMessage(
            thread,
            `Open a SEPARATE, brand-new pull request on ${REPO} (use startNewPullRequest) that appends a line to README.md reading "D2 base ${i}". Do not touch the other PRs.`,
        );
        // eslint-disable-next-line no-await-in-loop
        await generate(thread);
    }

    // Explicit distinct PR targets (oldest-first) — removes any ambiguity that
    // two turns resolve to the same PR (which would collide on the per-workstream
    // lock instead of exercising the per-thread cap).
    const urls = newestOpenPrUrls(N);
    console.log('  PRs opened:', urls.join(' '));
    console.log('  Firing 4 concurrent distinct-PR continues...');

    // Concurrent phase: interleave message+generate so each generate captures
    // its own distinct-PR prompt; spacing << editRepo lock-hold so all overlap.
    const fires = [];
    for (let i = 0; i < N; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await postMessage(
            thread,
            `Continue this exact pull request: ${urls[i]} — append a line "D2 follow ${i + 1}" to README.md and push it to that same PR. Use its URL as the editRepo prUrl. Do not open a new PR or touch any other PR.`,
        );
        fires.push(generate(thread));
        // eslint-disable-next-line no-await-in-loop
        await sleep(3500); // let this generate read its prompt before next post
    }
    const responses = await Promise.all(fires);
    const capped = responses.filter((r) => CAP_RE.test(r)).length;
    const locked = responses.filter(
        (r) => LOCK_RE.test(r) && !CAP_RE.test(r),
    ).length;
    responses.forEach((r, i) =>
        console.log(`  resp ${i}:`, r.slice(0, 180).replace(/\n/g, ' ')),
    );
    // The 4th concurrent distinct-workstream turn must hit the per-thread cap.
    const pass = capped >= 1;
    console.log(
        `D2 ${pass ? 'PASS' : 'FAIL'} — capRejections=${capped} lockRejections=${locked} (verify: ≤3 of the 4 PRs got a follow commit)`,
    );
    return { test: 'D2', pass, capped, locked, urls, thread };
}

async function main() {
    await login();
    const which = process.argv[2] || 'all';
    const results = [];
    if (which === 'd1' || which === 'all') results.push(await runD1());
    if (which === 'd2' || which === 'all') results.push(await runD2());
    console.log('\n=== SUMMARY ===');
    results.forEach((r) =>
        console.log(`${r.test}: ${r.pass ? 'PASS' : 'FAIL'}`, JSON.stringify(r)),
    );
    process.exit(results.every((r) => r.pass) ? 0 : 1);
}

main().catch((e) => {
    console.error('harness error:', e);
    process.exit(2);
});
