import {
    AlreadyExistsError,
    ApiConnectorType,
    ConflictError,
    DATA_APP_VIZ_TEMPLATE,
    EXTERNAL_CONNECTION_DEFAULTS,
    generateSlug,
    getAppDisplayName,
    NotFoundError,
    ParameterError,
    type ApiSourceSchemaScan,
    type CreateExternalConnection,
    type ExternalConnection,
    type ExternalConnectionApiSource,
    type ExternalConnectionApiUsage,
    type ExternalConnectionKind,
    type ExternalConnectionLinkedApps,
    type ExternalConnectionListItem,
    type ExternalConnectionSample,
    type ExternalConnectionSampleRequest,
    type ProjectType,
    type UpdateExternalConnection,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { z } from 'zod';
import {
    AppsTableName,
    type DbApp as DbDataApp,
} from '../../database/entities/apps';
import { SpaceTableName } from '../../database/entities/spaces';
import {
    getApiSourceIntegration,
    parseStoredApiSource,
} from '../../services/QuerySourceService/api/apiSourceIntegrations';
import {
    parseLiveSourceFieldState,
    type LiveSourceFieldEdits,
    type LiveSourceFieldState,
    type LiveSourceScan,
} from '../../services/QuerySourceService/api/liveSourceFields';
import {
    normalizeCredentialUrlHref,
    normalizeCredentialUrlOrigin,
} from '../../utils/credentialDestination';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    ApiSourceCallCountersTableName,
    ApiSourceCallLeasesTableName,
    ApiSourceCallsTableName,
    AppExternalConnectionsTableName,
    ExternalConnectionRateCountersTableName,
    ExternalConnectionSamplesTableName,
    ExternalConnectionSecretsTableName,
    ExternalConnectionsTableName,
    type ApiSourceCallsTable,
    type DbExternalConnection,
    type DbExternalConnectionSample,
} from '../database/entities/externalConnections';

type ExternalConnectionModelArguments = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
};

// A stored shape no connector understands reads as no api source, so the
// connection fails with a clear error instead of reaching a connector.
const parseApiSource = (value: unknown): ExternalConnectionApiSource | null =>
    value === null ? null : parseStoredApiSource(value);

const apiSourceSchemaScanSchema = z.discriminatedUnion('status', [
    z.object({ status: z.literal('pending'), requestedAt: z.coerce.date() }),
    z.object({
        status: z.literal('ready'),
        scannedAt: z.coerce.date(),
        windowDays: z.number(),
        events: z.array(z.object({ name: z.string(), count: z.number() })),
        eventsTruncated: z.boolean(),
        propertyKeys: z.array(z.string()).nullable(),
    }),
    z.object({
        status: z.literal('failed'),
        scannedAt: z.coerce.date(),
        error: z.string(),
    }),
]);

export const API_SOURCE_SCHEMA_SCAN_TIMEOUT_MS = 5 * 60 * 1000;
// Leaves room for queue wait; a scan pending longer lost its worker
const STALE_PENDING_SCAN_MS = 3 * API_SOURCE_SCHEMA_SCAN_TIMEOUT_MS;

export const parseApiSourceSchemaScan = (
    value: unknown,
    now: Date = new Date(),
): ApiSourceSchemaScan | null => {
    if (value === null) return null;
    const parsed = apiSourceSchemaScanSchema.safeParse(value);
    if (!parsed.success) return null;
    const scan = parsed.data;
    if (
        scan.status === 'pending' &&
        now.getTime() - scan.requestedAt.getTime() > STALE_PENDING_SCAN_MS
    ) {
        return {
            status: 'failed',
            scannedAt: scan.requestedAt,
            error: 'The schema scan did not finish',
        };
    }
    return scan;
};

/**
 * Keys the server keeps inside `api_source` next to the connector settings.
 * Settings writes replace the settings only, so these survive every update.
 */
const SERVER_OWNED_API_SOURCE_KEYS = [
    'sourceName',
    'lastScan',
    'fields',
    'aiHint',
    'targetLabel',
] as const;

const readSourceName = (value: unknown): string | null => {
    const parsed = z.object({ sourceName: z.string() }).safeParse(value);
    return parsed.success ? parsed.data.sourceName : null;
};

const readSourceDetails = (value: unknown) => {
    const { aiHint, targetLabel } = parseLiveSourceFieldState(value);
    return { aiHint, targetLabel };
};

/** Connector settings only: drops any server-owned key a caller sent. */
const toApiSourceSettingsJson = (apiSource: ExternalConnectionApiSource) =>
    JSON.stringify(
        getApiSourceIntegration(apiSource.connector).settingsSchema.parse(
            apiSource,
        ),
    );

/** A deleted live source, kept so a new one can reattach to its name. */
export type DeletedLiveSource = {
    externalConnectionUuid: string;
    name: string;
    deletedAt: Date;
    origin: string;
    apiSource: ExternalConnectionApiSource;
    sourceName: string | null;
    /** Null when the source was deleted before fields could be curated. */
    fieldEdits: LiveSourceFieldEdits | null;
    aiHint: string | null;
    targetLabel: string | null;
};

const kindOf = (
    apiSource: ExternalConnectionApiSource | null | undefined,
): ExternalConnectionKind => (apiSource ? 'live_source' : 'data_app');

type DbApp = {
    app_id: string;
    project_uuid: string;
    space_uuid: string | null;
    created_by_user_uuid: string;
    organization_uuid: string;
};

/**
 * Owns all DB access for external connections, their secrets (kept in a
 * separate table and never returned in the read shape), app↔connection
 * links, the per-minute rate counters consumed by the M2 proxy, and the
 * named samples collection used by the generate pipeline.
 */
export class ExternalConnectionModel {
    private readonly database: Knex;

    private readonly encryptionUtil: EncryptionUtil;

    constructor(args: ExternalConnectionModelArguments) {
        this.database = args.database;
        this.encryptionUtil = args.encryptionUtil;
    }

    // eslint-disable-next-line class-methods-use-this
    private static mapToExternalConnection(
        row: DbExternalConnection,
        hasSecret: boolean,
    ): ExternalConnection {
        return {
            externalConnectionUuid: row.external_connection_uuid,
            projectUuid: row.project_uuid,
            organizationUuid: row.organization_uuid,
            name: row.name,
            slug: row.slug,
            type: row.type,
            origin: row.origin,
            allowBrowserImages: row.allow_browser_images,
            allowDataAppBuilderLinking: row.allow_data_app_builder_linking,
            forwardUserIdentity: row.forward_user_identity,
            instructions: row.instructions,
            allowedPathPrefixes: row.allowed_path_prefixes,
            allowedMethods: row.allowed_methods,
            allowedContentTypes: row.allowed_content_types,
            responseMaxBytes: row.response_max_bytes,
            requestMaxBytes: row.request_max_bytes,
            timeoutMs: row.timeout_ms,
            rateLimitPerMinute: row.rate_limit_per_minute,
            apiKeyName: row.api_key_name,
            apiKeyLocation: row.api_key_location,
            oauthScopes: row.oauth_scopes,
            oauthTokenUrl: row.oauth_token_url,
            oauthClientId: row.oauth_client_id,
            oauthClientAuthMethod: row.oauth_client_auth_method,
            customHeaders: row.custom_headers,
            kind: row.connection_kind,
            apiSource: parseApiSource(row.api_source),
            liveSourceName: readSourceName(row.api_source),
            ...readSourceDetails(row.api_source),
            hasSecret,
            createdByUserUuid: row.created_by_user_uuid,
            updatedByUserUuid: row.updated_by_user_uuid,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    private static mapToExternalConnectionSample(
        row: DbExternalConnectionSample,
    ): ExternalConnectionSample {
        return {
            sampleUuid: row.sample_uuid,
            externalConnectionUuid: row.external_connection_uuid,
            label: row.label,
            // Postgres returns jsonb columns as parsed objects at runtime.
            request: row.request as ExternalConnectionSampleRequest,
            response: row.response,
            createdAt: row.created_at,
        };
    }

    /**
     * Slug uniqueness deliberately spans soft-deleted rows (no `deleted_at`
     * filter) even though the DB index is partial — deleted connections could
     * be restored, so their slugs stay reserved. Same house rule as charts
     * (see generateUniqueSlugScopedToProject in utils/SlugUtils.ts).
     */
    private static async generateUniqueSlug(
        trx: Knex,
        projectUuid: string,
        name: string,
    ): Promise<string> {
        const baseSlug = generateSlug(name);
        const matchingSlugs: string[] = await trx(ExternalConnectionsTableName)
            .where('project_uuid', projectUuid)
            .where('slug', 'like', `${baseSlug}%`)
            .pluck('slug');
        let slug = baseSlug;
        let inc = 0;
        while (matchingSlugs.includes(slug)) {
            inc += 1;
            slug = `${baseSlug}-${inc}`;
        }
        return slug;
    }

    /**
     * `options.slug` forces an exact slug (content-as-code create); without it
     * a unique slug is generated from the name. Forced-slug inserts are
     * race-safe via the partial unique index — a losing concurrent insert
     * surfaces as AlreadyExistsError instead of a duplicate row.
     */
    async create(
        projectUuid: string,
        organizationUuid: string,
        userUuid: string,
        data: CreateExternalConnection,
        options?: { slug?: string },
    ): Promise<ExternalConnection> {
        return this.database.transaction(async (trx) => {
            const slug =
                options?.slug ??
                (await ExternalConnectionModel.generateUniqueSlug(
                    trx,
                    projectUuid,
                    data.name,
                ));
            let row: DbExternalConnection;
            try {
                [row] = await trx(ExternalConnectionsTableName)
                    .insert({
                        project_uuid: projectUuid,
                        organization_uuid: organizationUuid,
                        name: data.name,
                        slug,
                        type: data.type,
                        origin: data.origin,
                        connection_kind: kindOf(data.apiSource),
                        allow_browser_images: data.allowBrowserImages ?? false,
                        allow_data_app_builder_linking:
                            data.allowDataAppBuilderLinking ?? false,
                        forward_user_identity:
                            data.forwardUserIdentity ?? false,
                        instructions: data.instructions ?? null,
                        allowed_path_prefixes: JSON.stringify(
                            data.allowedPathPrefixes,
                        ),
                        allowed_methods: JSON.stringify(data.allowedMethods),
                        allowed_content_types: JSON.stringify(
                            data.allowedContentTypes,
                        ),
                        response_max_bytes:
                            data.responseMaxBytes ??
                            EXTERNAL_CONNECTION_DEFAULTS.responseMaxBytes,
                        request_max_bytes:
                            data.requestMaxBytes ??
                            EXTERNAL_CONNECTION_DEFAULTS.requestMaxBytes,
                        timeout_ms:
                            data.timeoutMs ??
                            EXTERNAL_CONNECTION_DEFAULTS.timeoutMs,
                        rate_limit_per_minute: data.rateLimitPerMinute ?? null,
                        api_key_name: data.apiKeyName ?? null,
                        api_key_location: data.apiKeyLocation ?? null,
                        oauth_scopes: data.oauthScopes?.length
                            ? JSON.stringify(data.oauthScopes)
                            : null,
                        oauth_token_url: data.oauthTokenUrl ?? null,
                        oauth_client_id: data.oauthClientId ?? null,
                        oauth_client_auth_method:
                            data.oauthClientAuthMethod ?? null,
                        custom_headers:
                            data.customHeaders &&
                            Object.keys(data.customHeaders).length
                                ? JSON.stringify(data.customHeaders)
                                : null,
                        api_source: data.apiSource
                            ? toApiSourceSettingsJson(data.apiSource)
                            : null,
                        created_by_user_uuid: userUuid,
                        updated_by_user_uuid: userUuid,
                    })
                    .returning('*');
            } catch (e) {
                if (
                    e instanceof Error &&
                    'code' in e &&
                    e.code === '23505' &&
                    'constraint' in e &&
                    e.constraint ===
                        'external_connections_project_uuid_slug_unique'
                ) {
                    throw new AlreadyExistsError(
                        `An external connection with slug "${slug}" already exists in this project`,
                    );
                }
                throw e;
            }

            // Never store a secret for a no-auth connection, even if one is
            // supplied — it could only ever be dead weight or a leak risk.
            const secret = data.type === 'none' ? null : (data.secret ?? null);
            if (secret) {
                await trx(ExternalConnectionSecretsTableName).insert({
                    external_connection_uuid: row.external_connection_uuid,
                    encrypted_payload: this.encryptionUtil.encrypt(secret),
                });
            }

            return ExternalConnectionModel.mapToExternalConnection(
                row,
                Boolean(secret),
            );
        });
    }

    /**
     * Copy every (non-deleted) connection in `sourceProjectUuid` into
     * `targetProjectUuid` — with its secret and saved samples — and return a
     * source→target connection-uuid map. Used when a preview project is
     * created: the copied data apps re-link to the preview's own connections
     * instead of the upstream project's (which are separate, project-scoped
     * entities the preview can't reference). The secret ciphertext is copied
     * verbatim — `EncryptionUtil` is instance-wide, so the payload is portable
     * across projects on the same instance (no decrypt/re-encrypt).
     */
    async copyConnectionsToProject(
        sourceProjectUuid: string,
        targetProjectUuid: string,
    ): Promise<Map<string, string>> {
        return this.database.transaction(async (trx) => {
            const sources = await trx(ExternalConnectionsTableName)
                .where('project_uuid', sourceProjectUuid)
                .whereNull('deleted_at')
                .select<DbExternalConnection[]>('*');

            const map = new Map<string, string>();
            /* eslint-disable no-await-in-loop */
            for (const src of sources) {
                const [row] = await trx(ExternalConnectionsTableName)
                    .insert({
                        project_uuid: targetProjectUuid,
                        organization_uuid: src.organization_uuid,
                        name: src.name,
                        // Clones keep the source slug: the target preview
                        // project starts with no connections, so per-project
                        // uniqueness holds.
                        slug: src.slug,
                        type: src.type,
                        origin: src.origin,
                        connection_kind: src.connection_kind,
                        allow_browser_images: src.allow_browser_images,
                        allow_data_app_builder_linking:
                            src.allow_data_app_builder_linking,
                        forward_user_identity: src.forward_user_identity,
                        instructions: src.instructions,
                        allowed_path_prefixes: JSON.stringify(
                            src.allowed_path_prefixes,
                        ),
                        allowed_methods: JSON.stringify(src.allowed_methods),
                        allowed_content_types: JSON.stringify(
                            src.allowed_content_types,
                        ),
                        response_max_bytes: src.response_max_bytes,
                        request_max_bytes: src.request_max_bytes,
                        timeout_ms: src.timeout_ms,
                        rate_limit_per_minute: src.rate_limit_per_minute,
                        api_key_name: src.api_key_name,
                        api_key_location: src.api_key_location,
                        oauth_scopes: src.oauth_scopes
                            ? JSON.stringify(src.oauth_scopes)
                            : null,
                        oauth_token_url: src.oauth_token_url,
                        oauth_client_id: src.oauth_client_id,
                        oauth_client_auth_method: src.oauth_client_auth_method,
                        custom_headers: src.custom_headers
                            ? JSON.stringify(src.custom_headers)
                            : null,
                        api_source: src.api_source
                            ? JSON.stringify(src.api_source)
                            : null,
                        created_by_user_uuid: src.created_by_user_uuid,
                        updated_by_user_uuid: src.updated_by_user_uuid,
                    })
                    .returning<{ external_connection_uuid: string }[]>(
                        'external_connection_uuid',
                    );
                const targetUuid = row.external_connection_uuid;
                map.set(src.external_connection_uuid, targetUuid);

                const secret = await trx(ExternalConnectionSecretsTableName)
                    .where(
                        'external_connection_uuid',
                        src.external_connection_uuid,
                    )
                    .first<{ encrypted_payload: Buffer } | undefined>(
                        'encrypted_payload',
                    );
                // Signed-in tokens stay with one connection: refresh tokens
                // rotate, so a shared copy would break whichever refreshes last.
                if (secret && src.type !== 'oauth_authorization_code') {
                    await trx(ExternalConnectionSecretsTableName).insert({
                        external_connection_uuid: targetUuid,
                        encrypted_payload: secret.encrypted_payload,
                    });
                }

                // Carry saved samples so in-preview iteration keeps the same
                // code-gen grounding as upstream.
                const samples = await trx(ExternalConnectionSamplesTableName)
                    .where(
                        'external_connection_uuid',
                        src.external_connection_uuid,
                    )
                    .select<DbExternalConnectionSample[]>('*');
                if (samples.length > 0) {
                    await trx(ExternalConnectionSamplesTableName).insert(
                        samples.map((sample) => ({
                            external_connection_uuid: targetUuid,
                            label: sample.label,
                            request: JSON.stringify(sample.request),
                            response: JSON.stringify(sample.response),
                            created_by_user_uuid: sample.created_by_user_uuid,
                        })),
                    );
                }
            }
            /* eslint-enable no-await-in-loop */
            return map;
        });
    }

    async list(
        projectUuid: string,
        organizationUuid: string,
        filters: { kind: ExternalConnectionKind | null },
    ): Promise<ExternalConnectionListItem[]> {
        const linkedDataAppCounts = this.database(
            AppExternalConnectionsTableName,
        )
            .select(
                `${AppExternalConnectionsTableName}.external_connection_uuid`,
                // Chart types can link connections too — count them apart so
                // the "linked apps" column doesn't lump them in as data apps.
                this.database.raw(
                    'COUNT(DISTINCT ??) FILTER (WHERE ??.template IS DISTINCT FROM ?) AS ??',
                    [
                        `${AppsTableName}.app_id`,
                        AppsTableName,
                        DATA_APP_VIZ_TEMPLATE,
                        'linked_data_app_count',
                    ],
                ),
                this.database.raw(
                    'COUNT(DISTINCT ??) FILTER (WHERE ??.template = ?) AS ??',
                    [
                        `${AppsTableName}.app_id`,
                        AppsTableName,
                        DATA_APP_VIZ_TEMPLATE,
                        'linked_chart_type_count',
                    ],
                ),
            )
            .innerJoin(
                AppsTableName,
                `${AppsTableName}.app_id`,
                `${AppExternalConnectionsTableName}.app_id`,
            )
            .whereNull(`${AppsTableName}.deleted_at`)
            .groupBy(
                `${AppExternalConnectionsTableName}.external_connection_uuid`,
            )
            .as('linked_data_app_counts');

        const rows = await this.database(ExternalConnectionsTableName)
            .leftJoin(
                ExternalConnectionSecretsTableName,
                `${ExternalConnectionSecretsTableName}.external_connection_uuid`,
                `${ExternalConnectionsTableName}.external_connection_uuid`,
            )
            .leftJoin(
                linkedDataAppCounts,
                `${ExternalConnectionsTableName}.external_connection_uuid`,
                'linked_data_app_counts.external_connection_uuid',
            )
            .where(`${ExternalConnectionsTableName}.project_uuid`, projectUuid)
            .where(
                `${ExternalConnectionsTableName}.organization_uuid`,
                organizationUuid,
            )
            .whereNull(`${ExternalConnectionsTableName}.deleted_at`)
            .modify((query) => {
                if (filters.kind !== null) {
                    void query.where(
                        `${ExternalConnectionsTableName}.connection_kind`,
                        filters.kind,
                    );
                }
            })
            .orderBy(`${ExternalConnectionsTableName}.created_at`, 'desc')
            .select<
                Array<
                    DbExternalConnection & {
                        encrypted_payload: Buffer | null;
                        linked_data_app_count: string;
                        linked_chart_type_count: string;
                    }
                >
            >(
                `${ExternalConnectionsTableName}.*`,
                `${ExternalConnectionSecretsTableName}.encrypted_payload`,
                this.database.raw('COALESCE(??, 0) AS ??', [
                    'linked_data_app_counts.linked_data_app_count',
                    'linked_data_app_count',
                ]),
                this.database.raw('COALESCE(??, 0) AS ??', [
                    'linked_data_app_counts.linked_chart_type_count',
                    'linked_chart_type_count',
                ]),
            );

        return rows.map((row) => ({
            ...ExternalConnectionModel.mapToExternalConnection(
                row,
                row.encrypted_payload !== null,
            ),
            linkedDataAppCount: Number(row.linked_data_app_count),
            linkedChartTypeCount: Number(row.linked_chart_type_count),
        }));
    }

    async listLinkedApps(
        externalConnectionUuid: string,
    ): Promise<ExternalConnectionLinkedApps> {
        const rows = await this.database(AppExternalConnectionsTableName)
            .innerJoin(
                AppsTableName,
                `${AppsTableName}.app_id`,
                `${AppExternalConnectionsTableName}.app_id`,
            )
            .leftJoin(SpaceTableName, function spaceJoin() {
                void this.on(
                    `${SpaceTableName}.space_uuid`,
                    '=',
                    `${AppsTableName}.space_uuid`,
                ).andOnNull(`${SpaceTableName}.deleted_at`);
            })
            .where(
                `${AppExternalConnectionsTableName}.external_connection_uuid`,
                externalConnectionUuid,
            )
            .whereNull(`${AppsTableName}.deleted_at`)
            .select<
                Array<{
                    app_id: string;
                    name: string;
                    slug: string;
                    template: DbDataApp['template'];
                    space_uuid: string | null;
                    space_name: string | null;
                    alias: string;
                }>
            >(
                `${AppsTableName}.app_id`,
                `${AppsTableName}.name`,
                `${AppsTableName}.slug`,
                `${AppsTableName}.template`,
                `${AppsTableName}.space_uuid`,
                `${SpaceTableName}.name as space_name`,
                `${AppExternalConnectionsTableName}.alias`,
            )
            .orderBy(`${AppsTableName}.name`, 'asc')
            .orderBy(`${AppExternalConnectionsTableName}.alias`, 'asc');

        const linkedApps = new Map<
            string,
            ExternalConnectionLinkedApps['items'][number]
        >();

        rows.forEach((row) => {
            const existing = linkedApps.get(row.app_id);
            if (existing) {
                existing.aliases.push(row.alias);
                return;
            }

            linkedApps.set(row.app_id, {
                appUuid: row.app_id,
                name: row.name,
                slug: row.slug,
                kind:
                    row.template === DATA_APP_VIZ_TEMPLATE
                        ? 'project_chart_type'
                        : 'data_app',
                spaceUuid: row.space_uuid,
                spaceName: row.space_name,
                aliases: [row.alias],
            });
        });

        const items = [...linkedApps.values()].sort((left, right) => {
            if (left.kind !== right.kind) {
                return left.kind === 'data_app' ? -1 : 1;
            }

            return getAppDisplayName(left.name, left.appUuid).localeCompare(
                getAppDisplayName(right.name, right.appUuid),
            );
        });

        return { items, total: items.length };
    }

    /**
     * Resolve a project's organization from the DB. Used to derive (not trust
     * the caller for) the org when authorizing and creating connections, so an
     * org admin cannot operate on another org's project by passing its UUID.
     */
    async getProjectOrganizationUuid(
        projectUuid: string,
    ): Promise<string | null> {
        const row = await this.database('projects')
            .innerJoin(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .where('projects.project_uuid', projectUuid)
            .first<{ organization_uuid: string } | undefined>(
                'organizations.organization_uuid',
            );
        return row?.organization_uuid ?? null;
    }

    async findProjectAbilityContext(projectUuid: string): Promise<{
        organizationUuid: string;
        projectType: ProjectType;
        projectCreatedByUserUuid: string | null;
        upstreamProjectUuid: string | null;
    } | null> {
        const row = await this.database('projects')
            .innerJoin(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .where('projects.project_uuid', projectUuid)
            .first<
                | {
                      organization_uuid: string;
                      project_type: ProjectType;
                      created_by_user_uuid: string | null;
                      copied_from_project_uuid: string | null;
                  }
                | undefined
            >(
                'organizations.organization_uuid',
                'projects.project_type',
                'projects.created_by_user_uuid',
                'projects.copied_from_project_uuid',
            );
        if (!row) return null;
        return {
            organizationUuid: row.organization_uuid,
            projectType: row.project_type,
            projectCreatedByUserUuid: row.created_by_user_uuid,
            upstreamProjectUuid: row.copied_from_project_uuid,
        };
    }

    /** Strips the secret — returns the READ shape only. */
    async findByUuid(uuid: string): Promise<ExternalConnection | undefined> {
        const row = await this.database(ExternalConnectionsTableName)
            .leftJoin(
                ExternalConnectionSecretsTableName,
                `${ExternalConnectionSecretsTableName}.external_connection_uuid`,
                `${ExternalConnectionsTableName}.external_connection_uuid`,
            )
            .where(
                `${ExternalConnectionsTableName}.external_connection_uuid`,
                uuid,
            )
            .whereNull(`${ExternalConnectionsTableName}.deleted_at`)
            .first<
                | (DbExternalConnection & { encrypted_payload: Buffer | null })
                | undefined
            >(
                `${ExternalConnectionsTableName}.*`,
                `${ExternalConnectionSecretsTableName}.encrypted_payload`,
            );

        if (!row) {
            return undefined;
        }
        return ExternalConnectionModel.mapToExternalConnection(
            row,
            row.encrypted_payload !== null,
        );
    }

    /** Strips the secret — returns the READ shape only. Live rows only. */
    async findBySlug(
        projectUuid: string,
        organizationUuid: string,
        slug: string,
    ): Promise<ExternalConnection | undefined> {
        const row = await this.database(ExternalConnectionsTableName)
            .leftJoin(
                ExternalConnectionSecretsTableName,
                `${ExternalConnectionSecretsTableName}.external_connection_uuid`,
                `${ExternalConnectionsTableName}.external_connection_uuid`,
            )
            .where(`${ExternalConnectionsTableName}.project_uuid`, projectUuid)
            .where(
                `${ExternalConnectionsTableName}.organization_uuid`,
                organizationUuid,
            )
            .where(`${ExternalConnectionsTableName}.slug`, slug)
            .whereNull(`${ExternalConnectionsTableName}.deleted_at`)
            .first<
                | (DbExternalConnection & { encrypted_payload: Buffer | null })
                | undefined
            >(
                `${ExternalConnectionsTableName}.*`,
                `${ExternalConnectionSecretsTableName}.encrypted_payload`,
            );

        if (!row) {
            return undefined;
        }
        return ExternalConnectionModel.mapToExternalConnection(
            row,
            row.encrypted_payload !== null,
        );
    }

    /**
     * INTERNAL ONLY — returns the decrypted secret. Used by the M2 proxy
     * (`ExternalConnectionService.proxyFetch`). Never exposed via the API.
     * Returns null if the connection is soft-deleted or has no secret.
     */
    async getDecryptedSecret(uuid: string): Promise<string | null> {
        const row = await this.database(ExternalConnectionSecretsTableName)
            .join(
                ExternalConnectionsTableName,
                `${ExternalConnectionsTableName}.external_connection_uuid`,
                `${ExternalConnectionSecretsTableName}.external_connection_uuid`,
            )
            .whereNull(`${ExternalConnectionsTableName}.deleted_at`)
            .where(
                `${ExternalConnectionSecretsTableName}.external_connection_uuid`,
                uuid,
            )
            .first<{ encrypted_payload: Buffer } | undefined>(
                `${ExternalConnectionSecretsTableName}.encrypted_payload`,
            );
        if (!row) {
            return null;
        }
        return this.encryptionUtil.decrypt(row.encrypted_payload);
    }

    async update(
        uuid: string,
        userUuid: string,
        data: UpdateExternalConnection,
    ): Promise<ExternalConnection> {
        await this.database.transaction(async (trx) => {
            const existing = await trx(ExternalConnectionsTableName)
                .where('external_connection_uuid', uuid)
                .whereNull('deleted_at')
                .first();
            if (!existing) {
                throw new NotFoundError('External connection not found');
            }

            const updatePayload: Record<string, unknown> = {
                updated_by_user_uuid: userUuid,
                updated_at: trx.fn.now() as unknown as Date,
            };
            if (data.name !== undefined) updatePayload.name = data.name;
            if (data.type !== undefined) updatePayload.type = data.type;
            if (data.origin !== undefined) updatePayload.origin = data.origin;
            if (data.allowBrowserImages !== undefined)
                updatePayload.allow_browser_images = data.allowBrowserImages;
            if (data.allowDataAppBuilderLinking !== undefined)
                updatePayload.allow_data_app_builder_linking =
                    data.allowDataAppBuilderLinking;
            if (data.forwardUserIdentity !== undefined)
                updatePayload.forward_user_identity = data.forwardUserIdentity;
            if (data.instructions !== undefined)
                updatePayload.instructions = data.instructions;
            if (data.allowedPathPrefixes !== undefined)
                updatePayload.allowed_path_prefixes = JSON.stringify(
                    data.allowedPathPrefixes,
                );
            if (data.allowedMethods !== undefined)
                updatePayload.allowed_methods = JSON.stringify(
                    data.allowedMethods,
                );
            if (data.allowedContentTypes !== undefined)
                updatePayload.allowed_content_types = JSON.stringify(
                    data.allowedContentTypes,
                );
            if (data.responseMaxBytes !== undefined)
                updatePayload.response_max_bytes = data.responseMaxBytes;
            if (data.requestMaxBytes !== undefined)
                updatePayload.request_max_bytes = data.requestMaxBytes;
            if (data.timeoutMs !== undefined)
                updatePayload.timeout_ms = data.timeoutMs;
            if (data.rateLimitPerMinute !== undefined)
                updatePayload.rate_limit_per_minute = data.rateLimitPerMinute;
            if (data.apiKeyName !== undefined)
                updatePayload.api_key_name = data.apiKeyName;
            if (data.apiKeyLocation !== undefined)
                updatePayload.api_key_location = data.apiKeyLocation;
            if (data.oauthScopes !== undefined)
                updatePayload.oauth_scopes = data.oauthScopes?.length
                    ? JSON.stringify(data.oauthScopes)
                    : null;
            if (data.oauthTokenUrl !== undefined)
                updatePayload.oauth_token_url = data.oauthTokenUrl;
            if (data.oauthClientId !== undefined)
                updatePayload.oauth_client_id = data.oauthClientId;
            if (data.oauthClientAuthMethod !== undefined)
                updatePayload.oauth_client_auth_method =
                    data.oauthClientAuthMethod;
            if (data.customHeaders !== undefined)
                updatePayload.custom_headers =
                    data.customHeaders && Object.keys(data.customHeaders).length
                        ? JSON.stringify(data.customHeaders)
                        : null;
            if (data.apiSource !== undefined)
                updatePayload.api_source = data.apiSource
                    ? trx.raw(
                          `?::jsonb || COALESCE((SELECT jsonb_object_agg(key, value) FROM jsonb_each(??) WHERE key = ANY(?::text[])), '{}'::jsonb)`,
                          [
                              toApiSourceSettingsJson(data.apiSource),
                              `${ExternalConnectionsTableName}.api_source`,
                              [...SERVER_OWNED_API_SOURCE_KEYS],
                          ],
                      )
                    : null;

            await trx(ExternalConnectionsTableName)
                .where('external_connection_uuid', uuid)
                .update(updatePayload);

            if (data.aiHint !== undefined) {
                await trx(ExternalConnectionsTableName)
                    .where('external_connection_uuid', uuid)
                    .update({
                        api_source: (data.aiHint
                            ? trx.raw(
                                  `api_source || jsonb_build_object('aiHint', ?::text)`,
                                  [data.aiHint],
                              )
                            : trx.raw(
                                  `api_source - 'aiHint'`,
                              )) as unknown as string,
                    });
            }

            // Secret tri-state: `null` clears it, a non-empty string sets it,
            // and undefined/blank leaves it unchanged unless the credential's
            // auth type or credential destination changes.
            const resultingType = data.type ?? existing.type;
            const typeChanged =
                data.type !== undefined && data.type !== existing.type;
            const originChanged =
                data.origin !== undefined &&
                normalizeCredentialUrlOrigin(data.origin) !==
                    normalizeCredentialUrlOrigin(existing.origin);
            const keepsOAuthClientCredentialsType =
                existing.type === 'oauth_client_credentials' &&
                resultingType === 'oauth_client_credentials';
            const oauthTokenUrlChanged =
                keepsOAuthClientCredentialsType &&
                data.oauthTokenUrl !== undefined &&
                normalizeCredentialUrlHref(data.oauthTokenUrl ?? '') !==
                    normalizeCredentialUrlHref(existing.oauth_token_url ?? '');
            const oauthClientIdChanged =
                keepsOAuthClientCredentialsType &&
                data.oauthClientId !== undefined &&
                data.oauthClientId !== existing.oauth_client_id;
            if (
                resultingType === 'none' ||
                data.secret === null ||
                ((typeChanged ||
                    originChanged ||
                    oauthTokenUrlChanged ||
                    oauthClientIdChanged) &&
                    !data.secret)
            ) {
                await ExternalConnectionModel.deleteSecret(trx, uuid);
            } else if (data.secret) {
                await ExternalConnectionModel.upsertSecret(
                    trx,
                    uuid,
                    this.encryptionUtil.encrypt(data.secret),
                );
            }
        });

        const updated = await this.findByUuid(uuid);
        if (!updated) {
            throw new NotFoundError('External connection not found');
        }
        return updated;
    }

    /**
     * Gives a live source the first candidate no other source of the project
     * holds, once; a name already set is kept. Deleted sources keep holding
     * theirs, so charts on them can't start reading another target. The
     * project lock makes two sources named at the same time pick different
     * names. Null when every candidate is held.
     */
    async claimLiveSourceName(
        projectUuid: string,
        uuid: string,
        candidates: string[],
    ): Promise<string | null> {
        return this.database.transaction(async (trx) => {
            await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
                `live_source_name:${projectUuid}`,
            ]);
            const rows = await trx(ExternalConnectionsTableName)
                .select('external_connection_uuid', 'api_source')
                .where('project_uuid', projectUuid)
                .whereNotNull('api_source');
            const current = rows.find(
                (row) => row.external_connection_uuid === uuid,
            );
            const currentName = readSourceName(current?.api_source);
            if (currentName) {
                return currentName;
            }
            const held = new Set(
                rows.flatMap((row) => {
                    const name = readSourceName(row.api_source);
                    return name ? [name] : [];
                }),
            );
            const sourceName =
                candidates.find((candidate) => !held.has(candidate)) ?? null;
            if (sourceName) {
                await trx(ExternalConnectionsTableName)
                    .where('external_connection_uuid', uuid)
                    .update({
                        api_source: trx.raw(
                            `jsonb_set(api_source, '{sourceName}', to_jsonb(?::text))`,
                            [sourceName],
                        ) as unknown as string,
                    });
            }
            return sourceName;
        });
    }

    /** Every explore prefix held in the project, by active or deleted sources. */
    async listHeldLiveSourceNames(
        projectUuid: string,
        exceptUuid: string | null,
    ): Promise<Set<string>> {
        const rows = await this.database(ExternalConnectionsTableName)
            .select('external_connection_uuid', 'api_source')
            .where('project_uuid', projectUuid)
            .whereNotNull('api_source');
        return new Set(
            rows.flatMap((row) => {
                const name = readSourceName(row.api_source);
                return name && row.external_connection_uuid !== exceptUuid
                    ? [name]
                    : [];
            }),
        );
    }

    /**
     * Moves a deleted source's name, and its field edits when it has any, to
     * a new source. False when another active source holds the name.
     */
    async reattachLiveSourceName(
        projectUuid: string,
        uuid: string,
        sourceName: string,
        fieldEdits: LiveSourceFieldEdits | null,
    ): Promise<boolean> {
        return this.database.transaction(async (trx) => {
            await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
                `live_source_name:${projectUuid}`,
            ]);
            const rows = await trx(ExternalConnectionsTableName)
                .select('external_connection_uuid', 'api_source')
                .where('project_uuid', projectUuid)
                .whereNull('deleted_at')
                .whereNotNull('api_source');
            const isHeld = rows.some(
                (row) =>
                    row.external_connection_uuid !== uuid &&
                    readSourceName(row.api_source) === sourceName,
            );
            if (isHeld) {
                return false;
            }
            const withName = trx.raw(
                `jsonb_set(api_source, '{sourceName}', to_jsonb(?::text))`,
                [sourceName],
            );
            await trx(ExternalConnectionsTableName)
                .where('external_connection_uuid', uuid)
                .update({
                    api_source: (fieldEdits
                        ? trx.raw(`jsonb_set(?, '{fields}', ?::jsonb)`, [
                              withName,
                              JSON.stringify(fieldEdits),
                          ])
                        : withName) as unknown as string,
                });
            return true;
        });
    }

    /** Stores the name the connection picker showed for the source's target. */
    async saveLiveSourceTargetLabel(
        uuid: string,
        targetLabel: string,
    ): Promise<void> {
        await this.database(ExternalConnectionsTableName)
            .where('external_connection_uuid', uuid)
            .update({
                api_source: this.database.raw(
                    `api_source || jsonb_build_object('targetLabel', ?::text)`,
                    [targetLabel],
                ) as unknown as string,
            });
    }

    /** Gives a source a deleted twin's details, keeping any it already has. */
    async restoreLiveSourceDetails(
        uuid: string,
        details: { aiHint: string | null; targetLabel: string | null },
    ): Promise<void> {
        await this.database(ExternalConnectionsTableName)
            .where('external_connection_uuid', uuid)
            .update({
                api_source: this.database.raw(
                    `jsonb_strip_nulls(jsonb_build_object('aiHint', ?::text, 'targetLabel', ?::text)) || api_source`,
                    [details.aiHint, details.targetLabel],
                ) as unknown as string,
            });
    }

    /** Every active live source, in any project. */
    async listLiveSourceRefs(): Promise<
        {
            externalConnectionUuid: string;
            projectUuid: string;
            connector: ApiConnectorType;
        }[]
    > {
        const rows = await this.database(ExternalConnectionsTableName)
            .where('connection_kind', 'live_source')
            .whereNull('deleted_at')
            .whereNotNull('api_source')
            .select<
                {
                    external_connection_uuid: string;
                    project_uuid: string;
                    connector: ApiConnectorType;
                }[]
            >(
                'external_connection_uuid',
                'project_uuid',
                this.database.raw("api_source->>'connector' as connector"),
            );
        return rows.map((row) => ({
            externalConnectionUuid: row.external_connection_uuid,
            projectUuid: row.project_uuid,
            connector: row.connector,
        }));
    }

    /**
     * Runs a rebuild alone for this source, so a rebuild that read older
     * field edits can't overwrite one that read newer edits.
     */
    async withLiveSourceBuildLock<T>(
        uuid: string,
        rebuild: () => Promise<T>,
    ): Promise<T> {
        return this.database.transaction(async (trx) => {
            await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
                `live_source_build:${uuid}`,
            ]);
            return rebuild();
        });
    }

    async getLiveSourceFieldState(uuid: string): Promise<LiveSourceFieldState> {
        const row = await this.database(ExternalConnectionsTableName)
            .select('api_source')
            .where('external_connection_uuid', uuid)
            .first();
        return parseLiveSourceFieldState(row?.api_source ?? null);
    }

    async saveLiveSourceScan(
        uuid: string,
        scan: LiveSourceScan,
    ): Promise<void> {
        await this.database(ExternalConnectionsTableName)
            .where('external_connection_uuid', uuid)
            .whereNotNull('api_source')
            .update({
                api_source: this.database.raw(
                    `jsonb_set(api_source, '{lastScan}', ?::jsonb)`,
                    [JSON.stringify(scan)],
                ) as unknown as string,
            });
    }

    /** Starts curation with these edits; a source already curated keeps its own. */
    async initLiveSourceFieldEdits(
        uuid: string,
        edits: LiveSourceFieldEdits,
    ): Promise<void> {
        await this.database(ExternalConnectionsTableName)
            .where('external_connection_uuid', uuid)
            .whereNotNull('api_source')
            .whereRaw("NOT jsonb_exists(api_source, 'fields')")
            .update({
                api_source: this.database.raw(
                    `jsonb_set(api_source, '{fields}', ?::jsonb)`,
                    [JSON.stringify(edits)],
                ) as unknown as string,
            });
    }

    /**
     * Applies field edits under a row lock, so two editors never lose each
     * other's changes. Returns the edits as saved.
     */
    async updateLiveSourceFieldEdits(
        uuid: string,
        update: (current: LiveSourceFieldEdits) => LiveSourceFieldEdits,
    ): Promise<LiveSourceFieldEdits> {
        return this.database.transaction(async (trx) => {
            const row = await trx(ExternalConnectionsTableName)
                .select('api_source')
                .where('external_connection_uuid', uuid)
                .whereNull('deleted_at')
                .forUpdate()
                .first();
            if (!row?.api_source) {
                throw new NotFoundError('Live data source not found');
            }
            const next = update(
                parseLiveSourceFieldState(row.api_source).fields ?? {},
            );
            await trx(ExternalConnectionsTableName)
                .where('external_connection_uuid', uuid)
                .update({
                    api_source: trx.raw(
                        `jsonb_set(api_source, '{fields}', ?::jsonb)`,
                        [JSON.stringify(next)],
                    ) as unknown as string,
                });
            return next;
        });
    }

    /** Deleted live sources of a project, most recently deleted first. */
    async listDeletedLiveSources(
        projectUuid: string,
    ): Promise<DeletedLiveSource[]> {
        const rows = await this.database(ExternalConnectionsTableName)
            .select(
                'external_connection_uuid',
                'name',
                'deleted_at',
                'origin',
                'api_source',
            )
            .where('project_uuid', projectUuid)
            .whereNotNull('deleted_at')
            .whereNotNull('api_source')
            .orderBy('deleted_at', 'desc');
        return rows.flatMap((row) => {
            const apiSource = parseApiSource(row.api_source);
            return apiSource
                ? [
                      {
                          externalConnectionUuid: row.external_connection_uuid,
                          name: row.name,
                          deletedAt: row.deleted_at as Date,
                          origin: row.origin,
                          apiSource,
                          sourceName: readSourceName(row.api_source),
                          fieldEdits: parseLiveSourceFieldState(row.api_source)
                              .fields,
                          ...readSourceDetails(row.api_source),
                      },
                  ]
                : [];
        });
    }

    async softDelete(uuid: string): Promise<void> {
        await this.database.transaction(async (trx) => {
            const count = await trx(ExternalConnectionsTableName)
                .where('external_connection_uuid', uuid)
                .whereNull('deleted_at')
                .update({ deleted_at: trx.fn.now() as unknown as Date });
            if (count === 0) {
                throw new NotFoundError('External connection not found');
            }
            // Remove app links so the freed (app_id, alias) slots can be
            // relinked. Otherwise the rows linger but are hidden by the
            // deleted_at filter in listAppLinks/resolveAppAlias, while
            // linkToApp's onConflict(...).ignore() silently no-ops a re-link.
            await trx(AppExternalConnectionsTableName)
                .where('external_connection_uuid', uuid)
                .delete();
            // There is no restore, so the credentials and the call log go now.
            // The row stays only to keep its slug and, for a live source, its
            // name and field edits for reattach.
            await ExternalConnectionModel.deleteSecret(trx, uuid);
            await trx(ApiSourceCallsTableName)
                .where('external_connection_uuid', uuid)
                .delete();
        });
    }

    async rotateSecret(uuid: string, secret: string): Promise<void> {
        await ExternalConnectionModel.upsertSecret(
            this.database,
            uuid,
            this.encryptionUtil.encrypt(secret),
            true,
        );
    }

    /**
     * Runs `update` with the current secret while holding its row lock, and
     * stores what it returns unless that is null. Returns the stored secret.
     */
    async updateSecretLocked(
        uuid: string,
        update: (current: string | null) => Promise<string | null>,
    ): Promise<string | null> {
        return this.database.transaction(async (trx) => {
            const row = await trx(ExternalConnectionSecretsTableName)
                .where('external_connection_uuid', uuid)
                .forUpdate()
                .first<{ encrypted_payload: Buffer } | undefined>(
                    'encrypted_payload',
                );
            const current = row
                ? this.encryptionUtil.decrypt(row.encrypted_payload)
                : null;
            const next = await update(current);
            if (next === null) return current;
            await ExternalConnectionModel.upsertSecret(
                trx,
                uuid,
                this.encryptionUtil.encrypt(next),
            );
            return next;
        });
    }

    private static async upsertSecret(
        db: Knex,
        uuid: string,
        encryptedPayload: Buffer,
        markRotated = false,
    ): Promise<void> {
        await db(ExternalConnectionSecretsTableName)
            .insert({
                external_connection_uuid: uuid,
                encrypted_payload: encryptedPayload,
                ...(markRotated ? { rotated_at: db.fn.now() } : {}),
            })
            .onConflict('external_connection_uuid')
            .merge({
                encrypted_payload: encryptedPayload,
                ...(markRotated ? { rotated_at: db.fn.now() } : {}),
            });
    }

    private static async deleteSecret(db: Knex, uuid: string): Promise<void> {
        await db(ExternalConnectionSecretsTableName)
            .where('external_connection_uuid', uuid)
            .delete();
    }

    // -----------------------------------------------------------------------
    // Samples collection
    // -----------------------------------------------------------------------

    async saveSample(
        connectionUuid: string,
        userUuid: string | null,
        data: {
            label: string | null;
            request: ExternalConnectionSampleRequest;
            response: unknown;
        },
    ): Promise<ExternalConnectionSample> {
        const [row] = await this.database(ExternalConnectionSamplesTableName)
            .insert({
                external_connection_uuid: connectionUuid,
                label: data.label ?? null,
                request: JSON.stringify(data.request),
                response: JSON.stringify(data.response),
                created_by_user_uuid: userUuid ?? null,
            })
            .returning('*');
        return ExternalConnectionModel.mapToExternalConnectionSample(row);
    }

    async listSamples(
        connectionUuid: string,
    ): Promise<ExternalConnectionSample[]> {
        const rows = await this.database(ExternalConnectionSamplesTableName)
            .where('external_connection_uuid', connectionUuid)
            .orderBy('created_at', 'desc')
            .select<DbExternalConnectionSample[]>('*');
        return rows.map(ExternalConnectionModel.mapToExternalConnectionSample);
    }

    async countSamples(connectionUuid: string): Promise<number> {
        const [{ count }] = await this.database(
            ExternalConnectionSamplesTableName,
        )
            .where('external_connection_uuid', connectionUuid)
            .count<[{ count: string }]>('* as count');
        return Number(count);
    }

    async deleteSample(sampleUuid: string): Promise<void> {
        const count = await this.database(ExternalConnectionSamplesTableName)
            .where('sample_uuid', sampleUuid)
            .delete();
        if (count === 0) {
            throw new NotFoundError('Sample not found');
        }
    }

    /**
     * Returns the most-recent `limit` samples for a connection, for the
     * generate pipeline to ground Claude in the API's shape.
     */
    async getSamplesForPipeline(
        connectionUuid: string,
        limit: number,
    ): Promise<ExternalConnectionSample[]> {
        const rows = await this.database(ExternalConnectionSamplesTableName)
            .where('external_connection_uuid', connectionUuid)
            .orderBy('created_at', 'desc')
            .limit(limit)
            .select<DbExternalConnectionSample[]>('*');
        return rows.map(ExternalConnectionModel.mapToExternalConnectionSample);
    }

    /**
     * Returns the connection UUID that owns the given sample, or undefined if
     * the sample does not exist. Used by the service to verify cross-project
     * access before deletion.
     */
    async getSampleConnectionUuid(
        sampleUuid: string,
    ): Promise<string | undefined> {
        const row = await this.database(ExternalConnectionSamplesTableName)
            .where('sample_uuid', sampleUuid)
            .first<{ external_connection_uuid: string } | undefined>(
                'external_connection_uuid',
            );
        return row?.external_connection_uuid;
    }

    // -----------------------------------------------------------------------
    // App links
    // -----------------------------------------------------------------------

    async linkToApp(
        appId: string,
        externalConnectionUuid: string,
        alias: string,
    ): Promise<void> {
        await ExternalConnectionModel.assertLinkableToApps(this.database, [
            externalConnectionUuid,
        ]);
        const inserted = await this.database(AppExternalConnectionsTableName)
            .insert({
                app_id: appId,
                external_connection_uuid: externalConnectionUuid,
                alias,
            })
            .onConflict(['app_id', 'alias'])
            .ignore()
            .returning('external_connection_uuid');

        if (inserted.length > 0) return;

        const existing = await this.database(AppExternalConnectionsTableName)
            .where('app_id', appId)
            .where('alias', alias)
            .first<{ external_connection_uuid: string } | undefined>(
                'external_connection_uuid',
            );

        // Preserve idempotency for retries of the same link, but never report
        // success when this alias points at a different connection.
        if (existing?.external_connection_uuid === externalConnectionUuid) {
            return;
        }

        throw new ConflictError(
            `Alias "${alias}" is already linked to another external connection for this app`,
        );
    }

    /**
     * Reconciles an app's links to exactly match `links`: removes links whose
     * alias is absent, and upserts the rest — repointing an existing alias to
     * a different connection, unlike `linkToApp`'s conflict-ignore.
     */
    async replaceAppLinks(
        appId: string,
        links: Array<{ externalConnectionUuid: string; alias: string }>,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            await ExternalConnectionModel.assertLinkableToApps(
                trx,
                links.map((link) => link.externalConnectionUuid),
            );
            await trx(AppExternalConnectionsTableName)
                .where('app_id', appId)
                .modify((query) => {
                    if (links.length > 0) {
                        void query.whereNotIn(
                            'alias',
                            links.map((link) => link.alias),
                        );
                    }
                })
                .delete();
            if (links.length > 0) {
                await trx(AppExternalConnectionsTableName)
                    .insert(
                        links.map((link) => ({
                            app_id: appId,
                            external_connection_uuid:
                                link.externalConnectionUuid,
                            alias: link.alias,
                        })),
                    )
                    .onConflict(['app_id', 'alias'])
                    .merge(['external_connection_uuid']);
            }
        });
    }

    /** Live sources answer live API queries only; apps never reach them. */
    private static async assertLinkableToApps(
        db: Knex,
        externalConnectionUuids: string[],
    ): Promise<void> {
        if (externalConnectionUuids.length === 0) return;
        const liveSource = await db(ExternalConnectionsTableName)
            .whereIn('external_connection_uuid', externalConnectionUuids)
            .where('connection_kind', 'live_source')
            .first<{ name: string } | undefined>('name');
        if (liveSource) {
            throw new ParameterError(
                `Connection "${liveSource.name}" is a live data source and cannot be linked to an app`,
            );
        }
    }

    async unlinkFromApp(appId: string, alias: string): Promise<void> {
        const count = await this.database(AppExternalConnectionsTableName)
            .where('app_id', appId)
            .where('alias', alias)
            .delete();
        if (count === 0) {
            throw new NotFoundError('App external connection link not found');
        }
    }

    async listAppLinks(
        appId: string,
    ): Promise<Array<{ alias: string; connection: ExternalConnection }>> {
        const rows = await this.database(AppExternalConnectionsTableName)
            .innerJoin(
                ExternalConnectionsTableName,
                `${ExternalConnectionsTableName}.external_connection_uuid`,
                `${AppExternalConnectionsTableName}.external_connection_uuid`,
            )
            .leftJoin(
                ExternalConnectionSecretsTableName,
                `${ExternalConnectionSecretsTableName}.external_connection_uuid`,
                `${ExternalConnectionsTableName}.external_connection_uuid`,
            )
            .where(`${AppExternalConnectionsTableName}.app_id`, appId)
            .whereNull(`${ExternalConnectionsTableName}.deleted_at`)
            .select<
                Array<
                    DbExternalConnection & {
                        alias: string;
                        encrypted_payload: Buffer | null;
                    }
                >
            >(
                `${ExternalConnectionsTableName}.*`,
                `${AppExternalConnectionsTableName}.alias`,
                `${ExternalConnectionSecretsTableName}.encrypted_payload`,
            );

        return rows.map((row) => ({
            alias: row.alias,
            connection: ExternalConnectionModel.mapToExternalConnection(
                row,
                row.encrypted_payload !== null,
            ),
        }));
    }

    /**
     * Exact public HTTPS origins a linked app may use in browser image tags.
     * Authentication is deliberately excluded: browser requests bypass the
     * external-fetch proxy and therefore cannot safely carry stored secrets.
     */
    async getBrowserImageOrigins(appId: string): Promise<string[]> {
        const origins = await this.database(AppExternalConnectionsTableName)
            .innerJoin(
                ExternalConnectionsTableName,
                `${ExternalConnectionsTableName}.external_connection_uuid`,
                `${AppExternalConnectionsTableName}.external_connection_uuid`,
            )
            .where(`${AppExternalConnectionsTableName}.app_id`, appId)
            .where(`${ExternalConnectionsTableName}.allow_browser_images`, true)
            .where(`${ExternalConnectionsTableName}.type`, 'none')
            .whereNull(`${ExternalConnectionsTableName}.deleted_at`)
            .distinct<string[]>(`${ExternalConnectionsTableName}.origin`)
            .pluck(`${ExternalConnectionsTableName}.origin`);

        return origins.sort();
    }

    /** Returns the connection if it is linked to the app under `alias` and not soft-deleted. */
    async resolveAppAlias(
        appId: string,
        alias: string,
    ): Promise<ExternalConnection | undefined> {
        const row = await this.database(AppExternalConnectionsTableName)
            .innerJoin(
                ExternalConnectionsTableName,
                `${ExternalConnectionsTableName}.external_connection_uuid`,
                `${AppExternalConnectionsTableName}.external_connection_uuid`,
            )
            .leftJoin(
                ExternalConnectionSecretsTableName,
                `${ExternalConnectionSecretsTableName}.external_connection_uuid`,
                `${ExternalConnectionsTableName}.external_connection_uuid`,
            )
            .where(`${AppExternalConnectionsTableName}.app_id`, appId)
            .where(`${AppExternalConnectionsTableName}.alias`, alias)
            .where(
                `${ExternalConnectionsTableName}.connection_kind`,
                'data_app',
            )
            .whereNull(`${ExternalConnectionsTableName}.deleted_at`)
            .first<
                | (DbExternalConnection & { encrypted_payload: Buffer | null })
                | undefined
            >(
                `${ExternalConnectionsTableName}.*`,
                `${ExternalConnectionSecretsTableName}.encrypted_payload`,
            );

        if (!row) {
            return undefined;
        }
        return ExternalConnectionModel.mapToExternalConnection(
            row,
            row.encrypted_payload !== null,
        );
    }

    /**
     * Looks up an app with its organization UUID for use in assertCanManageApp.
     * Returns undefined if the app is not found or soft-deleted.
     */
    async findApp(appUuid: string): Promise<DbApp | undefined> {
        return this.database(AppsTableName)
            .innerJoin(
                'projects',
                'projects.project_uuid',
                `${AppsTableName}.project_uuid`,
            )
            .innerJoin(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .where(`${AppsTableName}.app_id`, appUuid)
            .whereNull(`${AppsTableName}.deleted_at`)
            .first<DbApp | undefined>(
                `${AppsTableName}.app_id`,
                `${AppsTableName}.project_uuid`,
                `${AppsTableName}.space_uuid`,
                `${AppsTableName}.created_by_user_uuid`,
                'organizations.organization_uuid',
            );
    }

    /**
     * Atomically bumps the per-(connection, app, window) counter and returns
     * the new count. Consumed by the M2 proxy's rate limiter.
     */
    async incrementRateCounter(
        externalConnectionUuid: string,
        appId: string,
        windowStartedAt: Date,
    ): Promise<number> {
        const [row] = await this.database(
            ExternalConnectionRateCountersTableName,
        )
            .insert({
                external_connection_uuid: externalConnectionUuid,
                app_id: appId,
                window_started_at: windowStartedAt,
                request_count: 1,
            })
            .onConflict([
                'external_connection_uuid',
                'app_id',
                'window_started_at',
            ])
            .merge({
                request_count: this.database.raw(
                    `${ExternalConnectionRateCountersTableName}.request_count + 1`,
                ) as unknown as number,
            })
            .returning('request_count');

        return row.request_count;
    }

    async deleteRateCountersBefore(cutoff: Date): Promise<number> {
        return this.database(ExternalConnectionRateCountersTableName)
            .where('window_started_at', '<', cutoff)
            .delete();
    }

    /** Counts one call in the window unless it already holds `limit`; false when it does. */
    async tryCountApiSourceCall(
        externalConnectionUuid: string,
        windowSeconds: number,
        windowStartedAt: Date,
        limit: number,
    ): Promise<boolean> {
        const rows = await this.database(ApiSourceCallCountersTableName)
            .insert({
                external_connection_uuid: externalConnectionUuid,
                window_seconds: windowSeconds,
                window_started_at: windowStartedAt,
                call_count: 1,
            })
            .onConflict([
                'external_connection_uuid',
                'window_seconds',
                'window_started_at',
            ])
            .merge({
                call_count: this.database.raw(
                    `${ApiSourceCallCountersTableName}.call_count + 1`,
                ) as unknown as number,
            })
            .where(`${ApiSourceCallCountersTableName}.call_count`, '<', limit)
            .returning('call_count');
        return rows.length > 0;
    }

    /** Takes a free or expired slot out of `slots`; false when all are held. */
    async tryAcquireApiSourceCallLease(
        externalConnectionUuid: string,
        slots: number,
        leaseUuid: string,
        expiresAt: Date,
    ): Promise<boolean> {
        /* eslint-disable no-await-in-loop */
        for (let slot = 0; slot < slots; slot += 1) {
            const rows = await this.database(ApiSourceCallLeasesTableName)
                .insert({
                    external_connection_uuid: externalConnectionUuid,
                    slot,
                    lease_uuid: leaseUuid,
                    expires_at: expiresAt,
                })
                .onConflict(['external_connection_uuid', 'slot'])
                .merge({ lease_uuid: leaseUuid, expires_at: expiresAt })
                .where(
                    `${ApiSourceCallLeasesTableName}.expires_at`,
                    '<',
                    this.database.fn.now(),
                )
                .returning('slot');
            if (rows.length > 0) return true;
        }
        /* eslint-enable no-await-in-loop */
        return false;
    }

    async releaseApiSourceCallLease(
        externalConnectionUuid: string,
        leaseUuid: string,
    ): Promise<void> {
        await this.database(ApiSourceCallLeasesTableName)
            .where({
                external_connection_uuid: externalConnectionUuid,
                lease_uuid: leaseUuid,
            })
            .delete();
    }

    async deleteApiSourceCallWindowsBefore(cutoff: Date): Promise<number> {
        const [counters, leases] = await Promise.all([
            this.database(ApiSourceCallCountersTableName)
                .where('window_started_at', '<', cutoff)
                .delete(),
            this.database(ApiSourceCallLeasesTableName)
                .where('expires_at', '<', cutoff)
                .delete(),
        ]);
        return counters + leases;
    }

    async insertApiSourceCall(
        call: Knex.ResolveTableType<ApiSourceCallsTable, 'insert'>,
    ): Promise<void> {
        await this.database(ApiSourceCallsTableName).insert(call);
    }

    /** API calls, response bytes and median fetch time per connection, over every logged query in the project. */
    async getApiSourceUsage(
        projectUuid: string,
    ): Promise<ExternalConnectionApiUsage[]> {
        const rows = await this.database(ApiSourceCallsTableName)
            .where('project_uuid', projectUuid)
            .groupBy('external_connection_uuid')
            .select<
                {
                    external_connection_uuid: string;
                    api_calls: string | null;
                    response_bytes: string | null;
                    median_duration_ms: number | null;
                }[]
            >(
                'external_connection_uuid',
                this.database.raw('sum(api_calls) as api_calls'),
                this.database.raw('sum(response_bytes) as response_bytes'),
                // Reused results never reach the integration, so they'd drag the median to 0.
                this.database.raw(
                    'percentile_cont(0.5) within group (order by duration_ms) filter (where api_calls > 0) as median_duration_ms',
                ),
            );
        return rows.map((row) => ({
            externalConnectionUuid: row.external_connection_uuid,
            apiCalls: Number(row.api_calls ?? 0),
            responseBytes: Number(row.response_bytes ?? 0),
            medianDurationMs:
                row.median_duration_ms === null
                    ? null
                    : Math.round(Number(row.median_duration_ms)),
        }));
    }

    async setApiSourceSchema(
        connectionUuid: string,
        scan: ApiSourceSchemaScan,
    ): Promise<void> {
        await this.database(ExternalConnectionsTableName)
            .where('external_connection_uuid', connectionUuid)
            .update({ api_source_schema: JSON.stringify(scan) });
    }

    async getApiSourceSchemas(
        connectionUuids: string[],
    ): Promise<Map<string, ApiSourceSchemaScan | null>> {
        if (connectionUuids.length === 0) return new Map();
        const rows = await this.database(ExternalConnectionsTableName)
            .whereIn('external_connection_uuid', connectionUuids)
            .select('external_connection_uuid', 'api_source_schema');
        return new Map(
            rows.map((row) => [
                row.external_connection_uuid,
                parseApiSourceSchemaScan(row.api_source_schema),
            ]),
        );
    }
}
