import dotenv from 'dotenv';
import knex from 'knex';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { assertLocalTarget, TEST_EMAIL, TEST_PASSWORD } from './config';
import { resetOnboardingFixture } from './reset';

const root = path.resolve(__dirname, '../../../../..');
dotenv.config({
    path: path.join(root, '.env.development.local'),
    override: true,
});
dotenv.config({ path: path.join(root, '.env.development') });
dotenv.config({ path: path.join(root, '.env') });

const waitForApp = async (siteUrl: string, attempts = 30): Promise<void> => {
    const health = await fetch(new URL('/api/v1/health', siteUrl)).catch(
        () => null,
    );
    if (health?.ok) return;
    if (attempts === 0)
        throw new Error('Start the local app before restarting onboarding.');
    await delay(1000);
    return waitForApp(siteUrl, attempts - 1);
};

const main = async () => {
    const args = process.argv.slice(2);
    if (args.some((arg) => !['--no-open', '--resume'].includes(arg))) {
        throw new Error('Usage: pnpm dev:onboarding [--no-open] [--resume]');
    }
    const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000';
    const connectionUri = process.env.PGCONNECTIONURI;
    const databaseHost = connectionUri
        ? new URL(connectionUri).hostname
        : (process.env.PGHOST ?? 'localhost');
    assertLocalTarget({ siteUrl, databaseHost, nodeEnv: process.env.NODE_ENV });
    await waitForApp(siteUrl);
    if (!args.includes('--resume')) {
        const database = knex({
            client: 'pg',
            connection: connectionUri ?? {
                host: databaseHost,
                port: Number(process.env.PGPORT ?? 5432),
                user: process.env.PGUSER,
                password: process.env.PGPASSWORD,
                database: process.env.PGDATABASE,
            },
        });
        try {
            await resetOnboardingFixture(database);
        } finally {
            await database.destroy();
        }
    }
    console.info(`Onboarding test account: ${TEST_EMAIL} / ${TEST_PASSWORD}`);
    console.info(`Start: ${new URL('/organization-setup', siteUrl).href}`);
    if (args.includes('--no-open')) return;
    const context = await chromium.launchPersistentContext(
        path.join(root, '.humanlayer/onboarding-browser'),
        {
            channel: 'chrome',
            headless: false,
            viewport: { width: 1440, height: 1000 },
        },
    );
    try {
        await context.clearCookies();
        const login = await context.request.post(
            new URL('/api/v1/login', siteUrl).href,
            {
                data: { email: TEST_EMAIL, password: TEST_PASSWORD },
            },
        );
        if (!login.ok())
            throw new Error(`Test account login failed (${login.status()}).`);
        const page = await context.newPage();
        await Promise.all(
            context
                .pages()
                .filter((other) => other !== page)
                .map((other) => other.close()),
        );
        await page.goto(siteUrl);
        await page.goto(new URL('/organization-setup', siteUrl).href);
        console.info(
            'Dedicated test browser ready. Close its window to finish.',
        );
        await new Promise<void>((resolve) => {
            context.once('close', () => resolve());
        });
    } finally {
        await context.close();
    }
};

void main().catch((error: unknown) => {
    console.error(
        error instanceof Error ? error.message : 'Onboarding restart failed.',
    );
    process.exitCode = 1;
});
