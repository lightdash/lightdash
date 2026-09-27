import { createRequire } from 'node:module';
import path from 'node:path';
import { runner } from './io';
import { json, type Environment } from './model';

type QueryResult = { rows: Record<string, unknown>[] };
type Client = {
    connect: () => Promise<void>;
    end: () => Promise<void>;
    query: (sql: string, values?: unknown[]) => Promise<QueryResult>;
};
type Cipher = {
    encrypt: (plain: string) => Buffer;
    decrypt: (encrypted: Buffer) => string;
};

async function updateDbtPath(root: string): Promise<void> {
    const requireBackend = createRequire(
        path.join(root, 'packages/backend/package.json'),
    );
    const { Client: PgClient } = requireBackend('pg') as {
        Client: new () => Client;
    };
    const { EncryptionUtil } = requireBackend(
        path.join(
            root,
            'packages/backend/src/utils/EncryptionUtil/EncryptionUtil.ts',
        ),
    ) as { EncryptionUtil: new (config: unknown) => Cipher };
    const projectUuid =
        process.env.LDENV_SEED_PROJECT_UUID ??
        (
            requireBackend('@lightdash/common') as {
                SEED_PROJECT: { project_uuid: string };
            }
        ).SEED_PROJECT.project_uuid;
    if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
            projectUuid,
        )
    )
        throw new Error('Invalid seeded project UUID');
    const secret = process.env.LIGHTDASH_SECRET;
    if (!secret) throw new Error('Machine secret is missing');
    const enc = new EncryptionUtil({
        lightdashConfig: {
            lightdashSecret: secret,
            lightdashSecrets: { active: secret, all: [secret] },
        },
    });
    const client = new PgClient();
    await client.connect();
    try {
        const result = await client.query(
            'SELECT project_id, dbt_connection FROM projects WHERE project_uuid=$1',
            [projectUuid],
        );
        if (result.rows.length !== 1)
            throw new Error('Expected one seeded project');
        const row = result.rows[0];
        const dbt = json<Record<string, unknown>>(
            enc.decrypt(row.dbt_connection as Buffer),
        );
        const projectDir = path.join(
            root,
            'examples/full-jaffle-shop-demo/dbt',
        );
        const profilesDir = path.join(
            root,
            'examples/full-jaffle-shop-demo/profiles',
        );
        if (dbt.project_dir === projectDir && dbt.profiles_dir === profilesDir)
            return;
        await client.query(
            'UPDATE projects SET dbt_connection=$1 WHERE project_id=$2',
            [
                enc.encrypt(
                    JSON.stringify({
                        ...dbt,
                        project_dir: projectDir,
                        profiles_dir: profilesDir,
                    }),
                ),
                row.project_id,
            ],
        );
    } finally {
        await client.end();
    }
}

type Page = {
    goto: (url: string, options: Record<string, unknown>) => Promise<unknown>;
    waitForSelector: (
        selector: string,
        options: Record<string, unknown>,
    ) => Promise<unknown>;
};
type Browser = {
    newContext: () => Promise<{
        newPage: () => Promise<Page>;
        close: () => Promise<void>;
    }>;
    close: () => Promise<void>;
};
async function paint(root: string): Promise<void> {
    const requireBackend = createRequire(
        path.join(root, 'packages/backend/package.json'),
    );
    const { chromium } = requireBackend('playwright') as {
        chromium: {
            connectOverCDP: (
                url: string,
                options: Record<string, unknown>,
            ) => Promise<Browser>;
            launch: (options: Record<string, unknown>) => Promise<Browser>;
        };
    };
    let browser: Browser;
    let origin = process.env.LDENV_PAINT_URL!;
    try {
        browser = await chromium.connectOverCDP(process.env.LDENV_CDP_URL!, {
            timeout: 5000,
        });
    } catch {
        browser = await chromium.launch({ headless: true });
        origin = process.env.SITE_URL!;
    }
    try {
        const context = await browser.newContext();
        try {
            const page = await context.newPage();
            await page.goto(`${origin}/login`, {
                waitUntil: 'domcontentloaded',
                timeout: 120000,
            });
            await page.waitForSelector(
                `${process.env.LDENV_PAINT_SELECTOR}:visible`,
                {
                    state: 'visible',
                    timeout: Number(process.env.LDENV_PAINT_TIMEOUT),
                },
            );
        } finally {
            await context.close();
        }
    } finally {
        await browser.close();
    }
}
const root = process.env.LDENV_WORKTREE;
if (!root) throw new Error('LDENV_WORKTREE is required');
const operation = process.argv[2];
const work =
    operation === 'dbt-path'
        ? updateDbtPath(root)
        : operation === 'paint'
          ? paint(root)
          : Promise.reject(new Error('Unknown bridge command'));
work.catch((error: unknown) => {
    runner.protect(
        Object.fromEntries(
            Object.entries(process.env).filter(
                (entry): entry is [string, string] => entry[1] !== undefined,
            ),
        ) as Environment,
    );
    process.stderr.write(
        `ldenv ${operation} failed: ${runner.redact(error instanceof Error ? error.message : String(error))}\n`,
    );
    process.exitCode = 1;
});
