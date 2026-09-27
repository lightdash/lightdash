import { createRequire } from 'node:module';
import path from 'node:path';
import { json } from './model';

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

async function repoint(root: string): Promise<void> {
    const requireBackend = createRequire(
        path.join(root, 'packages/backend/package.json'),
    );
    const { Client: PgClient } = requireBackend('pg') as {
        Client: new (config?: Record<string, unknown>) => Client;
    };
    const { EncryptionUtil } = requireBackend(
        path.join(
            root,
            'packages/backend/src/utils/EncryptionUtil/EncryptionUtil.ts',
        ),
    ) as { EncryptionUtil: new (config: unknown) => Cipher };
    const { SEED_PROJECT } = requireBackend('@lightdash/common') as {
        SEED_PROJECT: { project_uuid: string };
    };
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
        await client.query('BEGIN');
        const result = await client.query(
            'SELECT p.project_id, p.dbt_connection, w.warehouse_credentials_id, w.encrypted_credentials FROM projects p JOIN warehouse_credentials w ON w.project_id=p.project_id WHERE p.project_uuid=$1 FOR UPDATE',
            [SEED_PROJECT.project_uuid],
        );
        if (result.rows.length !== 1)
            throw new Error('Expected one seeded warehouse connection');
        const row = result.rows[0];
        const credentials = json<Record<string, unknown>>(
            enc.decrypt(row.encrypted_credentials as Buffer),
        );
        if (credentials.type !== 'postgres' || credentials.schema !== 'jaffle')
            throw new Error(
                'Seeded warehouse is not the expected PostgreSQL jaffle schema',
            );
        const updated = {
            ...credentials,
            host: process.env.PGHOST,
            port: Number(process.env.PGPORT),
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            dbname: process.env.PGDATABASE,
        };
        await client.query(
            'UPDATE warehouse_credentials SET encrypted_credentials=$1 WHERE warehouse_credentials_id=$2',
            [
                enc.encrypt(JSON.stringify(updated)),
                row.warehouse_credentials_id,
            ],
        );
        const dbt = json<Record<string, unknown>>(
            enc.decrypt(row.dbt_connection as Buffer),
        );
        await client.query(
            'UPDATE projects SET dbt_connection=$1 WHERE project_id=$2',
            [
                enc.encrypt(
                    JSON.stringify({
                        ...dbt,
                        project_dir: path.join(
                            root,
                            'examples/full-jaffle-shop-demo/dbt',
                        ),
                        profiles_dir: path.join(
                            root,
                            'examples/full-jaffle-shop-demo/profiles',
                        ),
                    }),
                ),
                row.project_id,
            ],
        );
        const stored = await client.query(
            'SELECT encrypted_credentials FROM warehouse_credentials WHERE warehouse_credentials_id=$1',
            [row.warehouse_credentials_id],
        );
        const verified = json<Record<string, unknown>>(
            enc.decrypt(stored.rows[0].encrypted_credentials as Buffer),
        );
        const warehouse = new PgClient({
            host: verified.host,
            port: verified.port,
            user: verified.user,
            password: verified.password,
            database: verified.dbname,
        });
        await warehouse.connect();
        try {
            const query = await warehouse.query(
                'SELECT current_database() AS database, count(*)::int AS rows FROM jaffle.orders',
            );
            if (
                query.rows[0].database !== process.env.PGDATABASE ||
                Number(query.rows[0].rows) < 1
            )
                throw new Error(
                    'Warehouse does not point to the populated instance database',
                );
        } finally {
            await warehouse.end();
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
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
            await page.waitForSelector(process.env.LDENV_PAINT_SELECTOR!, {
                state: 'visible',
                timeout: Number(process.env.LDENV_PAINT_TIMEOUT),
            });
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
    operation === 'repoint'
        ? repoint(root)
        : operation === 'paint'
          ? paint(root)
          : Promise.reject(new Error('Unknown bridge command'));
work.catch(() => {
    process.stderr.write(
        `ldenv ${operation} failed; check the seeded schema, browser connection and instance environment\n`,
    );
    process.exitCode = 1;
});
