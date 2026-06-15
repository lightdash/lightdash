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

const originalEnv = { ...process.env };
const rootDir = path.resolve(import.meta.dirname, '../..');
config({ path: path.join(rootDir, '.env.development') });
config({ path: path.join(rootDir, '.env.development.local'), override: true });
Object.assign(process.env, originalEnv);

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
        const requestedAiAgent =
            process.env.AI_AGENT_UUID || process.env.AI_AGENT_NAME
                ? await db('ai_agent')
                      .select('ai_agent_uuid', 'name', 'project_uuid')
                      .modify((queryBuilder) => {
                          if (process.env.AI_AGENT_UUID) {
                              void queryBuilder.where(
                                  'ai_agent_uuid',
                                  process.env.AI_AGENT_UUID,
                              );
                          } else if (process.env.AI_AGENT_NAME) {
                              void queryBuilder.where(
                                  'name',
                                  process.env.AI_AGENT_NAME,
                              );
                          }
                      })
                      .first()
                : undefined;

        const dashboard = await db('dashboards')
            .select(
                'dashboards.dashboard_uuid',
                'dashboards.name',
                'spaces.space_uuid',
                'projects.project_uuid',
            )
            .join('spaces', 'dashboards.space_id', 'spaces.space_id')
            .join('projects', 'spaces.project_id', 'projects.project_id')
            .whereNull('dashboards.deleted_at')
            .modify((queryBuilder) => {
                if (process.env.DASHBOARD_UUID) {
                    void queryBuilder.where(
                        'dashboards.dashboard_uuid',
                        process.env.DASHBOARD_UUID,
                    );
                } else if (requestedAiAgent) {
                    void queryBuilder.where(
                        'projects.project_uuid',
                        requestedAiAgent.project_uuid,
                    );
                } else {
                    void queryBuilder.where(
                        'dashboards.name',
                        process.env.DASHBOARD_NAME || 'Jaffle dashboard',
                    );
                }
            })
            .first();
        if (!dashboard) {
            console.error('No dashboards found in database');
            process.exit(1);
        }
        const projectUuid = dashboard.project_uuid;
        const dashboardUuid = dashboard.dashboard_uuid;
        const spaceUuid = dashboard.space_uuid;
        const aiAgent =
            requestedAiAgent ??
            (await db('ai_agent')
                .select('ai_agent_uuid', 'name')
                .where('project_uuid', projectUuid)
                .first());

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

        const user = await db('users').select('user_uuid').first();

        if (!user) {
            console.error('No users found in database');
            process.exit(1);
        }

        const serviceAccount = await db('service_accounts')
            .select('service_account_user_uuid')
            .join(
                'organizations',
                'service_accounts.organization_uuid',
                'organizations.organization_uuid',
            )
            .join(
                'projects',
                'projects.organization_id',
                'organizations.organization_id',
            )
            .where('projects.project_uuid', projectUuid)
            .whereRaw(
                "scopes && ARRAY['system:admin', 'system:developer', 'system:editor', 'org:admin', 'org:edit']::text[]",
            )
            .orderByRaw(
                "case when service_accounts.description = 'Embedded customer actions' then 0 else 1 end",
            )
            .first();

        const writeActor = serviceAccount
            ? {
                  serviceAccountUserUuid:
                      serviceAccount.service_account_user_uuid,
              }
            : {
                  userUuid: user.user_uuid,
              };

        const dashboardPayload = {
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
            writeActions: {
                ...writeActor,
                spaceUuid,
            },
            user: {
                email: 'demo@lightdash.com',
            },
        };

        const dashboardToken = jwt.sign(dashboardPayload, rawSecret, {
            expiresIn: '24h',
        });
        const embedUrl = `${LIGHTDASH_URL}/embed/${projectUuid}#${dashboardToken}`;
        const aiAgentPayload = aiAgent
            ? {
                  content: {
                      type: 'aiAgent',
                      projectUuid,
                      agentUuid: aiAgent.ai_agent_uuid,
                  },
                  writeActions: {
                      ...writeActor,
                      spaceUuid,
                  },
                  user: {
                      email: 'demo@lightdash.com',
                  },
              }
            : null;
        const aiAgentToken = aiAgentPayload
            ? jwt.sign(aiAgentPayload, rawSecret, { expiresIn: '24h' })
            : null;
        const aiAgentEmbedUrl = aiAgent
            ? `${LIGHTDASH_URL}/embed/${projectUuid}/ai-agents/${
                  aiAgent.ai_agent_uuid
              }/threads#${aiAgentToken}`
            : null;

        console.log(
            JSON.stringify(
                {
                    projectUuid,
                    dashboardUuid,
                    dashboardName: dashboard.name,
                    aiAgentUuid: aiAgent?.ai_agent_uuid ?? null,
                    aiAgentName: aiAgent?.name ?? null,
                    embedUrl,
                    aiAgentEmbedUrl,
                },
                null,
                2,
            ),
        );

        console.log(`\nAdd to packages/sdk-test-app/.env.local:`);
        console.log(`VITE_EMBED_URL="${embedUrl}"`);
        if (aiAgent) {
            console.log(`VITE_AI_AGENT_UUID="${aiAgent.ai_agent_uuid}"`);
            console.log(`VITE_AI_AGENT_EMBED_URL="${aiAgentEmbedUrl}"`);
        }
    } finally {
        await db.destroy();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
