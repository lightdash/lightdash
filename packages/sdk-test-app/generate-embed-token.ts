import {
    createCipheriv,
    createDecipheriv,
    pbkdf2Sync,
    randomBytes,
} from 'crypto';
import jwt from 'jsonwebtoken';
import knex from 'knex';
import pgConnectionString from 'pg-connection-string';
const { parse } = pgConnectionString;
import { config } from 'dotenv';
import path from 'path';

const rootDir = path.resolve(import.meta.dirname, '../..');
config({ path: path.join(rootDir, '.env.development') });
config({ path: path.join(rootDir, '.env.development.local'), override: true });

const LIGHTDASH_SECRET = process.env.LIGHTDASH_SECRET || 'not very secret';
const LIGHTDASH_URL = process.env.SITE_URL || 'http://localhost:8080';

function encrypt(message: string, secret: string): Buffer {
    const saltLength = 64;
    const ivLength = 12;
    const authTagLength = 16;
    const iv = randomBytes(ivLength);
    const salt = randomBytes(saltLength);
    const key = pbkdf2Sync(secret, salt, 2000, 32, 'sha512');
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength });
    const encrypted = Buffer.concat([
        cipher.update(message, 'utf-8'),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([salt, tag, iv, encrypted]);
}

function decrypt(encrypted: Buffer, secret: string): string {
    const saltLength = 64;
    const authTagLength = 16;
    const ivLength = 12;
    const salt = encrypted.slice(0, saltLength);
    const tag = encrypted.slice(saltLength, saltLength + authTagLength);
    const iv = encrypted.slice(
        saltLength + authTagLength,
        saltLength + authTagLength + ivLength,
    );
    const encryptedMessage = encrypted.slice(
        saltLength + authTagLength + ivLength,
    );
    const key = pbkdf2Sync(secret, salt, 2000, 32, 'sha512');
    const decipher = createDecipheriv('aes-256-gcm', key, iv, {
        authTagLength,
    });
    decipher.setAuthTag(tag);
    return `${decipher.update(encryptedMessage, undefined, 'utf-8')}${decipher.final()}`;
}

async function main() {
    const connectionUri =
        process.env.PGCONNECTIONURI || process.env.DATABASE_URL;
    const connection = connectionUri
        ? parse(connectionUri)
        : {
              host: process.env.PGHOST || 'localhost',
              port: process.env.PGPORT || '5432',
              user: process.env.PGUSER || 'postgres',
              password: process.env.PGPASSWORD || 'password',
              database: process.env.PGDATABASE || 'postgres',
          };

    const db = knex({
        client: 'pg',
        connection,
    });

    try {
        const dashboard = await db('dashboards')
            .select(
                'dashboards.dashboard_uuid',
                'dashboards.name',
                'projects.project_uuid',
            )
            .join('spaces', 'dashboards.space_id', 'spaces.space_id')
            .join('projects', 'spaces.project_id', 'projects.project_id')
            .whereNull('dashboards.deleted_at')
            .where('dashboards.name', 'Jaffle dashboard')
            .first();
        if (!dashboard) {
            console.error('No dashboards found in database');
            process.exit(1);
        }
        const projectUuid = dashboard.project_uuid;
        const dashboardUuid = dashboard.dashboard_uuid;

        const existing = await db('embedding')
            .where({ project_uuid: projectUuid })
            .first();

        let rawSecret: string;
        if (existing) {
            rawSecret = decrypt(existing.encoded_secret, LIGHTDASH_SECRET);
        } else {
            rawSecret = randomBytes(32).toString('hex');
            const encodedSecret = encrypt(rawSecret, LIGHTDASH_SECRET);

            const user = await db('users').select('user_uuid').first();

            await db('embedding').insert({
                project_uuid: projectUuid,
                encoded_secret: encodedSecret,
                dashboard_uuids: db.raw(`ARRAY['${dashboardUuid}']::text[]`),
                allow_all_dashboards: true,
                created_by: user?.user_uuid,
            });
        }

        const payload = {
            content: {
                type: 'dashboard',
                projectUuid,
                dashboardUuid,
                dashboardFiltersInteractivity: {
                    enabled: 'all',
                    hidden: true,
                },
                canExportCsv: false,
                canExportImages: false,
                isPreview: false,
                canDateZoom: false,
                canExportPagePdf: false,
            },
            user: {
                email: 'demo@lightdash.com',
            },
        };

        const token = jwt.sign(payload, rawSecret, { expiresIn: '24h' });
        const embedUrl = `${LIGHTDASH_URL}/embed#${token}`;

        console.log(
            JSON.stringify(
                {
                    projectUuid,
                    dashboardUuid,
                    dashboardName: dashboard.name,
                    embedUrl,
                },
                null,
                2,
            ),
        );

        console.log(`\nAdd to packages/sdk-test-app/.env.local:`);
        console.log(`VITE_EMBED_URL="${embedUrl}"`);
    } finally {
        await db.destroy();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
