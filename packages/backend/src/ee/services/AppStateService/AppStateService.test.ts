import {
    APP_STATE_MAX_KEYS_PER_SCOPE,
    APP_STATE_MAX_WRITES_PER_MINUTE,
    ConflictError,
    DATA_APP_VIZ_TEMPLATE,
    defineUserAbility,
    ForbiddenError,
    OrganizationMemberRole,
    ParameterError,
    ProjectType,
    TooManyRequestsError,
    type AppStateSharedEntry,
} from '@lightdash/common';
import { fromJwt, fromSession } from '../../../auth/account';
import {
    buildAccount,
    defaultSessionUser,
} from '../../../auth/account/account.mock';
import { type UpsertUserStateResult } from '../../models/AppStateModel';
import { AppStateService } from './AppStateService';

const sessionAccount = (
    role = OrganizationMemberRole.INTERACTIVE_VIEWER,
    userUuid = 'viewer-1',
) => {
    const user = {
        ...defaultSessionUser,
        role,
        organizationUuid: 'org-1',
        userUuid,
    };
    return fromSession(
        { ...user, ability: defineUserAbility(user, []) },
        'session',
    );
};

const embeddedAccount = (appUuid = 'app-1') => {
    const base = buildAccount({ accountType: 'jwt' });
    return fromJwt({
        decodedToken: {
            user: { externalId: 'data-app-viewer' },
            content: { type: 'dataApp', appUuid },
        },
        embed: {
            ...base.embed,
            projectUuid: 'proj-1',
            organization: {
                ...base.embed.organization,
                organizationUuid: 'org-1',
            },
            allowAllApps: true,
            appUuids: [appUuid],
        },
        source: 'data-app-embed-token',
        content: { type: 'dataApp', appUuid, chartUuids: [], explores: [] },
        userAttributes: base.access.controls!,
    });
};

const sharedEntry: AppStateSharedEntry = {
    value: { q1: 1 },
    version: 3,
    updatedAt: '2026-10-20T00:00:00.000Z',
    updatedBy: { userUuid: 'viewer-2', name: 'Other Person' },
};

function buildService({
    template = 'data_app',
    flagEnabled = true,
}: { template?: string; flagEnabled?: boolean } = {}) {
    const app = {
        app_id: 'app-1',
        project_uuid: 'proj-1',
        organization_uuid: 'org-1',
        space_uuid: null,
        created_by_user_uuid: 'creator-1',
        template,
    };
    const appModel = {
        findApp: vi.fn(async (appUuid: string, projectUuid: string) =>
            appUuid === app.app_id && projectUuid === app.project_uuid
                ? app
                : undefined,
        ),
        getApp: vi.fn(async () => app),
        findDashboardsContainingApp: vi.fn().mockResolvedValue([]),
    };
    const appStateModel = {
        getSnapshot: vi.fn().mockResolvedValue({ user: {}, shared: {} }),
        upsertUserState: vi.fn(
            async (args: {
                value: unknown;
            }): Promise<UpsertUserStateResult> => ({
                outcome: 'written',
                entry: {
                    value: args.value,
                    updatedAt: '2026-10-20T00:00:00.000Z',
                },
            }),
        ),
        deleteUserState: vi.fn().mockResolvedValue(undefined),
        upsertSharedState: vi.fn().mockResolvedValue({
            outcome: 'written',
            entry: sharedEntry,
        }),
        deleteSharedState: vi.fn().mockResolvedValue(undefined),
        getSharedHistory: vi.fn().mockResolvedValue([]),
    };
    const projectModel = {
        getSummary: vi.fn().mockResolvedValue({
            organizationUuid: 'org-1',
            type: ProjectType.DEFAULT,
            createdByUserUuid: null,
            upstreamProjectUuid: null,
        }),
    };
    const spacePermissionService = {
        resolveAccess: vi.fn().mockResolvedValue({
            organizationUuid: 'org-1',
            inheritsFromOrgOrProject: true,
            access: [],
            directOnly: false,
        }),
    };
    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled: flagEnabled }),
    };
    const service = new AppStateService({
        appStateModel,
        appModel,
        projectModel,
        spacePermissionService,
        featureFlagModel,
    } as never);
    return { service, appStateModel, featureFlagModel };
}

describe('AppStateService', () => {
    describe('reading', () => {
        it('returns the viewer snapshot for an interactive viewer', async () => {
            const { service, appStateModel } = buildService();
            await service.getSnapshot(sessionAccount(), 'proj-1', 'app-1');
            expect(appStateModel.getSnapshot).toHaveBeenCalledWith(
                'app-1',
                'viewer-1',
            );
        });

        it('refuses a plain viewer, who cannot view data apps', async () => {
            const { service } = buildService();
            await expect(
                service.getSnapshot(
                    sessionAccount(OrganizationMemberRole.VIEWER),
                    'proj-1',
                    'app-1',
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });

        it('refuses everything when the flag is off', async () => {
            const { service, featureFlagModel } = buildService({
                flagEnabled: false,
            });
            await expect(
                service.getSnapshot(sessionAccount(), 'proj-1', 'app-1'),
            ).rejects.toThrow(/not enabled/);
            expect(featureFlagModel.get).toHaveBeenCalledWith(
                expect.objectContaining({
                    user: { organizationUuid: 'org-1', userUuid: 'viewer-1' },
                }),
            );
        });

        it('refuses chart types', async () => {
            const { service } = buildService({
                template: DATA_APP_VIZ_TEMPLATE,
            });
            await expect(
                service.getSnapshot(sessionAccount(), 'proj-1', 'app-1'),
            ).rejects.toThrow(/chart types/);
        });

        it('gives embeds shared state only and resolves the flag by organization', async () => {
            const { service, appStateModel, featureFlagModel } = buildService();
            await service.getSnapshot(embeddedAccount(), 'proj-1', 'app-1');
            expect(appStateModel.getSnapshot).toHaveBeenCalledWith(
                'app-1',
                null,
            );
            expect(featureFlagModel.get).toHaveBeenCalledWith(
                expect.objectContaining({
                    user: { organizationUuid: 'org-1', userUuid: undefined },
                }),
            );
        });

        it('refuses an embed pinned to another app', async () => {
            const { service } = buildService();
            await expect(
                service.getSnapshot(
                    embeddedAccount('app-2'),
                    'proj-1',
                    'app-1',
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });
    });

    describe('per-user writes', () => {
        it('saves a value for the writer', async () => {
            const { service, appStateModel } = buildService();
            const entry = await service.setUserState(
                sessionAccount(),
                'proj-1',
                'app-1',
                'filters',
                { region: 'EU' },
            );
            expect(entry.value).toEqual({ region: 'EU' });
            expect(appStateModel.upsertUserState).toHaveBeenCalledWith({
                appUuid: 'app-1',
                userUuid: 'viewer-1',
                key: 'filters',
                value: { region: 'EU' },
                maxKeys: APP_STATE_MAX_KEYS_PER_SCOPE,
            });
        });

        it('rejects bad keys, non-JSON and oversized values before touching the store', async () => {
            const { service, appStateModel } = buildService();
            const account = sessionAccount();
            await expect(
                service.setUserState(account, 'proj-1', 'app-1', 'bad key', 1),
            ).rejects.toBeInstanceOf(ParameterError);
            await expect(
                service.setUserState(
                    account,
                    'proj-1',
                    'app-1',
                    'k',
                    undefined,
                ),
            ).rejects.toBeInstanceOf(ParameterError);
            await expect(
                service.setUserState(
                    account,
                    'proj-1',
                    'app-1',
                    'k',
                    'x'.repeat(65 * 1024),
                ),
            ).rejects.toThrow(/64 KB/);
            await expect(
                service.setUserState(account, 'proj-1', 'app-1', 'k', {
                    'na\u0000me': 'a\u0000b',
                }),
            ).rejects.toThrow(/NUL/);
            expect(appStateModel.upsertUserState).not.toHaveBeenCalled();
            // An escaped backslash followed by "u0000" is ordinary text.
            await expect(
                service.setUserState(
                    account,
                    'proj-1',
                    'app-1',
                    'k',
                    '\\u0000',
                ),
            ).resolves.toBeDefined();
        });

        it("turns the store's over-cap outcome into a clear error", async () => {
            const { service, appStateModel } = buildService();
            appStateModel.upsertUserState.mockResolvedValueOnce({
                outcome: 'over_cap',
            });
            await expect(
                service.setUserState(
                    sessionAccount(),
                    'proj-1',
                    'app-1',
                    'new',
                    1,
                ),
            ).rejects.toThrow(/at most/);
        });

        it('refuses writes from embeds', async () => {
            const { service, appStateModel } = buildService();
            await expect(
                service.setUserState(
                    embeddedAccount(),
                    'proj-1',
                    'app-1',
                    'k',
                    1,
                ),
            ).rejects.toThrow(/embed/);
            await expect(
                service.setSharedState(
                    embeddedAccount(),
                    'proj-1',
                    'app-1',
                    'k',
                    1,
                    null,
                ),
            ).rejects.toThrow(/embed/);
            expect(appStateModel.upsertUserState).not.toHaveBeenCalled();
            expect(appStateModel.upsertSharedState).not.toHaveBeenCalled();
        });

        it('stops a save loop', async () => {
            const { service } = buildService();
            const account = sessionAccount();
            for (let i = 0; i < APP_STATE_MAX_WRITES_PER_MINUTE; i += 1) {
                // eslint-disable-next-line no-await-in-loop
                await service.setUserState(account, 'proj-1', 'app-1', 'k', i);
            }
            await expect(
                service.setUserState(account, 'proj-1', 'app-1', 'k', 0),
            ).rejects.toBeInstanceOf(TooManyRequestsError);
            // Another viewer of the same app is unaffected.
            await expect(
                service.setUserState(
                    sessionAccount(
                        OrganizationMemberRole.INTERACTIVE_VIEWER,
                        'viewer-2',
                    ),
                    'proj-1',
                    'app-1',
                    'k',
                    0,
                ),
            ).resolves.toBeDefined();
        });
    });

    describe('shared writes', () => {
        it('writes as the viewer with the expected version', async () => {
            const { service, appStateModel } = buildService();
            const entry = await service.setSharedState(
                sessionAccount(),
                'proj-1',
                'app-1',
                'targets',
                { q1: 1 },
                2,
            );
            expect(entry).toEqual(sharedEntry);
            expect(appStateModel.upsertSharedState).toHaveBeenCalledWith({
                appUuid: 'app-1',
                key: 'targets',
                value: { q1: 1 },
                expectedVersion: 2,
                writer: { kind: 'user', userUuid: 'viewer-1' },
                maxKeys: APP_STATE_MAX_KEYS_PER_SCOPE,
            });
        });

        it("turns the store's over-cap outcome into a clear error for shared keys", async () => {
            const { service, appStateModel } = buildService();
            appStateModel.upsertSharedState.mockResolvedValueOnce({
                outcome: 'over_cap',
            });
            await expect(
                service.setSharedState(
                    sessionAccount(),
                    'proj-1',
                    'app-1',
                    'targets',
                    1,
                    null,
                ),
            ).rejects.toThrow(/at most/);
        });

        it('rejects a non-positive or fractional expected version', async () => {
            const { service } = buildService();
            await expect(
                service.setSharedState(
                    sessionAccount(),
                    'proj-1',
                    'app-1',
                    'k',
                    1,
                    0,
                ),
            ).rejects.toBeInstanceOf(ParameterError);
            await expect(
                service.setSharedState(
                    sessionAccount(),
                    'proj-1',
                    'app-1',
                    'k',
                    1,
                    1.5,
                ),
            ).rejects.toBeInstanceOf(ParameterError);
        });

        it('turns a stale version into a 409 carrying the current value', async () => {
            const { service, appStateModel } = buildService();
            appStateModel.upsertSharedState.mockResolvedValue({
                outcome: 'conflict',
                current: sharedEntry,
            });
            const error = await service
                .setSharedState(
                    sessionAccount(),
                    'proj-1',
                    'app-1',
                    'targets',
                    1,
                    1,
                )
                .catch((e: unknown) => e);
            expect(error).toBeInstanceOf(ConflictError);
            expect((error as ConflictError).data).toEqual({
                current: sharedEntry,
            });
        });

        it('lets only app managers delete shared keys', async () => {
            const { service, appStateModel } = buildService();
            await expect(
                service.deleteSharedState(
                    sessionAccount(),
                    'proj-1',
                    'app-1',
                    'targets',
                ),
            ).rejects.toThrow(/manage/);
            await service.deleteSharedState(
                sessionAccount(OrganizationMemberRole.ADMIN),
                'proj-1',
                'app-1',
                'targets',
            );
            expect(appStateModel.deleteSharedState).toHaveBeenCalledWith(
                'app-1',
                'targets',
            );
        });

        it('clamps history limits', async () => {
            const { service, appStateModel } = buildService();
            await service.getSharedHistory(
                sessionAccount(),
                'proj-1',
                'app-1',
                'targets',
                { limit: 10_000, beforeVersion: 7 },
            );
            expect(appStateModel.getSharedHistory).toHaveBeenCalledWith(
                'app-1',
                'targets',
                { limit: 200, beforeVersion: 7 },
            );
        });
    });
});
