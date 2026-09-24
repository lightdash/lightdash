import {
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
} from '@lightdash/common';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { test as base, type BrowserContextOptions } from 'playwright/test';
import { createTrackedAgent, type Agent } from './agents';
import { createApi, type LightdashApi } from './api';
import { createPool } from './db';
import { runId, siteUrl } from './env';
import {
    f1Agent,
    f2SqlFirstAgent,
    f3AsksBackAgent,
    f4CustomersAgent,
    f4RevenueAgent,
    type AgentSpec,
} from './fixtureData';

type StorageState = Exclude<BrowserContextOptions['storageState'], undefined>;

type WorkerFixtures = {
    authState: StorageState;
    api: LightdashApi;
    db: Pool;
    f1Agent: Agent;
    f2Agent: Agent;
    f3Agent: Agent;
    f4Agents: { revenue: Agent; customers: Agent };
};

type TestFixtures = {
    tierGate: void;
};

const TIER_GATE_FILE = 'tier-gate-failures.txt';

// Spec files are named after the plan's test ids: t<tier>.<n>-<name>.spec.ts
const tierOf = (specFile: string) =>
    Number(/^t(\d+)\./.exec(path.basename(specFile))?.[1] ?? Infinity);

const agentFixture =
    (spec: (id: string) => AgentSpec) =>
    async (
        { api }: { api: LightdashApi },
        use: (agent: Agent) => Promise<void>,
    ) => {
        const tracked = await createTrackedAgent(api, spec(runId));
        await use(tracked.agent);
        await tracked.remove();
    };

export const test = base.extend<TestFixtures, WorkerFixtures>({
    // Log in once per worker; page and api share the session cookie.
    authState: [
        async ({ playwright }, use) => {
            const context = await playwright.request.newContext({
                baseURL: siteUrl,
            });
            const response = await context.post('/api/v1/login', {
                data: {
                    email: SEED_ORG_1_ADMIN_EMAIL.email,
                    password: SEED_ORG_1_ADMIN_PASSWORD.password,
                },
            });
            if (!response.ok()) {
                throw new Error(
                    `Login at ${siteUrl} failed: HTTP ${response.status()} ${await response.text()}`,
                );
            }
            const state = await context.storageState();
            await context.dispose();
            await use(state);
        },
        { scope: 'worker' },
    ],
    storageState: async ({ authState }, use) => use(authState),
    api: [
        async ({ playwright, authState }, use) => {
            // timeout 0: model calls take as long as they take (plan §8.5).
            const context = await playwright.request.newContext({
                baseURL: siteUrl,
                storageState: authState,
                timeout: 0,
            });
            await use(createApi(context));
            await context.dispose();
        },
        { scope: 'worker' },
    ],
    db: [
        async ({}, use) => {
            const pool = createPool();
            await use(pool);
            await pool.end();
        },
        { scope: 'worker' },
    ],
    f1Agent: [agentFixture(f1Agent), { scope: 'worker' }],
    f2Agent: [agentFixture(f2SqlFirstAgent), { scope: 'worker' }],
    f3Agent: [agentFixture(f3AsksBackAgent), { scope: 'worker' }],
    f4Agents: [
        async ({ api }, use) => {
            const revenue = await createTrackedAgent(
                api,
                f4RevenueAgent(runId),
            );
            const customers = await createTrackedAgent(
                api,
                f4CustomersAgent(runId),
            );
            await use({ revenue: revenue.agent, customers: customers.agent });
            await revenue.remove();
            await customers.remove();
        },
        { scope: 'worker' },
    ],
    // Plan §4: a tier 0 or 1 failure stops the run. Later tiers in the same
    // run skip; a spec run on its own starts with a clean output dir.
    tierGate: [
        async ({}, use, testInfo) => {
            const gateFile = path.join(
                testInfo.project.outputDir,
                TIER_GATE_FILE,
            );
            const tier = tierOf(testInfo.file);
            if (tier >= 2 && existsSync(gateFile)) {
                const failed = readFileSync(gateFile, 'utf8').trim();
                testInfo.skip(
                    true,
                    `tier 0/1 failed earlier in this run (${failed}); nothing later can be trusted`,
                );
            }
            await use();
            if (tier <= 1 && testInfo.status !== testInfo.expectedStatus) {
                mkdirSync(testInfo.project.outputDir, { recursive: true });
                appendFileSync(gateFile, `${testInfo.title}\n`);
            }
        },
        { auto: true },
    ],
});

export { expect } from 'playwright/test';
