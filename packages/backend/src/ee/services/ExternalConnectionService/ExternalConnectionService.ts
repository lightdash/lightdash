import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    TooManyRequestsError,
    type ApiSaveExternalConnectionSampleRequest,
    type CreateExternalConnection,
    type ExternalConnection,
    type ExternalConnectionMethod,
    type ExternalConnectionSample,
    type ExternalConnectionSampleRequest,
    type ExternalFetchRequest,
    type ExternalFetchResponse,
    type LightdashUser,
    type RegisteredAccount,
    type SessionUser,
    type UpdateExternalConnection,
} from '@lightdash/common';
import { performance } from 'node:perf_hooks';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { type AppModel } from '../../../models/AppModel';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { BaseService } from '../../../services/BaseService';
import type { SpacePermissionService } from '../../../services/SpaceService/SpacePermissionService';
import {
    secureFetch,
    SecureFetchError,
} from '../../../utils/secureFetch/secureFetch';
import { type ExternalConnectionModel } from '../../models/ExternalConnectionModel';
import { assertCanViewApp } from '../AppGenerateService/appAuthz';
import { validateExternalConnectionConfig } from './externalConnectionConfigValidation';
import {
    assertSafeApiKeyHeaderName,
    buildOutboundUrl,
    computeMinuteWindow,
    normalizeAndValidatePath,
    serializeRequestBody,
} from './proxyValidation';

type ExternalConnectionServiceArguments = {
    analytics: LightdashAnalytics;
    externalConnectionModel: ExternalConnectionModel;
    featureFlagModel: FeatureFlagModel;
    appModel: AppModel;
    spacePermissionService: SpacePermissionService;
};

export class ExternalConnectionService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly externalConnectionModel: ExternalConnectionModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly appModel: AppModel;

    private readonly spacePermissionService: SpacePermissionService;

    private static readonly DEFAULT_RATE_LIMIT_PER_MINUTE = 60;

    constructor(args: ExternalConnectionServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.externalConnectionModel = args.externalConnectionModel;
        this.featureFlagModel = args.featureFlagModel;
        this.appModel = args.appModel;
        this.spacePermissionService = args.spacePermissionService;
    }

    private async assertExternalAccessEnabledForUser(
        user: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>,
    ): Promise<void> {
        const { enabled } = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.EnableDataAppExternalAccess,
        });
        if (!enabled) {
            throw new ForbiddenError(
                'Data app external access is not enabled for this organization',
            );
        }
    }

    private async assertExternalAccessEnabled(
        account: RegisteredAccount,
    ): Promise<void> {
        return this.assertExternalAccessEnabledForUser({
            userUuid: account.user.userUuid,
            organizationUuid: account.organization.organizationUuid,
        });
    }

    private assertCanManage(
        account: RegisteredAccount,
        projectUuid: string,
        organizationUuid: string,
    ): void {
        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'manage',
                subject('ExternalConnection', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage external connections',
            );
        }
    }

    /**
     * Loads the app row and asserts the caller can `manage` the DataApp,
     * mirroring AppGenerateService's assertCanManageApp pattern (space
     * context + createdByUserUuid). Returns the app row for downstream use.
     */
    private async assertCanManageApp(
        account: RegisteredAccount,
        appUuid: string,
    ): Promise<{
        app_id: string;
        project_uuid: string;
        space_uuid: string | null;
        created_by_user_uuid: string;
        organization_uuid: string;
    }> {
        const app = await this.externalConnectionModel.findApp(appUuid);
        if (!app) {
            throw new NotFoundError('Data app not found');
        }

        const spaceContext = app.space_uuid
            ? await this.spacePermissionService.getSpaceAccessContext(
                  account.user.id,
                  app.space_uuid,
              )
            : {};

        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'manage',
                subject('DataApp', {
                    organizationUuid: app.organization_uuid,
                    projectUuid: app.project_uuid,
                    createdByUserUuid: app.created_by_user_uuid,
                    ...spaceContext,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage this data app',
            );
        }
        return app;
    }

    async create(
        account: RegisteredAccount,
        projectUuid: string,
        data: CreateExternalConnection,
    ): Promise<ExternalConnection> {
        await this.assertExternalAccessEnabled(account);
        // Derive the org from the project — never trust the caller's org — so an
        // org admin cannot create a connection against another org's project.
        const organizationUuid =
            await this.externalConnectionModel.getProjectOrganizationUuid(
                projectUuid,
            );
        if (!organizationUuid) {
            throw new NotFoundError('Project not found');
        }
        this.assertCanManage(account, projectUuid, organizationUuid);
        validateExternalConnectionConfig(data, Boolean(data.secret));
        const connection = await this.externalConnectionModel.create(
            projectUuid,
            organizationUuid,
            account.user.id,
            data,
        );
        this.analytics.track({
            event: 'external_connection.created',
            userId: account.user.id,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid: connection.externalConnectionUuid,
                authType: connection.type,
            },
        });
        return connection;
    }

    async list(
        account: RegisteredAccount,
        projectUuid: string,
    ): Promise<ExternalConnection[]> {
        await this.assertExternalAccessEnabled(account);
        // Derive the org from the project, not the caller, and filter by both,
        // so an org admin cannot list another org's project's connections.
        const organizationUuid =
            await this.externalConnectionModel.getProjectOrganizationUuid(
                projectUuid,
            );
        if (!organizationUuid) {
            throw new NotFoundError('Project not found');
        }
        this.assertCanManage(account, projectUuid, organizationUuid);
        return this.externalConnectionModel.list(projectUuid, organizationUuid);
    }

    private async getOwnedConnection(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<ExternalConnection> {
        const connection =
            await this.externalConnectionModel.findByUuid(connectionUuid);
        if (!connection || connection.projectUuid !== projectUuid) {
            throw new NotFoundError('External connection not found');
        }
        this.assertCanManage(
            account,
            connection.projectUuid,
            connection.organizationUuid,
        );
        return connection;
    }

    async get(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<ExternalConnection> {
        await this.assertExternalAccessEnabled(account);
        return this.getOwnedConnection(account, projectUuid, connectionUuid);
    }

    async update(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
        data: UpdateExternalConnection,
    ): Promise<ExternalConnection> {
        await this.assertExternalAccessEnabled(account);
        const existing = await this.getOwnedConnection(
            account,
            projectUuid,
            connectionUuid,
        );
        // Validate the resulting (merged) config so a partial update can't
        // leave the connection in an invalid or unsafe state.
        const hasSecretAfter =
            data.secret === null
                ? false
                : Boolean(data.secret) || existing.hasSecret;
        validateExternalConnectionConfig(
            {
                type: data.type ?? existing.type,
                origin: data.origin ?? existing.origin,
                allowedPathPrefixes:
                    data.allowedPathPrefixes ?? existing.allowedPathPrefixes,
                allowedMethods: data.allowedMethods ?? existing.allowedMethods,
                allowedContentTypes:
                    data.allowedContentTypes ?? existing.allowedContentTypes,
                responseMaxBytes:
                    data.responseMaxBytes ?? existing.responseMaxBytes,
                requestMaxBytes:
                    data.requestMaxBytes ?? existing.requestMaxBytes,
                timeoutMs: data.timeoutMs ?? existing.timeoutMs,
                rateLimitPerMinute:
                    data.rateLimitPerMinute !== undefined
                        ? data.rateLimitPerMinute
                        : existing.rateLimitPerMinute,
                apiKeyName:
                    data.apiKeyName !== undefined
                        ? data.apiKeyName
                        : existing.apiKeyName,
                apiKeyLocation:
                    data.apiKeyLocation !== undefined
                        ? data.apiKeyLocation
                        : existing.apiKeyLocation,
            },
            hasSecretAfter,
        );
        const updated = await this.externalConnectionModel.update(
            connectionUuid,
            account.user.id,
            data,
        );
        this.analytics.track({
            event: 'external_connection.updated',
            userId: account.user.id,
            properties: {
                organizationId: existing.organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid: connectionUuid,
            },
        });
        return updated;
    }

    async delete(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<void> {
        await this.assertExternalAccessEnabled(account);
        const existing = await this.getOwnedConnection(
            account,
            projectUuid,
            connectionUuid,
        );
        await this.externalConnectionModel.softDelete(connectionUuid);
        this.analytics.track({
            event: 'external_connection.deleted',
            userId: account.user.id,
            properties: {
                organizationId: existing.organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid: connectionUuid,
            },
        });
    }

    async rotateSecret(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
        secret: string,
    ): Promise<ExternalConnection> {
        await this.assertExternalAccessEnabled(account);
        const existing = await this.getOwnedConnection(
            account,
            projectUuid,
            connectionUuid,
        );
        await this.externalConnectionModel.rotateSecret(connectionUuid, secret);
        this.analytics.track({
            event: 'external_connection.secret_rotated',
            userId: account.user.id,
            properties: {
                organizationId: existing.organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid: connectionUuid,
            },
        });
        return this.getOwnedConnection(account, projectUuid, connectionUuid);
    }

    async listAppLinks(
        account: RegisteredAccount,
        projectUuid: string,
        appUuid: string,
    ): Promise<Array<{ alias: string; connection: ExternalConnection }>> {
        await this.assertExternalAccessEnabled(account);
        const app = await this.assertCanManageApp(account, appUuid);
        if (app.project_uuid !== projectUuid) {
            throw new NotFoundError('Data app not found');
        }
        return this.externalConnectionModel.listAppLinks(app.app_id);
    }

    async linkToApp(
        account: RegisteredAccount,
        projectUuid: string,
        appUuid: string,
        externalConnectionUuid: string,
        alias: string,
    ): Promise<void> {
        await this.assertExternalAccessEnabled(account);
        const app = await this.assertCanManageApp(account, appUuid);
        if (app.project_uuid !== projectUuid) {
            throw new NotFoundError('Data app not found');
        }
        if (!/^[a-z0-9_-]+$/i.test(alias) || alias.length > 64) {
            throw new ParameterError(
                'Alias must contain only letters, numbers, hyphens, and underscores (max 64 chars)',
            );
        }
        const connection = await this.getOwnedConnection(
            account,
            projectUuid,
            externalConnectionUuid,
        );
        await this.externalConnectionModel.linkToApp(
            app.app_id,
            externalConnectionUuid,
            alias,
        );
        this.analytics.track({
            event: 'external_connection.linked',
            userId: account.user.id,
            properties: {
                organizationId: connection.organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid,
                appUuid,
                alias,
            },
        });
    }

    async unlinkFromApp(
        account: RegisteredAccount,
        projectUuid: string,
        appUuid: string,
        alias: string,
    ): Promise<void> {
        await this.assertExternalAccessEnabled(account);
        const app = await this.assertCanManageApp(account, appUuid);
        if (app.project_uuid !== projectUuid) {
            throw new NotFoundError('Data app not found');
        }
        const links = await this.externalConnectionModel.listAppLinks(
            app.app_id,
        );
        const link = links.find((l) => l.alias === alias);
        if (!link) {
            throw new NotFoundError('App external connection link not found');
        }
        await this.externalConnectionModel.unlinkFromApp(app.app_id, alias);
        this.analytics.track({
            event: 'external_connection.unlinked',
            userId: account.user.id,
            properties: {
                organizationId: link.connection.organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid: link.connection.externalConnectionUuid,
                appUuid,
                alias,
            },
        });
    }

    async proxyFetch(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
        req: ExternalFetchRequest,
    ): Promise<ExternalFetchResponse> {
        await this.assertExternalAccessEnabledForUser(user);

        const start = performance.now();

        // 1. Load app + authorize VIEW (same authz as reading the app).
        const app = await this.appModel.getApp(appUuid, projectUuid);
        await assertCanViewApp(
            {
                auditedAbility: this.createAuditedAbility(user),
                getSpaceAccessContext: (userUuid, spaceUuid) =>
                    this.spacePermissionService.getSpaceAccessContext(
                        userUuid,
                        spaceUuid,
                    ),
            },
            user,
            app,
        );

        // 2. Resolve the alias → connection (must be linked to this app).
        const connection = await this.externalConnectionModel.resolveAppAlias(
            app.app_id,
            req.connectionAlias,
        );
        if (!connection) {
            throw new ForbiddenError(
                'This app is not linked to the requested connection',
            );
        }

        // 3. Method allowlist.
        const method: ExternalConnectionMethod = req.method ?? 'GET';
        if (!connection.allowedMethods.includes(method)) {
            throw new ParameterError(
                `Method ${method} is not allowed by this connection`,
            );
        }

        // 4. Rate limit — all methods, including GET. Reads still spend
        //    Lightdash egress and upstream quota under the injected auth, so an
        //    app viewer must not be able to drive unlimited GETs.
        const limit =
            connection.rateLimitPerMinute ??
            ExternalConnectionService.DEFAULT_RATE_LIMIT_PER_MINUTE;
        const window = computeMinuteWindow(new Date());
        const count = await this.externalConnectionModel.incrementRateCounter(
            connection.externalConnectionUuid,
            app.app_id,
            window,
        );
        if (count > limit) {
            this.trackFetch({
                user,
                projectUuid,
                appUuid: app.app_id,
                connectionAlias: req.connectionAlias,
                connection,
                method,
                path: req.path,
                status: null,
                outcome: 'rate_limited',
                start,
                requestBytes: 0,
                responseBytes: 0,
            });
            throw new TooManyRequestsError(
                'Rate limit exceeded for this connection',
            );
        }

        // 5. Resolve the secret (only what the auth type needs).
        const secret =
            connection.type === 'none'
                ? null
                : await this.externalConnectionModel.getDecryptedSecret(
                      connection.externalConnectionUuid,
                  );

        // 6. Shared execution path (reused by M5 testConnection).
        let result: {
            response: ExternalFetchResponse;
            requestBytes: number;
            responseBytes: number;
        };
        try {
            result = await this.executeExternalFetch(connection, secret, {
                method,
                path: req.path,
                query: req.query,
                body: req.body,
            });
        } catch (error) {
            const isKnown =
                error instanceof ParameterError ||
                error instanceof SecureFetchError;
            const outcome = isKnown ? 'rejected' : 'upstream_error';
            this.trackFetch({
                user,
                projectUuid,
                appUuid: app.app_id,
                connectionAlias: req.connectionAlias,
                connection,
                method,
                path: req.path,
                status: null,
                outcome,
                start,
                requestBytes: 0,
                responseBytes: 0,
            });
            if (error instanceof ParameterError) {
                throw error;
            }
            // Map any unexpected error (e.g. malformed origin, serialization
            // failure) to a generic ParameterError — no stack or upstream detail
            // reaches the client.
            throw new ParameterError('Proxy request failed');
        }

        // 7. Audit success — never bodies, never the secret.
        this.trackFetch({
            user,
            projectUuid,
            appUuid: app.app_id,
            connectionAlias: req.connectionAlias,
            connection,
            method,
            path: req.path,
            status: result.response.status,
            outcome: 'ok',
            start,
            requestBytes: result.requestBytes,
            responseBytes: result.responseBytes,
        });

        return result.response;
    }

    /**
     * Validate + build + inject + fetch + bound. NO authz, NO rate limit, NO
     * alias resolution — those live in the caller so M5's testConnection can
     * reuse this exact path with an admin-supplied connection.
     */
    // eslint-disable-next-line class-methods-use-this
    private async executeExternalFetch(
        connection: ExternalConnection,
        secret: string | null,
        req: {
            method: ExternalConnectionMethod;
            path: string;
            query?: Record<string, string>;
            body?: unknown;
        },
    ): Promise<{
        response: ExternalFetchResponse;
        requestBytes: number;
        responseBytes: number;
    }> {
        // Validate + normalize the path against the allowlist.
        const validatedPath = normalizeAndValidatePath(
            req.path,
            connection.allowedPathPrefixes,
        );

        // Start from the app's query; add api_key-in-query if configured.
        const query: Record<string, string> = { ...(req.query ?? {}) };
        const headers: Record<string, string> = {};

        if (connection.type === 'bearer_token') {
            // Fail closed: an authenticated connection must never fall through
            // to an unauthenticated upstream call.
            if (!secret) {
                throw new ParameterError(
                    'Connection is missing its bearer token',
                );
            }
            headers.Authorization = `Bearer ${secret}`;
        } else if (connection.type === 'api_key') {
            if (!secret || !connection.apiKeyName) {
                throw new ParameterError(
                    'Connection is missing its api key configuration',
                );
            }
            if (connection.apiKeyLocation === 'header') {
                // Stored config controls this header name, and the proxy is
                // where it becomes an outbound request — reject sensitive and
                // hop-by-hop headers (Host, Cookie, Content-Length, ...).
                assertSafeApiKeyHeaderName(connection.apiKeyName);
                headers[connection.apiKeyName] = secret;
            } else if (connection.apiKeyLocation === 'query') {
                query[connection.apiKeyName] = secret;
            } else {
                throw new ParameterError(
                    'Connection has an invalid api key location',
                );
            }
        }
        // type === 'none' → no auth injected.

        // Build the outbound URL server-side (host pinned to origin).
        let url: string;
        try {
            url = buildOutboundUrl(connection.origin, validatedPath, query);
        } catch (error) {
            if (error instanceof ParameterError) {
                throw error;
            }
            throw new ParameterError('Failed to build outbound URL');
        }

        // Cap the serialized query string length for all methods (incl. GET).
        const urlObj = new URL(url);
        if (
            Buffer.byteLength(urlObj.search, 'utf8') >
            connection.requestMaxBytes
        ) {
            throw new ParameterError(
                `Query string exceeds the maximum of ${connection.requestMaxBytes} bytes`,
            );
        }

        // Non-GET body: server-serialized JSON with server-set Content-Type.
        let body: string | undefined;
        let requestBytes = 0;
        if (req.method !== 'GET') {
            const serialized = serializeRequestBody(req.body);
            if (serialized.bytes > connection.requestMaxBytes) {
                throw new ParameterError(
                    `Request body exceeds the maximum of ${connection.requestMaxBytes} bytes`,
                );
            }
            body = serialized.json;
            requestBytes = serialized.bytes;
            headers['Content-Type'] = 'application/json';
        }

        // Delegate to the SSRF-hardened fetch.
        let fetched;
        try {
            fetched = await secureFetch(url, {
                method: req.method,
                body,
                headers,
                timeoutMs: connection.timeoutMs,
                maxResponseBytes: connection.responseMaxBytes,
                allowedContentTypes: connection.allowedContentTypes,
            });
        } catch (error) {
            // Map SecureFetchError → ParameterError with NO raw upstream detail.
            if (error instanceof SecureFetchError) {
                throw new ParameterError(
                    `Upstream request was blocked (${error.reason})`,
                );
            }
            throw new ParameterError('Upstream request failed');
        }

        // Parse body by content type. Recognize application/json and any
        // structured-syntax "+json" suffix (RFC 6839), e.g. application/geo+json.
        const mediaType = fetched.contentType
            .split(';')[0]
            .trim()
            .toLowerCase();
        const isJson =
            mediaType === 'application/json' || mediaType.endsWith('+json');
        let parsedBody: unknown = fetched.bodyText;
        if (isJson) {
            try {
                parsedBody = JSON.parse(fetched.bodyText);
            } catch {
                parsedBody = fetched.bodyText; // fall back to raw string
            }
        }

        return {
            response: {
                status: fetched.status,
                contentType: fetched.contentType,
                body: parsedBody,
                // Reserved for future use; always false in v1 — oversize responses
                // are rejected (SecureFetchError too_large), not truncated.
                truncated: fetched.truncated,
            },
            requestBytes,
            responseBytes: Buffer.byteLength(fetched.bodyText, 'utf8'),
        };
    }

    private trackFetch(args: {
        user: SessionUser;
        projectUuid: string;
        appUuid: string;
        connectionAlias: string;
        connection: ExternalConnection;
        method: ExternalConnectionMethod;
        path: string;
        status: number | null;
        outcome: 'ok' | 'rejected' | 'rate_limited' | 'upstream_error';
        start: number;
        requestBytes: number;
        responseBytes: number;
    }): void {
        this.analytics.track({
            event: 'external_connection.fetch',
            userId: args.user.userUuid,
            properties: {
                organizationId: args.connection.organizationUuid,
                projectId: args.projectUuid,
                appUuid: args.appUuid,
                externalConnectionUuid: args.connection.externalConnectionUuid,
                connectionAlias: args.connectionAlias,
                method: args.method,
                path: args.path,
                status: args.status,
                outcome: args.outcome,
                durationMs: Math.round(performance.now() - args.start),
                requestBytes: args.requestBytes,
                responseBytes: args.responseBytes,
            },
        });
    }

    // Bound the persisted sample so a large response can't bloat the row or
    // the sandbox file. JSON-byte cap + a row cap for array bodies.
    static readonly MAX_SAMPLE_BYTES = 16 * 1024; // 16 KB

    static readonly MAX_SAMPLE_ROWS = 50;

    // Bound storage: a connection keeps a small, human-curated set of samples,
    // and labels are short. The endpoint accepts client-supplied samples, so cap
    // both to keep the table (and the generation prompt) from being abused.
    static readonly MAX_SAMPLES_PER_CONNECTION = 20;

    static readonly MAX_SAMPLE_LABEL_CHARS = 200;

    /**
     * Redaction keys whose values are blanked before persisting a sample.
     * Belt-and-braces guard: executeExternalFetch never returns request
     * headers in the body, but a sample could still echo an auth field.
     */
    private static readonly SAMPLE_REDACT_KEYS = new Set([
        'authorization',
        'api_key',
        'apikey',
        'token',
        'access_token',
        'secret',
        'password',
        'x-api-key',
    ]);

    /**
     * Recursively redact known secret keys and cap array length. Shared by the
     * request and response sanitizers below.
     */
    private static redactSecretKeys(value: unknown): unknown {
        if (Array.isArray(value)) {
            return value
                .slice(0, ExternalConnectionService.MAX_SAMPLE_ROWS)
                .map((v) => ExternalConnectionService.redactSecretKeys(v));
        }
        if (value && typeof value === 'object') {
            return Object.fromEntries(
                Object.entries(value as Record<string, unknown>).map(([k, v]) =>
                    ExternalConnectionService.SAMPLE_REDACT_KEYS.has(
                        k.toLowerCase(),
                    )
                        ? [k, '[redacted]']
                        : [k, ExternalConnectionService.redactSecretKeys(v)],
                ),
            );
        }
        return value;
    }

    /**
     * Validate a client-supplied sample request against the connection's own
     * contract — the SAME method/path/query/body rules the runtime proxy
     * enforces — so a stored sample is always replayable and its size is bounded
     * by the connection's requestMaxBytes.
     */
    private static validateSampleRequest(
        conn: ExternalConnection,
        request: ExternalConnectionSampleRequest,
    ): void {
        if (!conn.allowedMethods.includes(request.method)) {
            throw new ParameterError(
                `Sample method ${request.method} is not allowed by this connection`,
            );
        }
        // Throws on a malformed path or one outside the allowed prefixes.
        normalizeAndValidatePath(request.path, conn.allowedPathPrefixes);
        if (request.query) {
            for (const [k, v] of Object.entries(request.query)) {
                if (typeof v !== 'string') {
                    throw new ParameterError(
                        `Sample query value for "${k}" must be a string`,
                    );
                }
            }
            if (
                Buffer.byteLength(JSON.stringify(request.query), 'utf8') >
                conn.requestMaxBytes
            ) {
                throw new ParameterError(
                    'Sample query exceeds the connection request size limit',
                );
            }
        }
        if (request.body !== undefined) {
            if (request.method === 'GET') {
                throw new ParameterError(
                    'A GET sample must not include a body',
                );
            }
            const { bytes } = serializeRequestBody(request.body);
            if (bytes > conn.requestMaxBytes) {
                throw new ParameterError(
                    'Sample body exceeds the connection request size limit',
                );
            }
        }
    }

    /**
     * Redact secret-ish keys from a sample request's query/body before
     * persisting. method/path are kept verbatim (already validated).
     */
    private static sanitizeSampleRequest(
        request: ExternalConnectionSampleRequest,
    ): ExternalConnectionSampleRequest {
        return {
            method: request.method,
            path: request.path,
            query: request.query
                ? (ExternalConnectionService.redactSecretKeys(
                      request.query,
                  ) as Record<string, string>)
                : undefined,
            body:
                request.body !== undefined
                    ? ExternalConnectionService.redactSecretKeys(request.body)
                    : undefined,
        };
    }

    /**
     * Sanitize an admin-supplied sample value: cap array length, redact known
     * secret keys, then hard-truncate by JSON byte size. Pure + secret-free
     * — never touches the connection's decrypted credential.
     */
    private static sanitizeSample(sample: unknown): unknown {
        let result = ExternalConnectionService.redactSecretKeys(sample);
        // Hard byte cap: if still over budget, wrap in a truncated note so
        // the persisted blob is always bounded regardless of shape.
        const json = JSON.stringify(result) ?? 'null';
        if (
            Buffer.byteLength(json) > ExternalConnectionService.MAX_SAMPLE_BYTES
        ) {
            const truncated = json.slice(
                0,
                ExternalConnectionService.MAX_SAMPLE_BYTES,
            );
            result = {
                truncated: true,
                preview: truncated.slice(
                    0,
                    ExternalConnectionService.MAX_SAMPLE_BYTES - 64,
                ),
            };
        }
        return result;
    }

    /**
     * Loads a connection and verifies it belongs to the given project.
     * A cross-project or missing UUID is treated as 404 to avoid leaking
     * existence information.
     */
    private async loadConnectionForProject(
        connectionUuid: string,
        projectUuid: string,
    ): Promise<ExternalConnection> {
        const conn =
            await this.externalConnectionModel.findByUuid(connectionUuid);
        if (!conn || conn.projectUuid !== projectUuid) {
            throw new NotFoundError(
                `External connection ${connectionUuid} not found`,
            );
        }
        return conn;
    }

    /**
     * Admin-only "Test connection". Loads the connection, decrypts its
     * secret, and runs a single request through the SAME validation +
     * SSRF-guarded fetch core the runtime proxy uses (`executeExternalFetch`).
     * Returns the bounded response. Does not involve an app.
     */
    async testConnection(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
        req: {
            method?: ExternalConnectionMethod;
            path: string;
            query?: Record<string, string>;
            body?: unknown;
        },
    ): Promise<ExternalFetchResponse> {
        await this.assertExternalAccessEnabled(account);
        const conn = await this.loadConnectionForProject(
            connectionUuid,
            projectUuid,
        );
        this.assertCanManage(account, conn.projectUuid, conn.organizationUuid);

        const secret =
            conn.type === 'none'
                ? null
                : await this.externalConnectionModel.getDecryptedSecret(
                      connectionUuid,
                  );

        const result = await this.executeExternalFetch(conn, secret, {
            method: req.method ?? 'GET',
            path: req.path,
            query: req.query,
            body: req.body,
        });
        return result.response;
    }

    /**
     * Admin-only. Persist a named, sanitized sample (request + response) in
     * the samples collection. Stores NO secret material — never calls
     * getDecryptedSecret.
     */
    async saveSample(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
        data: ApiSaveExternalConnectionSampleRequest,
    ): Promise<ExternalConnectionSample> {
        await this.assertExternalAccessEnabled(account);
        const conn = await this.loadConnectionForProject(
            connectionUuid,
            projectUuid,
        );
        this.assertCanManage(account, conn.projectUuid, conn.organizationUuid);

        // Validate the client-supplied request against the connection contract
        // before persisting, so a stored sample is always replayable + bounded.
        ExternalConnectionService.validateSampleRequest(conn, data.request);

        // Cap the number of stored samples per connection.
        const existingCount =
            await this.externalConnectionModel.countSamples(connectionUuid);
        if (
            existingCount >=
            ExternalConnectionService.MAX_SAMPLES_PER_CONNECTION
        ) {
            throw new ParameterError(
                `This connection already has the maximum of ${ExternalConnectionService.MAX_SAMPLES_PER_CONNECTION} saved samples. Delete one before saving another.`,
            );
        }

        const label =
            data.label != null
                ? data.label.slice(
                      0,
                      ExternalConnectionService.MAX_SAMPLE_LABEL_CHARS,
                  )
                : null;

        return this.externalConnectionModel.saveSample(
            connectionUuid,
            account.user.id,
            {
                label,
                request: ExternalConnectionService.sanitizeSampleRequest(
                    data.request,
                ),
                response: ExternalConnectionService.sanitizeSample(
                    data.response,
                ),
            },
        );
    }

    /**
     * Admin-only. List all samples saved for a connection, most recent first.
     */
    async listSamples(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<ExternalConnectionSample[]> {
        await this.assertExternalAccessEnabled(account);
        const conn = await this.loadConnectionForProject(
            connectionUuid,
            projectUuid,
        );
        this.assertCanManage(account, conn.projectUuid, conn.organizationUuid);
        return this.externalConnectionModel.listSamples(connectionUuid);
    }

    /**
     * Admin-only. Delete a single sample by UUID. Verifies the sample belongs
     * to the given connection (which must be in the given project).
     */
    async deleteSample(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
        sampleUuid: string,
    ): Promise<void> {
        await this.assertExternalAccessEnabled(account);
        const conn = await this.loadConnectionForProject(
            connectionUuid,
            projectUuid,
        );
        this.assertCanManage(account, conn.projectUuid, conn.organizationUuid);

        const ownerConnectionUuid =
            await this.externalConnectionModel.getSampleConnectionUuid(
                sampleUuid,
            );
        if (ownerConnectionUuid !== connectionUuid) {
            throw new NotFoundError('Sample not found');
        }
        await this.externalConnectionModel.deleteSample(sampleUuid);
    }
}
