import {
    createCipheriv,
    createDecipheriv,
    pbkdf2Sync,
    randomBytes,
} from 'crypto';
import jwt from 'jsonwebtoken';
import knex, { type Knex } from 'knex';
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

type ApiResponse<T> = { status: 'ok'; results: T } | { status: 'error' };

async function loginToLightdash(): Promise<string> {
    const response = await fetch(`${LIGHTDASH_URL}/api/v1/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: 'demo@lightdash.com',
            password: 'demo_password!',
        }),
    });
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    if (!response.ok || !cookie) {
        throw new Error(`Login failed with HTTP ${response.status}`);
    }
    return cookie;
}

async function lightdashApi<T>(
    cookie: string,
    method: string,
    apiPath: string,
    body?: unknown,
): Promise<T> {
    const response = await fetch(`${LIGHTDASH_URL}${apiPath}`, {
        method,
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json()) as ApiResponse<T>;
    if (json.status !== 'ok') {
        throw new Error(`${method} ${apiPath} failed: ${JSON.stringify(json)}`);
    }
    return json.results;
}

type AiAgentPermissions = { sql: boolean; download: boolean };

// A service account on a duplicated Editor role, so SQL and downloads can be toggled per actor.
async function ensureAiAgentPermissionActor(
    db: Knex,
    cookie: string,
    organizationUuid: string,
    projectUuid: string,
    { sql, download }: AiAgentPermissions,
): Promise<string> {
    const name = `SDK test app AI agent (SQL ${sql ? 'on' : 'off'}, downloads ${
        download ? 'on' : 'off'
    })`;
    const existingActor = await db('service_accounts')
        .select('service_account_user_uuid')
        .where({ organization_uuid: organizationUuid, description: name })
        .first();
    if (existingActor) return existingActor.service_account_user_uuid;

    const rolesPath = `/api/v2/orgs/${organizationUuid}/roles`;
    const roles = await lightdashApi<{ roleUuid: string; name: string }[]>(
        cookie,
        'GET',
        rolesPath,
    );
    let roleUuid = roles.find((role) => role.name === name)?.roleUuid;
    if (!roleUuid) {
        const role = await lightdashApi<{ roleUuid: string }>(
            cookie,
            'POST',
            `${rolesPath}/editor/duplicate`,
            { name },
        );
        roleUuid = role.roleUuid;
        await lightdashApi(cookie, 'PATCH', `${rolesPath}/${roleUuid}`, {
            scopes: {
                add: sql ? ['view:EmbedCompiledSql'] : [],
                remove: download ? [] : ['view:EmbedCsvExport'],
            },
        });
    }

    await lightdashApi(cookie, 'POST', '/api/v1/service-accounts', {
        description: name,
        expiresAt: null,
        scopes: ['system:member'],
        projectAccess: [{ projectUuid, roleUuid }],
    });
    const createdActor = await db('service_accounts')
        .select('service_account_user_uuid')
        .where({ organization_uuid: organizationUuid, description: name })
        .first();
    if (!createdActor) throw new Error(`Service account ${name} not found`);
    return createdActor.service_account_user_uuid;
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

        const findWriteServiceAccount = () =>
            db('service_accounts')
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
        let cookie: string | undefined;
        const getCookie = async () => {
            cookie ??= await loginToLightdash();
            return cookie;
        };

        // Content listing (Add chart picker, content hooks) needs a service account write actor.
        let serviceAccount = await findWriteServiceAccount();
        if (!serviceAccount) {
            try {
                await lightdashApi(
                    await getCookie(),
                    'POST',
                    '/api/v1/service-accounts',
                    {
                        description: 'Embedded customer actions',
                        expiresAt: null,
                        scopes: ['system:admin'],
                    },
                );
                serviceAccount = await findWriteServiceAccount();
            } catch (error) {
                console.warn(
                    `Skipping service account write actor: ${
                        error instanceof Error ? error.message : error
                    }`,
                );
            }
        }

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
                    // Visible so the filter bar (uiOverrides chrome + language
                    // map filter labels) can be exercised in the test app
                    hidden: false,
                },
                parameterInteractivity: {
                    enabled: true,
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
        const aiAgentPermissionEmbedUrls: Record<string, string> = {};
        if (aiAgent) {
            try {
                const { organization_uuid: organizationUuid } = await db(
                    'projects',
                )
                    .select('organizations.organization_uuid')
                    .join(
                        'organizations',
                        'projects.organization_id',
                        'organizations.organization_id',
                    )
                    .where('projects.project_uuid', projectUuid)
                    .first();
                for (const sql of [true, false]) {
                    for (const download of [true, false]) {
                        const serviceAccountUserUuid =
                            await ensureAiAgentPermissionActor(
                                db,
                                await getCookie(),
                                organizationUuid,
                                projectUuid,
                                { sql, download },
                            );
                        for (const debug of [true, false]) {
                            const token = jwt.sign(
                                {
                                    content: {
                                        type: 'aiAgent',
                                        projectUuid,
                                        agentUuid: aiAgent.ai_agent_uuid,
                                        canViewDebugInfo: debug,
                                    },
                                    writeActions: {
                                        serviceAccountUserUuid,
                                        spaceUuid,
                                    },
                                    user: {
                                        email: 'demo@lightdash.com',
                                    },
                                },
                                rawSecret,
                                { expiresIn: '24h' },
                            );
                            aiAgentPermissionEmbedUrls[
                                `${debug}:${sql}:${download}`
                            ] =
                                `${LIGHTDASH_URL}/embed/${projectUuid}/ai-agents/${aiAgent.ai_agent_uuid}/threads#${token}`;
                        }
                    }
                }
            } catch (error) {
                console.warn(
                    `Skipping AI agent permission URLs: ${
                        error instanceof Error ? error.message : error
                    }`,
                );
            }
        }

        // Org editors lack view:EmbedCompiledSql, so an editor write actor hides compiled SQL.
        const noCompiledSqlUser = await db('users')
            .select('users.user_uuid')
            .join(
                'organization_memberships',
                'organization_memberships.user_id',
                'users.user_id',
            )
            .join(
                'projects',
                'projects.organization_id',
                'organization_memberships.organization_id',
            )
            .where('projects.project_uuid', projectUuid)
            .where('organization_memberships.role', 'editor')
            .first();
        const noCompiledSqlWriteActor = noCompiledSqlUser
            ? { userUuid: noCompiledSqlUser.user_uuid }
            : null;

        type WriteActor =
            | { serviceAccountUserUuid: string }
            | { userUuid: string };

        const signMetricsCatalogEmbedUrl = (actor: WriteActor) =>
            `${LIGHTDASH_URL}/embed/${projectUuid}/metrics#${jwt.sign(
                {
                    content: {
                        type: 'metricsCatalog',
                        projectUuid,
                        canExplore: true,
                    },
                    writeActions: {
                        ...actor,
                        spaceUuid,
                    },
                    user: {
                        email: 'demo@lightdash.com',
                    },
                },
                rawSecret,
                { expiresIn: '24h' },
            )}`;
        const metricsCatalogEmbedUrl = signMetricsCatalogEmbedUrl(writeActor);
        const metricsCatalogNoSqlEmbedUrl = noCompiledSqlWriteActor
            ? signMetricsCatalogEmbedUrl(noCompiledSqlWriteActor)
            : null;

        const chart = await db('saved_queries')
            .select('saved_queries.saved_query_uuid')
            .join('spaces', 'saved_queries.space_id', 'spaces.space_id')
            .where('spaces.space_uuid', spaceUuid)
            .whereNull('saved_queries.deleted_at')
            .modify((queryBuilder) => {
                if (process.env.CHART_UUID) {
                    void queryBuilder.where(
                        'saved_queries.saved_query_uuid',
                        process.env.CHART_UUID,
                    );
                }
            })
            .orderBy('saved_queries.name')
            .first();
        const signChartEmbedUrl = (chartUuid: string, actor: WriteActor) =>
            `${LIGHTDASH_URL}/embed/${projectUuid}/chart/${chartUuid}#${jwt.sign(
                {
                    content: {
                        type: 'chart',
                        projectUuid,
                        contentId: chartUuid,
                    },
                    writeActions: {
                        ...actor,
                        spaceUuid,
                    },
                    user: {
                        email: 'demo@lightdash.com',
                    },
                },
                rawSecret,
                { expiresIn: '24h' },
            )}`;
        const chartEmbedUrl = chart
            ? signChartEmbedUrl(chart.saved_query_uuid, writeActor)
            : null;
        const chartNoSqlEmbedUrl =
            chart && noCompiledSqlWriteActor
                ? signChartEmbedUrl(
                      chart.saved_query_uuid,
                      noCompiledSqlWriteActor,
                  )
                : null;

        const sourceSpaces = await db('spaces')
            .select('spaces.space_uuid')
            .join('projects', 'spaces.project_id', 'projects.project_id')
            .join('saved_queries', 'saved_queries.space_id', 'spaces.space_id')
            .where('projects.project_uuid', projectUuid)
            .whereNot('spaces.space_uuid', spaceUuid)
            .whereNull('spaces.deleted_at')
            .whereNull('saved_queries.deleted_at')
            .groupBy('spaces.space_uuid')
            .orderByRaw('count(saved_queries.saved_query_id) desc')
            .limit(3);
        const sourceSpacesEmbedUrl =
            sourceSpaces.length > 0
                ? `${LIGHTDASH_URL}/embed/${projectUuid}#${jwt.sign(
                      {
                          ...dashboardPayload,
                          writeActions: {
                              ...dashboardPayload.writeActions,
                              sourceSpaceUuids: sourceSpaces.map(
                                  (space) => space.space_uuid,
                              ),
                          },
                      },
                      rawSecret,
                      { expiresIn: '24h' },
                  )}`
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
                    metricsCatalogEmbedUrl,
                    metricsCatalogNoSqlEmbedUrl,
                    chartEmbedUrl,
                    chartNoSqlEmbedUrl,
                    sourceSpacesEmbedUrl,
                    aiAgentPermissionEmbedUrls,
                },
                null,
                2,
            ),
        );

        console.log(`\nAdd to packages/sdk-test-app/.env.local:`);
        console.log(`VITE_EMBED_URL="${embedUrl}"`);
        console.log(
            `VITE_METRICS_CATALOG_EMBED_URL="${metricsCatalogEmbedUrl}"`,
        );
        if (metricsCatalogNoSqlEmbedUrl) {
            console.log(
                `VITE_METRICS_CATALOG_NO_SQL_EMBED_URL="${metricsCatalogNoSqlEmbedUrl}"`,
            );
        }
        if (chartEmbedUrl) {
            console.log(`VITE_CHART_EMBED_URL="${chartEmbedUrl}"`);
        }
        if (chartNoSqlEmbedUrl) {
            console.log(`VITE_CHART_NO_SQL_EMBED_URL="${chartNoSqlEmbedUrl}"`);
        }
        if (!noCompiledSqlWriteActor) {
            console.warn(
                'No org editor found: skipping the no compiled SQL scope URLs.',
            );
        }
        if (sourceSpacesEmbedUrl) {
            console.log(
                `VITE_DASHBOARD_BUILDER_SOURCE_SPACES_EMBED_URL="${sourceSpacesEmbedUrl}"`,
            );
        }
        if (aiAgent) {
            console.log(`VITE_AI_AGENT_EMBED_URL="${aiAgentEmbedUrl}"`);
        }
        if (Object.keys(aiAgentPermissionEmbedUrls).length > 0) {
            console.log(
                `VITE_AI_AGENT_PERMISSION_EMBED_URLS='${JSON.stringify(
                    aiAgentPermissionEmbedUrls,
                )}'`,
            );
        }
    } finally {
        await db.destroy();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
