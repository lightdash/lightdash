/**
 * Runtime smoke for every generated walkthrough (CS-209): a learner starts
 * each tour on a running instance and a driver completes it by clicking
 * only what the tour highlights (the ring's control, or the card's own
 * button), never anything else. A tour fails when a step makes no progress
 * in time, when Got it does not open the completion dialog, when Back to
 * library does not land on the shared training project's library, or when
 * the learner holds the scope in a real project (nothing to train).
 *
 * Needs a running instance with a training project and a learner account:
 *   SMOKE_BASE_URL   (default http://localhost:3030)
 *   SMOKE_EMAIL / SMOKE_PASSWORD   (required: a learner account on that instance)
 *   SMOKE_SCOPES     comma-separated subset (default every generated tour)
 *
 * With --thumbnails, the page as the learner sees it at the action step is
 * saved to packages/frontend/src/features/learn/thumbnails/<scope>.jpg for
 * the library card's band (the same shot every run, since the copy is
 * always in the seeded state).
 *
 * Usage: pnpm scope-tours:smoke [--thumbnails]
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SCOPE_TOURS } from '../../packages/frontend/src/features/scopeTours/generated';
import { root } from './lib';

type Page = import('playwright').Page;

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3030';
const EMAIL = process.env.SMOKE_EMAIL;
const PASSWORD = process.env.SMOKE_PASSWORD;
if (!EMAIL || !PASSWORD) {
    throw new Error(
        'Set SMOKE_EMAIL and SMOKE_PASSWORD to a learner account on the instance',
    );
}
const STEP_TIMEOUT_MS = 90_000;
const THUMBNAILS = process.argv.includes('--thumbnails');
const THUMBNAIL_DIR = path.join(
    root,
    'packages/frontend/src/features/learn/thumbnails',
);
const SETTLE_MS = 1_300;

const loadPlaywright = async () => {
    const requireFromBackend = createRequire(
        path.join(root, 'packages/backend/package.json'),
    );
    const modulePath = requireFromBackend.resolve('playwright');
    const loaded = (await import(pathToFileURL(modulePath).href)) as
        | typeof import('playwright')
        | { default: typeof import('playwright') };
    return 'default' in loaded && loaded.default ? loaded.default : loaded;
};

const login = async (page: Page) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel('Email address').fill(EMAIL);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    // Only the URL: after login the app may bounce for a while between the
    // project list and a copy an earlier run left behind (its remembered
    // active project), so a wait for the page to load could outlast it.
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
        waitUntil: 'commit',
    });
};

const projects = async (page: Page) =>
    page.evaluate(async () => {
        const res = await fetch('/api/v1/org/projects');
        return (await res.json()).results as {
            projectUuid: string;
            type: string;
            name: string;
        }[];
    });

/** What the tour shows right now: its step counter, its button, its ring. */
const tourState = (page: Page) =>
    page.evaluate(() => {
        const card = document.querySelector('[data-tour-card]');
        const counter = card?.textContent?.match(/Step (\d+) of (\d+)/);
        const button = [...(card?.querySelectorAll('button') ?? [])].find((b) =>
            /^(Next|Got it)$/.test(b.textContent?.trim() ?? ''),
        ) as HTMLButtonElement | undefined;
        const ring = document.querySelector('[class*="spotlight"]');
        const rect = ring?.getBoundingClientRect();
        const waiting = !!document.querySelector('[class*="spotlightWaiting"]');
        const gliding = !!document.querySelector('[class*="spotlightGliding"]');
        return {
            open: !!(card || ring),
            step: counter ? Number(counter[1]) : null,
            total: counter ? Number(counter[2]) : null,
            button: button
                ? {
                      label: button.textContent?.trim(),
                      ready:
                          !button.disabled &&
                          button.getAttribute('data-loading') === null,
                  }
                : null,
            ring:
                rect && rect.width > 0 && rect.height > 0
                    ? {
                          x: rect.left + rect.width / 2,
                          y: rect.top + rect.height / 2,
                      }
                    : null,
            waiting,
            gliding,
        };
    });

const runTour = async (
    page: Page,
    scope: string,
    trainingUuid: string,
    trainingSlug: string,
) => {
    const onTraining = (url: URL) =>
        url.pathname.includes(trainingUuid) ||
        url.pathname.includes(trainingSlug);
    const steps = SCOPE_TOURS[scope].steps;
    // A copy left by an earlier run (one that failed mid-tour) is removed
    // first, so the start below makes a fresh one from a clean slate.
    await page.evaluate(async (uuid) => {
        await fetch(`/api/v1/projects/${uuid}/training-previews`, {
            method: 'DELETE',
        });
    }, trainingUuid);
    await page.goto(
        `${BASE}/projects/${trainingUuid}/home?tour=${encodeURIComponent(scope)}`,
    );
    await page.waitForURL(
        (url) =>
            url.pathname.includes('/projects/') &&
            !url.pathname.includes(trainingUuid),
        { timeout: 60_000 },
    );
    const copy = page.url().match(/\/projects\/([0-9a-f-]{36})/)?.[1];
    if (!copy) throw new Error('did not land in a training copy');

    // The tour opens once the copy has loaded; between layouts (Ask AI)
    // nothing of it is on screen for a moment, so "closed" needs to last.
    await page
        .locator('[data-tour-card], [class*="spotlight"]')
        .first()
        .waitFor({ state: 'attached', timeout: 60_000 });
    let lastStep = 0;
    let lastProgress = Date.now();
    let closedSince: number | null = null;
    let thumbnailTaken = false;
    let stalledFor = 0;
    // The page as the learner sees it at each step, minus the tour's own
    // layer, kept while no dialog covers it: the thumbnail wants the product
    // the walkthrough is about, not a backdrop.
    let lastClearShot: Buffer | null = null;
    const cleanShot = async () => {
        await page.evaluate(() => {
            const layer =
                document.querySelector<HTMLElement>('[data-tour-root]');
            if (layer) layer.style.visibility = 'hidden';
        });
        const shot = await page.screenshot({
            type: 'jpeg',
            quality: 70,
            clip: { x: 0, y: 0, width: 1440, height: 900 },
        });
        await page.evaluate(() => {
            const layer =
                document.querySelector<HTMLElement>('[data-tour-root]');
            if (layer) layer.style.visibility = '';
        });
        return shot;
    };
    const dialogOpen = () =>
        page.evaluate(
            () =>
                !!document.querySelector(
                    '.mantine-Modal-overlay, [data-combobox-dropdown]',
                ),
        );
    while (true) {
        const state = await tourState(page);
        if (!state.open) {
            closedSince ??= Date.now();
            if (Date.now() - closedSince > 5_000) {
                if (lastStep === steps.length) break;
                throw new Error(
                    `tour closed at step ${lastStep} of ${steps.length}`,
                );
            }
            await page.waitForTimeout(300);
            continue;
        }
        closedSince = null;
        if (state.step && state.step !== lastStep) {
            if (process.env.SMOKE_DEBUG) {
                console.log(
                    `  step ${state.step}: ${steps[state.step - 1]?.title}`,
                );
            }
            // SMOKE_SHOT_STEP=n saves a screenshot once step n has settled,
            // for looking at one step of one tour without recording a flow.
            // SMOKE_DUMP_STEP=n lists every element the step's target selector
            // matches, with its size and opening tag: for a ring on the
            // wrong thing.
            if (String(state.step) === process.env.SMOKE_DUMP_STEP) {
                await page.waitForTimeout(1600);
                const target = steps[state.step - 1]?.target;
                const found = await page.evaluate((sel) => {
                    return Array.from(document.querySelectorAll(sel)).map(
                        (el) => {
                            const r = el.getBoundingClientRect();
                            return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} ${el.outerHTML.slice(0, 160)}`;
                        },
                    );
                }, target);
                console.log(`  target ${target}: ${found.length} match(es)`);
                found.forEach((f) => console.log(`    ${f}`));
            }
            if (String(state.step) === process.env.SMOKE_SHOT_STEP) {
                await page.waitForTimeout(1600);
                const shot = path.join(
                    process.env.SMOKE_OUT_DIR ?? tmpdir(),
                    `scope-tours-step-${scope.replace(':', '_')}-${state.step}.png`,
                );
                await page.screenshot({ path: shot });
                console.log(`  screenshot: ${shot}`);
            }
            lastStep = state.step;
            lastProgress = Date.now();
            await page.waitForTimeout(SETTLE_MS);
            if (THUMBNAILS && !thumbnailTaken && !(await dialogOpen())) {
                lastClearShot = await cleanShot();
            }
            continue;
        }
        if (
            process.env.SMOKE_DEBUG &&
            Date.now() - lastProgress > 10_000 &&
            Math.floor((Date.now() - lastProgress) / 10_000) !== stalledFor
        ) {
            // A stalled step, every ten seconds: what the tour shows and
            // whether its target is on the page at all.
            stalledFor = Math.floor((Date.now() - lastProgress) / 10_000);
            const target = steps[Math.max(0, lastStep - 1)]?.target ?? '';
            const onPage = await page.evaluate(
                (sel) => ({
                    target: !!document.querySelector(sel),
                    active: document
                        .querySelector('[data-tour-active]')
                        ?.textContent?.trim()
                        .slice(0, 40),
                    dialog: !!document.querySelector('.mantine-Modal-overlay'),
                }),
                target,
            );
            console.log(
                `  stalled ${stalledFor * 10}s at step ${lastStep}: ${JSON.stringify({ ...state, ...onPage })}`,
            );
        }
        if (Date.now() - lastProgress > STEP_TIMEOUT_MS) {
            throw new Error(
                `no progress at step ${lastStep} of ${steps.length} ("${steps[lastStep - 1]?.title}") for ${STEP_TIMEOUT_MS / 1000}s`,
            );
        }
        const step = steps[Math.max(0, lastStep - 1)];
        // The action step is the walkthrough's most telling moment: the
        // control the scope unlocks, on the page it lives on. When that
        // control sits inside a dialog, the last clear view before the
        // dialog opened is the picture of the feature instead.
        if (
            THUMBNAILS &&
            step &&
            lastStep > 0 &&
            !thumbnailTaken &&
            step.target.includes('data-tour-step="2"')
        ) {
            thumbnailTaken = true;
            await page.waitForTimeout(600);
            const shot =
                (await dialogOpen()) && lastClearShot
                    ? lastClearShot
                    : await cleanShot();
            writeFileSync(
                path.join(
                    THUMBNAIL_DIR,
                    `${scope.replace(/[^A-Za-z0-9]/g, '_')}.jpg`,
                ),
                shot,
            );
        }
        if (step?.advanceOnTargetInput) {
            // A typed step: the card offers a value; take it, as a learner
            // in a hurry would. Typing anything else would do as well.
            const useIt = page
                .locator('[data-tour-card]')
                .getByRole('button', { name: 'Use it' });
            if ((await useIt.count()) > 0) {
                await useIt.click();
                await page.waitForTimeout(SETTLE_MS);
            } else {
                throw new Error(
                    `typed step "${step.title}" offers nothing to use`,
                );
            }
            continue;
        }
        if (step && !step.advanceOnTargetClick && state.button) {
            if (state.button.ready) {
                await page
                    .locator('[data-tour-card]')
                    .getByRole('button', { name: state.button.label! })
                    .click();
                await page.waitForTimeout(SETTLE_MS);
                if (state.button.label === 'Got it') {
                    // The last look: the tour closes and the completion
                    // dialog opens over the page, still in the copy. Back
                    // to library leaves for the shared training project
                    // and removes the copy behind the learner; wait for
                    // that page so the next scope's start finds no copy
                    // removal still in flight.
                    await page
                        .locator(`[data-learn-done="${scope}"]`)
                        .waitFor({ timeout: 30_000 });
                    await page.locator('[data-learn-back]').click();
                    await page.waitForURL(onTraining, { timeout: 30_000 });
                    await page.waitForTimeout(SETTLE_MS);
                    lastStep = steps.length;
                    break;
                }
            } else {
                await page.waitForTimeout(500);
            }
            continue;
        }
        if (state.ring && !state.waiting && !state.gliding) {
            // Click exactly the highlighted control: whatever sits under the
            // ring's centre, which the blockers leave clickable. Only once
            // the ring has stopped moving, so the click lands on the control
            // and not on the way to it.
            await page.waitForTimeout(250);
            const again = await tourState(page);
            if (
                !again.ring ||
                again.gliding ||
                Math.abs(again.ring.x - state.ring.x) > 1 ||
                Math.abs(again.ring.y - state.ring.y) > 1
            ) {
                continue;
            }
            await page.mouse.click(again.ring.x, again.ring.y);
            await page.waitForTimeout(SETTLE_MS);
            continue;
        }
        await page.waitForTimeout(400);
    }
    return copy;
};

/** The project's URL identifier is its uuid or a slug of its name. */
const slugOf = (name: string) =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

const main = async () => {
    const { chromium } = await loadPlaywright();
    const wanted = process.env.SMOKE_SCOPES?.split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const scopes = Object.keys(SCOPE_TOURS).filter(
        (s) => !wanted || wanted.includes(s),
    );
    const browser = await chromium.launch();
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    if (process.env.SMOKE_DEBUG) {
        // What the driver saw: every page the app moved to and every
        // request that changed something, for reading a failure after.
        // Also who sent the app to a home page: the stack of every
        // in-app navigation whose target ends in /home.
        await page.addInitScript(() => {
            for (const method of ['pushState', 'replaceState'] as const) {
                const original = history[method];
                history[method] = function (data, unused, url) {
                    if (typeof url === 'string' && /\/home(\?|$)/.test(url)) {
                        console.log(
                            `[nav-to-home] ${method} ${url}\n${new Error().stack}`,
                        );
                    }
                    return original.call(this, data, unused, url);
                };
            }
        });
        page.on('console', (message) => {
            if (/^\[(nav-to-home)\]/.test(message.text())) {
                console.log(`  ${message.text()}`);
            }
        });
        page.on('framenavigated', (frame) => {
            if (frame === page.mainFrame()) {
                console.log(`  → ${frame.url().replace(BASE, '')}`);
            }
        });
        page.on('request', (request) => {
            if (
                request.url().includes('/api/v1/') &&
                request.method() !== 'GET'
            ) {
                console.log(
                    `  ${request.method()} ${request.url().replace(BASE, '')}`,
                );
            }
        });
    }
    // Product promos a first visit would open over the page (the catalog's
    // "Spotlight is here" popover) are marked seen so thumbnails stay clean.
    await page.addInitScript(() => {
        window.localStorage.setItem(
            'metrics-catalog-learn-more-popover-closed',
            'true',
        );
    });
    const failures: string[] = [];
    try {
        await login(page);
        const all = await projects(page);
        const training = all.find((p) => p.type === 'TRAINING');
        if (!training) throw new Error('no training project in the org');
        const real = all.find((p) => p.type === 'DEFAULT');
        const ability = await page.evaluate(async () => {
            const res = await fetch('/api/v1/user');
            return (await res.json()).results.abilityRules as {
                action: string | string[];
                subject: string | string[];
                inverted?: boolean;
                conditions?: { projectUuid?: string };
            }[];
        });
        const holds = (scope: string, projectUuid: string) => {
            const [action, subject] = scope.split(':');
            return ability.some(
                (r) =>
                    !r.inverted &&
                    [r.action]
                        .flat()
                        .some((a) => a === action || a === 'manage') &&
                    [r.subject].flat().includes(subject) &&
                    r.conditions?.projectUuid === projectUuid,
            );
        };
        for (const scope of scopes) {
            const started = Date.now();
            try {
                if (!holds(scope, training.projectUuid)) {
                    throw new Error(
                        'the learner does not hold the scope in the training project',
                    );
                }
                if (real && holds(scope, real.projectUuid)) {
                    console.log(
                        `  note: ${EMAIL} already holds ${scope} in ${real.name}; nothing to train there`,
                    );
                }
                const copy = await runTour(
                    page,
                    scope,
                    training.projectUuid,
                    slugOf(training.name),
                );
                const url = page.url();
                const onLibrary = /\/learn$/.test(new URL(url).pathname);
                if (
                    url.includes(copy) ||
                    !onLibrary ||
                    !(
                        url.includes(training.projectUuid) ||
                        url.includes(slugOf(training.name))
                    )
                ) {
                    throw new Error(
                        `ended on ${url}, not the library of the shared training project`,
                    );
                }
                console.log(
                    `PASS ${scope} (${SCOPE_TOURS[scope].steps.length} steps, ${Math.round((Date.now() - started) / 1000)}s)`,
                );
            } catch (error) {
                const message = (error as Error).message;
                failures.push(`${scope}: ${message}`);
                const shot = path.join(
                    process.env.SMOKE_OUT_DIR ?? tmpdir(),
                    `scope-tours-smoke-${scope.replace(/[^a-z0-9]/gi, '_')}.png`,
                );
                await page.screenshot({ path: shot }).catch(() => undefined);
                console.log(`FAIL ${scope}: ${message} (screenshot ${shot})`);
                // Leave any copy behind us before the next tour.
                await page
                    .evaluate(async (uuid) => {
                        await fetch(
                            `/api/v1/projects/${uuid}/training-previews`,
                            { method: 'DELETE' },
                        );
                    }, training.projectUuid)
                    .catch(() => undefined);
            }
        }
    } finally {
        await browser.close();
    }
    console.log(
        `${scopes.length - failures.length}/${scopes.length} walkthroughs completed by clicking only what was highlighted`,
    );
    process.exit(failures.length > 0 ? 1 : 0);
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
