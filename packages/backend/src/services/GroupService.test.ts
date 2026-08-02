import { Ability } from '@casl/ability';
import {
    PromotionAction,
    type Account,
    type GroupAsCode,
    type PossibleAbilities,
} from '@lightdash/common';
import { GroupsService } from './GroupService';

const createAuthentication = (
    authenticationType: 'session' | 'pat' | 'service-account',
) => {
    if (authenticationType === 'service-account') {
        return {
            type: 'service-account' as const,
            source: 'service-account-token',
            serviceAccountUuid: 'service-account-uuid',
            serviceAccountDescription: 'CI',
        };
    }
    if (authenticationType === 'pat') {
        return { type: 'pat' as const, source: 'pat-token' };
    }
    return { type: 'session' as const, source: 'session-cookie' };
};

const createAccount = (
    authenticationType: 'session' | 'pat' | 'service-account' = 'session',
    canManageGroups: boolean = true,
): Account =>
    ({
        authentication: createAuthentication(authenticationType),
        user: {
            type: 'registered',
            userUuid: 'actor-user-uuid',
            ability: new Ability<PossibleAbilities>(
                canManageGroups
                    ? [
                          {
                              action: 'manage',
                              subject: 'Group',
                              conditions: {
                                  organizationUuid: 'organization-uuid',
                              },
                          },
                      ]
                    : [],
            ),
        },
        organization: {
            organizationUuid: 'organization-uuid',
            name: 'Organization',
            createdAt: new Date('2026-01-01'),
        },
        isAuthenticated: () => true,
        isRegisteredUser: () => true,
        isAnonymousUser: () => false,
        isSessionUser: () => authenticationType === 'session',
        isJwtUser: () => false,
        isServiceAccount: () => authenticationType === 'service-account',
        isPatUser: () => authenticationType === 'pat',
        isOauthUser: () => false,
    }) as Account;

describe('GroupsService groups as code', () => {
    const analytics = { track: vi.fn() };
    const groupsModel = {
        find: vi.fn(),
        findGroupMembers: vi.fn(),
        upsertGroupAsCode: vi.fn(),
    };
    const featureFlagService = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    };
    const service = new GroupsService({
        analytics: analytics as never,
        groupsModel: groupsModel as never,
        projectModel: {} as never,
        featureFlagService: featureFlagService as never,
    });
    const group = (overrides: Partial<GroupAsCode> = {}): GroupAsCode => ({
        version: 1,
        name: 'Finance',
        members: ['analyst@example.com'],
        ...overrides,
    });

    beforeEach(() => {
        vi.clearAllMocks();
        featureFlagService.get.mockResolvedValue({ enabled: true });
        groupsModel.upsertGroupAsCode.mockResolvedValue({
            action: PromotionAction.NO_CHANGES,
            groupUuid: 'group-uuid',
        });
    });

    it('downloads deterministic groups including empty groups', async () => {
        groupsModel.find.mockResolvedValue({
            data: [
                { uuid: 'group-z', name: 'Zeta' },
                { uuid: 'group-a', name: 'Alpha' },
            ],
        });
        groupsModel.findGroupMembers.mockResolvedValue({
            data: [
                { groupUuid: 'group-z', email: 'z@example.com' },
                { groupUuid: 'group-z', email: 'A@example.com' },
            ],
        });

        await expect(
            service.getGroupsAsCode(createAccount(), 'organization-uuid'),
        ).resolves.toStrictEqual([
            { version: 1, name: 'Alpha', members: [] },
            {
                version: 1,
                name: 'Zeta',
                members: ['a@example.com', 'z@example.com'],
            },
        ]);
    });

    it.each(['pat', 'service-account'] as const)(
        'supports %s authorization through the account path',
        async (authenticationType) => {
            groupsModel.upsertGroupAsCode.mockResolvedValue({
                action: PromotionAction.CREATE,
                groupUuid: 'group-uuid',
            });

            await expect(
                service.upsertGroupAsCode(
                    createAccount(authenticationType),
                    'organization-uuid',
                    group({
                        members: ['SECOND@example.com', 'first@example.com'],
                    }),
                ),
            ).resolves.toStrictEqual({ action: PromotionAction.CREATE });
            expect(groupsModel.upsertGroupAsCode).toHaveBeenCalledWith({
                organizationUuid: 'organization-uuid',
                name: 'Finance',
                memberEmails: ['first@example.com', 'second@example.com'],
                actorUserUuid: 'actor-user-uuid',
            });
        },
    );

    it('rejects unknown fields, untrimmed names, and duplicate emails', async () => {
        await expect(
            service.upsertGroupAsCode(createAccount(), 'organization-uuid', {
                ...group(),
                extra: true,
            } as GroupAsCode),
        ).rejects.toThrow('Unknown group fields: extra');
        await expect(
            service.upsertGroupAsCode(
                createAccount(),
                'organization-uuid',
                group({ name: ' Finance ' }),
            ),
        ).rejects.toThrow('must not have surrounding whitespace');
        await expect(
            service.upsertGroupAsCode(
                createAccount(),
                'organization-uuid',
                group({
                    members: ['person@example.com', 'PERSON@example.com'],
                }),
            ),
        ).rejects.toThrow('Duplicate group member emails');
        expect(groupsModel.upsertGroupAsCode).not.toHaveBeenCalled();
    });

    it('rejects cross-organization access and accounts without manage Group', async () => {
        await expect(
            service.upsertGroupAsCode(
                createAccount(),
                'different-organization',
                group(),
            ),
        ).rejects.toThrow();
        await expect(
            service.upsertGroupAsCode(
                createAccount('session', false),
                'organization-uuid',
                group(),
            ),
        ).rejects.toThrow();
        expect(groupsModel.upsertGroupAsCode).not.toHaveBeenCalled();
    });

    it('respects the existing groups feature flag', async () => {
        featureFlagService.get.mockResolvedValueOnce({ enabled: false });

        await expect(
            service.upsertGroupAsCode(
                createAccount(),
                'organization-uuid',
                group(),
            ),
        ).rejects.toThrow('Group service is not enabled');
        expect(groupsModel.upsertGroupAsCode).not.toHaveBeenCalled();
    });
});
