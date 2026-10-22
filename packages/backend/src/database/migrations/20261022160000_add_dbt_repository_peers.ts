import { type Knex } from 'knex';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Adds repository metadata and nullable peer identity without changing legacy connections or inserting sources visible to older binaries',
};

const BATCH_SIZE = 100;
const GIT_PROVIDERS = ['github', 'gitlab', 'bitbucket', 'azure_devops'];

type Project = {
    project_uuid: string;
    dbt_source_uuid: string | null;
    organization_uuid: string;
};

type Source = {
    project_dbt_source_uuid: string;
    warehouse_connection_uuid: string | null;
    dbt_connection_type: string | null;
    dbt_connection: Buffer | null;
    dbt_repository_uuid: string | null;
};

type Repository = {
    provider: string;
    host: string;
    owner: string;
    name: string;
    defaultBranch: string | null;
};

const normalize = (value: string): string => value.trim().toLowerCase();

const inSequence = <T>(items: T[], step: (item: T) => Promise<void>) =>
    items.reduce<Promise<void>>(
        (previous, item) => previous.then(() => step(item)),
        Promise.resolve(),
    );

const readSecrets = (): string[] => {
    const active = process.env.LIGHTDASH_SECRET;
    const raw = process.env.LIGHTDASH_SECRET_FALLBACKS;
    let fallbacks: unknown = [];
    if (raw !== undefined) {
        try {
            fallbacks = JSON.parse(raw);
        } catch {
            throw new Error('Invalid LIGHTDASH_SECRET_FALLBACKS JSON');
        }
    }
    if (
        !Array.isArray(fallbacks) ||
        fallbacks.some((secret) => typeof secret !== 'string' || !secret.length)
    ) {
        throw new Error('LIGHTDASH_SECRET_FALLBACKS must contain strings');
    }
    return [...(active ? [active] : []), ...(fallbacks as string[])];
};

const decryptConnection = (
    encrypted: Buffer,
    secret: string,
): string | null => {
    try {
        const key = pbkdf2Sync(
            secret,
            encrypted.subarray(0, 64),
            2000,
            32,
            'sha512',
        );
        const decipher = createDecipheriv(
            'aes-256-gcm',
            key,
            encrypted.subarray(80, 92),
        );
        decipher.setAuthTag(encrypted.subarray(64, 80));
        return Buffer.concat([
            decipher.update(encrypted.subarray(92)),
            decipher.final(),
        ]).toString('utf8');
    } catch {
        return null;
    }
};

const repositoryFromConnection = (
    encrypted: Buffer | null,
    provider: string,
    secrets: string[],
): Repository | null => {
    if (!encrypted || encrypted.length < 93) return null;
    for (const secret of secrets) {
        const plaintext = decryptConnection(encrypted, secret);
        if (plaintext !== null) {
            let parsed: unknown;
            try {
                parsed = JSON.parse(plaintext);
            } catch {
                return null;
            }
            if (
                !parsed ||
                typeof parsed !== 'object' ||
                Array.isArray(parsed)
            ) {
                return null;
            }
            const fields = parsed as Record<string, unknown>;
            if (typeof fields.repository !== 'string') return null;
            let path = fields.repository.trim().replace(/\.git$/i, '');
            let host: string;
            let owner: string;
            let name: string;
            if (provider === 'azure_devops') {
                if (
                    typeof fields.organization !== 'string' ||
                    typeof fields.project !== 'string'
                ) {
                    return null;
                }
                host = 'dev.azure.com';
                owner = `${fields.organization.trim()}/${fields.project.trim()}`;
                name = path;
            } else {
                const defaults: Record<string, string> = {
                    github: 'github.com',
                    gitlab: 'gitlab.com',
                    bitbucket: 'bitbucket.org',
                };
                host =
                    typeof fields.host_domain === 'string' &&
                    fields.host_domain.trim()
                        ? normalize(fields.host_domain).replace(/\.$/, '')
                        : defaults[provider];
                if (/^https?:\/\//i.test(path)) {
                    try {
                        const url = new URL(path);
                        host = url.host;
                        path = url.pathname
                            .replace(/^\//, '')
                            .replace(/\.git$/i, '');
                    } catch {
                        return null;
                    }
                } else if (/^git@[^:]+:/i.test(path)) {
                    const separator = path.indexOf(':');
                    host = path.slice(4, separator);
                    path = path.slice(separator + 1);
                }
                const parts = path.split('/');
                if (
                    parts.length < 2 ||
                    parts.some((part) => !part.trim()) ||
                    (provider !== 'gitlab' && parts.length !== 2)
                ) {
                    return null;
                }
                name = parts.pop()!;
                owner = parts.join('/');
            }
            host = normalize(host).replace(/\.$/, '');
            if (
                !host ||
                !owner.trim() ||
                !name.trim() ||
                /[\s/@?#]/.test(host) ||
                /[:@?#]/.test(owner) ||
                /[/:@?#]/.test(name)
            ) {
                return null;
            }
            return {
                provider,
                host,
                owner: normalize(owner),
                name: normalize(name),
                defaultBranch:
                    typeof fields.branch === 'string' && fields.branch.length
                        ? fields.branch
                        : null,
            };
        }
    }
    return null;
};

const withSession = async (
    knex: Knex,
    run: (connection: unknown) => Promise<void>,
): Promise<void> => {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await knex.raw("SET lock_timeout = '5s'").connection(connection);
        await run(connection);
    } finally {
        try {
            await knex.raw('RESET lock_timeout').connection(connection);
        } finally {
            try {
                await knex
                    .raw('RESET statement_timeout')
                    .connection(connection);
            } finally {
                await knex.client.releaseConnection(connection);
            }
        }
    }
};

const ensureIndex = async (
    knex: Knex,
    connection: unknown,
    name: string,
    definition: string,
): Promise<void> => {
    const invalid = await knex
        .raw(
            `SELECT 1 FROM pg_index WHERE indexrelid = to_regclass(?) AND NOT indisvalid`,
            [name],
        )
        .connection(connection);
    if (invalid.rows.length) {
        await knex
            .raw(`DROP INDEX CONCURRENTLY IF EXISTS ${name}`)
            .connection(connection);
    }
    console.log(`Creating ${name}`);
    await knex
        .raw(
            `CREATE ${definition.startsWith('UNIQUE') ? 'UNIQUE ' : ''}INDEX CONCURRENTLY IF NOT EXISTS ${name} ${definition.replace(/^UNIQUE /, '')}`,
        )
        .connection(connection);
};

const addConstraint = async (
    knex: Knex,
    connection: unknown,
    name: string,
    definition: string,
): Promise<void> => {
    const existing = await knex
        .raw(
            `SELECT 1 FROM pg_constraint WHERE conrelid = 'project_dbt_sources'::regclass AND conname = ?`,
            [name],
        )
        .connection(connection);
    if (!existing.rows.length) {
        await knex
            .raw(
                `ALTER TABLE project_dbt_sources ADD CONSTRAINT ${name} ${definition} NOT VALID`,
            )
            .connection(connection);
    }
    console.log(`Validating ${name}`);
    await knex
        .raw(`ALTER TABLE project_dbt_sources VALIDATE CONSTRAINT ${name}`)
        .connection(connection);
};

const backfillProject = async (
    knex: Knex,
    connection: unknown,
    project: Project,
    secrets: string[],
): Promise<void> => {
    const candidates = new Map<string, Set<string>>();
    const evidence = await knex
        .raw(
            `SELECT dbt_source_uuid::text AS source_uuid, lower(btrim(project_name)) AS project_name
             FROM dbt_source_ref_catalogs WHERE project_uuid = ?
             UNION
             SELECT COALESCE(explore->'tables'->COALESCE(explore->>'baseTable', name)->>'dbtSourceUuid', explore->>'dbtSourceUuid'),
                    lower(btrim(explore->'tables'->COALESCE(explore->>'baseTable', name)->>'dbtPackageName'))
             FROM cached_explore WHERE project_uuid = ?
               AND COALESCE(explore->>'type', '') NOT IN ('virtual', 'external_source')`,
            [project.project_uuid, project.project_uuid],
        )
        .connection(connection);
    for (const row of evidence.rows as {
        source_uuid: string | null;
        project_name: string | null;
    }[]) {
        if (row.source_uuid && row.project_name) {
            const names = candidates.get(row.source_uuid) ?? new Set<string>();
            names.add(row.project_name);
            candidates.set(row.source_uuid, names);
        }
    }
    const names = new Map<string, string>();
    for (const [source, values] of candidates) {
        if (values.size === 1) names.set(source, [...values][0]);
    }
    const groups = new Map<string, string[]>();
    if (project.dbt_source_uuid && names.has(project.dbt_source_uuid)) {
        groups.set(`${names.get(project.dbt_source_uuid)}:original`, [
            project.dbt_source_uuid,
        ]);
    }
    const sourceIds: string[] = [];
    const failedSources: string[] = [];
    const processSources = async (cursor: string | null): Promise<void> => {
        const batch = await knex
            .raw(
                `SELECT project_dbt_source_uuid, warehouse_connection_uuid,
                        dbt_connection_type, dbt_connection, dbt_repository_uuid
                 FROM project_dbt_sources
                 WHERE project_uuid = ? AND (?::uuid IS NULL OR project_dbt_source_uuid > ?::uuid)
                 ORDER BY project_dbt_source_uuid LIMIT ${BATCH_SIZE}`,
                [project.project_uuid, cursor, cursor],
            )
            .connection(connection);
        const sources = batch.rows as Source[];
        if (!sources.length) return;
        await inSequence(sources, async (source) => {
            const sourceUuid = source.project_dbt_source_uuid;
            sourceIds.push(sourceUuid);
            const name = names.get(sourceUuid);
            if (name && sourceUuid !== project.dbt_source_uuid) {
                const group = `${name}:${source.warehouse_connection_uuid ?? 'original'}`;
                const members = groups.get(group) ?? [];
                members.push(sourceUuid);
                groups.set(group, members);
            }
            const isGit = GIT_PROVIDERS.includes(
                source.dbt_connection_type ?? '',
            );
            let repositoryUuid = source.dbt_repository_uuid;
            if (isGit && !repositoryUuid) {
                const repository = repositoryFromConnection(
                    source.dbt_connection,
                    source.dbt_connection_type!,
                    secrets,
                );
                if (repository) {
                    const inserted = await knex
                        .raw(
                            `INSERT INTO dbt_repositories
                             (organization_uuid, provider, host, owner, name, default_branch,
                              credential_source_uuid, created_by_project_uuid)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                             ON CONFLICT (organization_uuid, provider, host, owner, name)
                             DO UPDATE SET provider = EXCLUDED.provider
                             RETURNING dbt_repository_uuid`,
                            [
                                project.organization_uuid,
                                repository.provider,
                                repository.host,
                                repository.owner,
                                repository.name,
                                repository.defaultBranch,
                                sourceUuid,
                                project.project_uuid,
                            ],
                        )
                        .connection(connection);
                    repositoryUuid = inserted.rows[0].dbt_repository_uuid;
                } else {
                    failedSources.push(sourceUuid);
                }
            }
            const refreshPolicy = isGit ? 'git_refresh' : 'ci_managed';
            await knex<{
                project_dbt_source_uuid: string;
                dbt_repository_uuid: string | null;
                refresh_policy: string;
            }>('project_dbt_sources')
                .where('project_dbt_source_uuid', sourceUuid)
                .whereRaw(
                    '(dbt_repository_uuid, refresh_policy) IS DISTINCT FROM (?::uuid, ?::text)',
                    [repositoryUuid, refreshPolicy],
                )
                .update({
                    dbt_repository_uuid: repositoryUuid,
                    refresh_policy: refreshPolicy,
                })
                .connection(connection);
        });
        await processSources(
            sources[sources.length - 1].project_dbt_source_uuid,
        );
    };
    await processSources(null);
    const conflicts = new Set(
        [...groups.values()].filter((members) => members.length > 1).flat(),
    );
    const offsets = Array.from(
        { length: Math.ceil(sourceIds.length / BATCH_SIZE) },
        (_, index) => index * BATCH_SIZE,
    );
    await inSequence(offsets, async (offset) => {
        await knex
            .raw(
                `UPDATE project_dbt_sources SET dbt_project_name = NULL, dbt_project_name_conflict = NULL
                 WHERE project_dbt_source_uuid = ANY(?::uuid[])
                   AND (dbt_project_name, dbt_project_name_conflict) IS DISTINCT FROM (NULL::text, NULL::text)`,
                [sourceIds.slice(offset, offset + BATCH_SIZE)],
            )
            .connection(connection);
    });
    await inSequence(sourceIds, async (sourceUuid) => {
        const name = names.get(sourceUuid);
        if (!name) return;
        const projectName = conflicts.has(sourceUuid) ? null : name;
        const conflictName = conflicts.has(sourceUuid) ? name : null;
        await knex
            .raw(
                `UPDATE project_dbt_sources SET dbt_project_name = ?, dbt_project_name_conflict = ?
                 WHERE project_dbt_source_uuid = ?
                   AND (dbt_project_name, dbt_project_name_conflict) IS DISTINCT FROM (?::text, ?::text)`,
                [
                    projectName,
                    conflictName,
                    sourceUuid,
                    projectName,
                    conflictName,
                ],
            )
            .connection(connection);
    });
    if (conflicts.size) {
        console.warn(
            JSON.stringify({
                event: 'dbt_peer_name_conflicts',
                projectUuid: project.project_uuid,
                conflictCount: conflicts.size,
                sourceUuids: [...conflicts].sort(),
            }),
        );
    }
    if (failedSources.length) {
        console.warn(
            JSON.stringify({
                event: 'dbt_peer_repository_backfill_skipped',
                projectUuid: project.project_uuid,
                sourceCount: failedSources.length,
                sourceUuids: failedSources,
            }),
        );
    }
};

export async function up(knex: Knex): Promise<void> {
    const secrets = readSecrets();
    await withSession(knex, async (connection) => {
        await knex
            .raw(`
            CREATE TABLE IF NOT EXISTS dbt_repositories (
                dbt_repository_uuid uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                organization_uuid uuid NOT NULL REFERENCES organizations(organization_uuid) ON DELETE CASCADE,
                provider text NOT NULL CHECK (provider IN ('github', 'gitlab', 'bitbucket', 'azure_devops')),
                host text NOT NULL CHECK (host <> '' AND host = lower(btrim(host))),
                owner text NOT NULL CHECK (owner <> '' AND owner = lower(btrim(owner))),
                name text NOT NULL CHECK (name <> '' AND name = lower(btrim(name))),
                default_branch text NULL,
                dbt_project_name text NULL CHECK (dbt_project_name <> '' AND dbt_project_name = lower(btrim(dbt_project_name))),
                credential_project_uuid uuid NULL REFERENCES projects(project_uuid) ON DELETE SET NULL,
                credential_source_uuid uuid NULL REFERENCES project_dbt_sources(project_dbt_source_uuid) ON DELETE SET NULL,
                created_by_project_uuid uuid NULL REFERENCES projects(project_uuid) ON DELETE SET NULL,
                is_shared boolean NOT NULL DEFAULT false,
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now(),
                CHECK (credential_project_uuid IS NULL OR credential_source_uuid IS NULL),
                UNIQUE (organization_uuid, provider, host, owner, name)
            )
        `)
            .connection(connection);
        await inSequence(
            [
                'organization_uuid',
                'credential_project_uuid',
                'credential_source_uuid',
                'created_by_project_uuid',
            ],
            async (column) => {
                await ensureIndex(
                    knex,
                    connection,
                    `dbt_repositories_${column}_idx`,
                    `ON dbt_repositories (${column})`,
                );
            },
        );
        await knex
            .raw(`
            ALTER TABLE project_dbt_sources
                ADD COLUMN IF NOT EXISTS dbt_repository_uuid uuid NULL,
                ADD COLUMN IF NOT EXISTS dbt_project_name text NULL,
                ADD COLUMN IF NOT EXISTS dbt_project_name_conflict text NULL,
                ADD COLUMN IF NOT EXISTS membership_role text NOT NULL DEFAULT 'publish',
                ADD COLUMN IF NOT EXISTS refresh_policy text NOT NULL DEFAULT 'ci_managed'
        `)
            .connection(connection);
        await addConstraint(
            knex,
            connection,
            'project_dbt_sources_repository_fkey',
            'FOREIGN KEY (dbt_repository_uuid) REFERENCES dbt_repositories(dbt_repository_uuid) ON DELETE SET NULL',
        );
        await addConstraint(
            knex,
            connection,
            'project_dbt_sources_peer_name_check',
            "CHECK (dbt_project_name IS NULL OR (dbt_project_name <> '' AND dbt_project_name = lower(btrim(dbt_project_name))))",
        );
        await addConstraint(
            knex,
            connection,
            'project_dbt_sources_peer_conflict_check',
            "CHECK (dbt_project_name_conflict IS NULL OR (dbt_project_name_conflict <> '' AND dbt_project_name_conflict = lower(btrim(dbt_project_name_conflict))))",
        );
        await addConstraint(
            knex,
            connection,
            'project_dbt_sources_membership_role_check',
            "CHECK (membership_role IN ('publish', 'dependency_only'))",
        );
        await addConstraint(
            knex,
            connection,
            'project_dbt_sources_refresh_policy_check',
            "CHECK (refresh_policy IN ('git_refresh', 'ci_managed'))",
        );
        await ensureIndex(
            knex,
            connection,
            'project_dbt_sources_dbt_repository_uuid_idx',
            'ON project_dbt_sources (dbt_repository_uuid)',
        );
        const processProjects = async (
            cursor: string | null,
        ): Promise<void> => {
            const result = await knex
                .raw(
                    `
                SELECT p.project_uuid, p.dbt_source_uuid, o.organization_uuid
                FROM projects p JOIN organizations o USING (organization_id)
                WHERE (?::uuid IS NULL OR p.project_uuid > ?::uuid)
                ORDER BY p.project_uuid LIMIT ${BATCH_SIZE}
            `,
                    [cursor, cursor],
                )
                .connection(connection);
            const projects = result.rows as Project[];
            if (!projects.length) return;
            await inSequence(projects, (project) =>
                backfillProject(knex, connection, project, secrets),
            );
            await processProjects(projects[projects.length - 1].project_uuid);
        };
        await processProjects(null);
        await ensureIndex(
            knex,
            connection,
            'project_dbt_sources_peer_name_connection_unique',
            "UNIQUE ON project_dbt_sources (project_uuid, lower(dbt_project_name), COALESCE(warehouse_connection_uuid, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE dbt_project_name IS NOT NULL",
        );
        const processRepositories = async (
            repositoryCursor: string | null,
        ): Promise<void> => {
            const repositories = await knex
                .raw(
                    `
                SELECT dbt_repository_uuid FROM dbt_repositories
                WHERE (?::uuid IS NULL OR dbt_repository_uuid > ?::uuid)
                ORDER BY dbt_repository_uuid LIMIT ${BATCH_SIZE}
            `,
                    [repositoryCursor, repositoryCursor],
                )
                .connection(connection);
            if (!repositories.rows.length) return;
            await inSequence(
                repositories.rows as {
                    dbt_repository_uuid: string;
                }[],
                async (row) => {
                    await knex
                        .raw(
                            `
                    WITH evidence AS (
                        SELECT lower(btrim(c.project_name)) AS project_name
                        FROM project_dbt_sources s JOIN dbt_source_ref_catalogs c
                          ON c.project_uuid = s.project_uuid AND c.dbt_source_uuid = s.project_dbt_source_uuid
                        WHERE s.dbt_repository_uuid = ?
                        UNION
                        SELECT lower(btrim(e.explore->'tables'->COALESCE(e.explore->>'baseTable', e.name)->>'dbtPackageName'))
                        FROM project_dbt_sources s JOIN cached_explore e
                          ON e.project_uuid = s.project_uuid
                         AND COALESCE(e.explore->'tables'->COALESCE(e.explore->>'baseTable', e.name)->>'dbtSourceUuid', e.explore->>'dbtSourceUuid') = s.project_dbt_source_uuid::text
                        WHERE s.dbt_repository_uuid = ? AND COALESCE(e.explore->>'type', '') NOT IN ('virtual', 'external_source')
                    ), learned AS (
                        SELECT CASE WHEN count(DISTINCT project_name) = 1
                            THEN min(project_name) ELSE NULL END AS project_name
                        FROM evidence WHERE project_name <> ''
                    )
                    UPDATE dbt_repositories SET dbt_project_name = learned.project_name
                    FROM learned WHERE dbt_repository_uuid = ?
                      AND dbt_project_name IS DISTINCT FROM learned.project_name
                `,
                            [
                                row.dbt_repository_uuid,
                                row.dbt_repository_uuid,
                                row.dbt_repository_uuid,
                            ],
                        )
                        .connection(connection);
                },
            );
            await processRepositories(
                repositories.rows[repositories.rows.length - 1]
                    .dbt_repository_uuid,
            );
        };
        await processRepositories(null);
    });
}

export async function down(knex: Knex): Promise<void> {
    await withSession(knex, async (connection) => {
        await knex
            .raw(`
            ALTER TABLE project_dbt_sources
                DROP COLUMN IF EXISTS dbt_repository_uuid,
                DROP COLUMN IF EXISTS dbt_project_name,
                DROP COLUMN IF EXISTS dbt_project_name_conflict,
                DROP COLUMN IF EXISTS membership_role,
                DROP COLUMN IF EXISTS refresh_policy
        `)
            .connection(connection);
        await knex
            .raw('DROP TABLE IF EXISTS dbt_repositories')
            .connection(connection);
    });
}
