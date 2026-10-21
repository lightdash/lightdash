import { subject } from '@casl/ability';
import {
    APP_STATE_HISTORY_DEFAULT_LIMIT,
    APP_STATE_HISTORY_MAX_LIMIT,
    APP_STATE_MAX_KEYS_PER_SCOPE,
    APP_STATE_MAX_VALUE_BYTES,
    APP_STATE_MAX_WRITES_PER_MINUTE,
    appStateValueByteLength,
    assertRegisteredAccount,
    ConflictError,
    DATA_APP_VIZ_TEMPLATE,
    FeatureFlags,
    FeatureNotEnabledError,
    ForbiddenError,
    isJwtUser,
    isValidAppStateKey,
    ParameterError,
    TooManyRequestsError,
    type Account,
    type AppStateConflictData,
    type AppStateHistory,
    type AppStateSharedEntry,
    type AppStateSnapshot,
    type AppStateUserEntry,
    type SessionUser,
} from '@lightdash/common';
import { toSessionUser } from '../../../auth/account';
import { type AppModel } from '../../../models/AppModel';
import { type FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../../services/BaseService';
import { type SpacePermissionService } from '../../../services/SpaceService/SpacePermissionService';
import { type AppStateModel } from '../../models/AppStateModel';
import {
    assertCanViewApp,
    assertCanViewEmbeddedApp,
    type AppViewAuthorizationContext,
    type AppViewAuthzApp,
    type DataAppProjectContext,
} from '../AppGenerateService/appAuthz';

type AppStateServiceArguments = {
    appStateModel: AppStateModel;
    appModel: AppModel;
    projectModel: ProjectModel;
    spacePermissionService: SpacePermissionService;
    featureFlagModel: FeatureFlagModel;
};

type AuthorizedViewer =
    | {
          kind: 'user';
          user: SessionUser;
          app: AppViewAuthzApp;
          context: AppViewAuthorizationContext;
      }
    | { kind: 'embed'; app: AppViewAuthzApp };

const WRITE_WINDOW_MS = 60_000;

/**
 * True when serialized JSON contains a real \\u0000 escape (in a string or
 * a key), which Postgres jsonb rejects. A linear scan: every backslash
 * starts a two-character escape, so an escaped backslash is skipped as a
 * pair and never mistaken for the start of \\u0000.
 */
const hasNulEscape = (serialized: string): boolean => {
    for (let i = 0; i < serialized.length; i += 1) {
        if (serialized[i] === '\\') {
            if (serialized.startsWith('u0000', i + 1)) return true;
            i += 1;
        }
    }
    return false;
};
const WRITE_WINDOWS_SWEEP_SIZE = 5_000;

export class AppStateService extends BaseService {
    private readonly appStateModel: AppStateModel;

    private readonly appModel: AppModel;

    private readonly projectModel: ProjectModel;

    private readonly spacePermissionService: SpacePermissionService;

    private readonly featureFlagModel: FeatureFlagModel;

    /** Per-process write timestamps by app + viewer; a loop guard, not a quota. */
    private readonly writeWindows = new Map<string, number[]>();

    constructor(args: AppStateServiceArguments) {
        super();
        this.appStateModel = args.appStateModel;
        this.appModel = args.appModel;
        this.projectModel = args.projectModel;
        this.spacePermissionService = args.spacePermissionService;
        this.featureFlagModel = args.featureFlagModel;
    }

    private async getDataAppProjectContext(
        projectUuid: string,
    ): Promise<DataAppProjectContext> {
        const summary = await this.projectModel.getSummary(projectUuid);
        return {
            organizationUuid: summary.organizationUuid,
            projectUuid,
            projectType: summary.type,
            projectCreatedByUserUuid: summary.createdByUserUuid,
            upstreamProjectUuid: summary.upstreamProjectUuid ?? null,
        };
    }

    private async assertFeatureEnabled(
        account: Account,
        organizationUuid: string,
    ): Promise<void> {
        const { enabled } = await this.featureFlagModel.get({
            user: {
                organizationUuid,
                userUuid: isJwtUser(account) ? undefined : account.user.id,
            },
            featureFlagId: FeatureFlags.EnableDataAppState,
        });
        if (!enabled) {
            throw new FeatureNotEnabledError(FeatureFlags.EnableDataAppState);
        }
    }

    private async authorizeViewer(
        account: Account,
        projectUuid: string,
        appUuid: string,
    ): Promise<AuthorizedViewer> {
        if (isJwtUser(account)) {
            const app = await this.appModel.findApp(appUuid, projectUuid);
            if (!app || app.template === DATA_APP_VIZ_TEMPLATE) {
                throw new ForbiddenError(
                    'Data app is not authorized by this embed',
                );
            }
            await this.assertFeatureEnabled(account, app.organization_uuid);
            await assertCanViewEmbeddedApp(
                {
                    createAuditedAbility: (embeddedAccount) =>
                        this.createAuditedAbility(embeddedAccount),
                    appModel: this.appModel,
                },
                account,
                app,
            );
            return { kind: 'embed', app };
        }

        assertRegisteredAccount(account);
        const user = toSessionUser(account);
        const app = await this.appModel.getApp(appUuid, projectUuid);
        if (app.template === DATA_APP_VIZ_TEMPLATE) {
            throw new ForbiddenError(
                'Saved app state is not available for chart types',
            );
        }
        await this.assertFeatureEnabled(account, app.organization_uuid);
        const context = await assertCanViewApp(
            {
                auditedAbility: this.createAuditedAbility(user),
                resolveAccess: (userUuid, targetApp) =>
                    this.spacePermissionService.resolveAccess(userUuid, {
                        type: 'app',
                        appUuid: targetApp.app_id,
                        organizationUuid: targetApp.organization_uuid,
                        projectUuid: targetApp.project_uuid,
                        spaceUuid: targetApp.space_uuid,
                    }),
                getProjectContext: (appProjectUuid) =>
                    this.getDataAppProjectContext(appProjectUuid),
            },
            user,
            app,
        );
        return { kind: 'user', user, app, context };
    }

    private async authorizeWriter(
        account: Account,
        projectUuid: string,
        appUuid: string,
    ): Promise<Extract<AuthorizedViewer, { kind: 'user' }>> {
        const viewer = await this.authorizeViewer(
            account,
            projectUuid,
            appUuid,
        );
        if (viewer.kind === 'embed') {
            throw new ForbiddenError(
                'Saved app state cannot be written from an embed',
            );
        }
        this.assertWriteRate(appUuid, viewer.user.userUuid);
        return viewer;
    }

    private assertWriteRate(appUuid: string, userUuid: string): void {
        const now = Date.now();
        const id = `${appUuid}:${userUuid}`;
        if (this.writeWindows.size >= WRITE_WINDOWS_SWEEP_SIZE) {
            // Drop viewers that have gone quiet so the map cannot grow with
            // every app + user pair the process has ever seen.
            this.writeWindows.forEach((timestamps, windowId) => {
                if (!timestamps.some((ts) => now - ts < WRITE_WINDOW_MS)) {
                    this.writeWindows.delete(windowId);
                }
            });
        }
        const recent = (this.writeWindows.get(id) ?? []).filter(
            (ts) => now - ts < WRITE_WINDOW_MS,
        );
        if (recent.length >= APP_STATE_MAX_WRITES_PER_MINUTE) {
            this.writeWindows.set(id, recent);
            throw new TooManyRequestsError(
                'This app is saving state too often. Check for a save loop.',
            );
        }
        recent.push(now);
        this.writeWindows.set(id, recent);
    }

    private static assertKey(key: string): void {
        if (!isValidAppStateKey(key)) {
            throw new ParameterError(
                'App state keys are 1-128 characters of letters, numbers, "_", ".", ":" or "-"',
            );
        }
    }

    private static assertValue(value: unknown): void {
        const bytes = appStateValueByteLength(value);
        if (bytes === null) {
            throw new ParameterError('App state values must be JSON');
        }
        // Postgres jsonb rejects the \u0000 escape in strings and keys; catch
        // it here so the writer gets a 400 rather than a database error.
        if (hasNulEscape(JSON.stringify(value))) {
            throw new ParameterError(
                'App state values cannot contain NUL characters',
            );
        }
        if (bytes > APP_STATE_MAX_VALUE_BYTES) {
            throw new ParameterError(
                `App state values are limited to ${Math.floor(
                    APP_STATE_MAX_VALUE_BYTES / 1024,
                )} KB; this value is ${Math.ceil(bytes / 1024)} KB`,
            );
        }
    }

    private static overCap(): ParameterError {
        return new ParameterError(
            `An app can store at most ${APP_STATE_MAX_KEYS_PER_SCOPE} keys per scope`,
        );
    }

    async getSnapshot(
        account: Account,
        projectUuid: string,
        appUuid: string,
    ): Promise<AppStateSnapshot> {
        const viewer = await this.authorizeViewer(
            account,
            projectUuid,
            appUuid,
        );
        return this.appStateModel.getSnapshot(
            appUuid,
            viewer.kind === 'user' ? viewer.user.userUuid : null,
        );
    }

    async setUserState(
        account: Account,
        projectUuid: string,
        appUuid: string,
        key: string,
        value: unknown,
    ): Promise<AppStateUserEntry> {
        AppStateService.assertKey(key);
        AppStateService.assertValue(value);
        const viewer = await this.authorizeWriter(
            account,
            projectUuid,
            appUuid,
        );
        const result = await this.appStateModel.upsertUserState({
            appUuid,
            userUuid: viewer.user.userUuid,
            key,
            value,
            maxKeys: APP_STATE_MAX_KEYS_PER_SCOPE,
        });
        if (result.outcome === 'over_cap') {
            throw AppStateService.overCap();
        }
        return result.entry;
    }

    async deleteUserState(
        account: Account,
        projectUuid: string,
        appUuid: string,
        key: string,
    ): Promise<void> {
        AppStateService.assertKey(key);
        const viewer = await this.authorizeWriter(
            account,
            projectUuid,
            appUuid,
        );
        await this.appStateModel.deleteUserState(
            appUuid,
            viewer.user.userUuid,
            key,
        );
    }

    async setSharedState(
        account: Account,
        projectUuid: string,
        appUuid: string,
        key: string,
        value: unknown,
        expectedVersion: number | null,
    ): Promise<AppStateSharedEntry> {
        AppStateService.assertKey(key);
        AppStateService.assertValue(value);
        if (
            expectedVersion !== null &&
            (!Number.isInteger(expectedVersion) || expectedVersion < 1)
        ) {
            throw new ParameterError(
                'expectedVersion must be a positive integer or null',
            );
        }
        const viewer = await this.authorizeWriter(
            account,
            projectUuid,
            appUuid,
        );
        const result = await this.appStateModel.upsertSharedState({
            appUuid,
            key,
            value,
            expectedVersion,
            writer: { kind: 'user', userUuid: viewer.user.userUuid },
            maxKeys: APP_STATE_MAX_KEYS_PER_SCOPE,
        });
        if (result.outcome === 'over_cap') {
            throw AppStateService.overCap();
        }
        if (result.outcome === 'conflict') {
            const data: AppStateConflictData = { current: result.current };
            throw new ConflictError(
                result.current
                    ? 'This value was changed by someone else. Reload it and try again.'
                    : 'This value no longer exists. Reload it and try again.',
                data,
            );
        }
        return result.entry;
    }

    async deleteSharedState(
        account: Account,
        projectUuid: string,
        appUuid: string,
        key: string,
    ): Promise<void> {
        AppStateService.assertKey(key);
        const viewer = await this.authorizeWriter(
            account,
            projectUuid,
            appUuid,
        );
        const ability = this.createAuditedAbility(viewer.user);
        if (ability.cannot('manage', subject('DataApp', viewer.context))) {
            throw new ForbiddenError(
                'Only people who can manage this app can delete shared state',
            );
        }
        await this.appStateModel.deleteSharedState(appUuid, key);
    }

    async getSharedHistory(
        account: Account,
        projectUuid: string,
        appUuid: string,
        key: string,
        options: { limit?: number; beforeVersion?: number },
    ): Promise<AppStateHistory> {
        AppStateService.assertKey(key);
        const limit = Math.min(
            Math.max(1, options.limit ?? APP_STATE_HISTORY_DEFAULT_LIMIT),
            APP_STATE_HISTORY_MAX_LIMIT,
        );
        await this.authorizeViewer(account, projectUuid, appUuid);
        const versions = await this.appStateModel.getSharedHistory(
            appUuid,
            key,
            { limit, beforeVersion: options.beforeVersion ?? null },
        );
        return { versions };
    }
}
