import { Ability } from '@casl/ability';
import {
    PromotionAction,
    type Account,
    type PossibleAbilities,
    type UserAttributeAsCode,
} from '@lightdash/common';
import { UserAttributesService } from './UserAttributesService';

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
    canManageOrganization: boolean = true,
): Account =>
    ({
        authentication: createAuthentication(authenticationType),
        user: {
            type: 'registered',
            userUuid: 'actor-user-uuid',
            ability: new Ability<PossibleAbilities>(
                canManageOrganization
                    ? [
                          {
                              action: 'manage',
                              subject: 'Organization',
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

describe('user attributes as code', () => {
    const analytics = { track: vi.fn() };
    const userAttributesModel = {
        find: vi.fn(),
        create: vi.fn(),
        get: vi.fn(),
        update: vi.fn(),
    };
    const groupsModel = { find: vi.fn() };
    const organizationMemberProfileModel = {
        findOrganizationMembersByEmails: vi.fn(),
    };
    const service = new UserAttributesService({
        analytics: analytics as never,
        userAttributesModel: userAttributesModel as never,
        groupsModel: groupsModel as never,
        organizationMemberProfileModel: organizationMemberProfileModel as never,
    });
    const document: UserAttributeAsCode = {
        version: 1,
        name: 'team_id',
        description: 'Team',
        attributeDefaults: null,
        users: [{ email: 'analyst@example.com', values: ['a', 'b'] }],
        groups: [{ name: 'Team A', values: ['a'] }],
    };
    const stored = {
        uuid: 'attribute-uuid',
        organizationUuid: 'organization-uuid',
        name: document.name,
        description: document.description,
        attributeDefaults: null,
        users: [
            {
                userUuid: 'member-uuid',
                email: 'analyst@example.com',
                values: ['b', 'a'],
            },
        ],
        groups: [{ groupUuid: 'group-uuid', values: ['a'] }],
    };
    beforeEach(() => {
        vi.resetAllMocks();
        userAttributesModel.find.mockResolvedValue([]);
        userAttributesModel.get.mockResolvedValue(stored);
        userAttributesModel.create.mockResolvedValue(stored);
        userAttributesModel.update.mockResolvedValue(stored);
        groupsModel.find.mockResolvedValue({
            data: [{ uuid: 'group-uuid', name: 'Team A' }],
        });
        organizationMemberProfileModel.findOrganizationMembersByEmails.mockResolvedValue(
            [{ userUuid: 'member-uuid', email: 'analyst@example.com' }],
        );
    });
    it.each(['session', 'pat', 'service-account'] as const)(
        'creates through %s using destination identities',
        async (auth) => {
            await expect(
                service.upsertUserAttributeAsCode(
                    createAccount(auth),
                    'organization-uuid',
                    document,
                ),
            ).resolves.toEqual({ action: PromotionAction.CREATE });
            expect(userAttributesModel.create).toHaveBeenCalledWith(
                'organization-uuid',
                {
                    name: 'team_id',
                    description: 'Team',
                    attributeDefaults: null,
                    users: [{ userUuid: 'member-uuid', values: ['a', 'b'] }],
                    groups: [{ groupUuid: 'group-uuid', values: ['a'] }],
                },
            );
        },
    );
    it('exports portable references and stable values', async () => {
        userAttributesModel.find.mockResolvedValue([stored]);
        await expect(
            service.getUserAttributesAsCode(
                createAccount(),
                'organization-uuid',
            ),
        ).resolves.toEqual([document]);
    });
    it('does not write or emit change analytics on an unchanged upload', async () => {
        userAttributesModel.find.mockResolvedValue([stored]);
        await expect(
            service.upsertUserAttributeAsCode(
                createAccount(),
                'organization-uuid',
                document,
            ),
        ).resolves.toEqual({ action: PromotionAction.NO_CHANGES });
        expect(userAttributesModel.update).not.toHaveBeenCalled();
        expect(analytics.track).not.toHaveBeenCalled();
    });
    it('replaces assignments and clears description and defaults explicitly', async () => {
        userAttributesModel.find.mockResolvedValue([stored]);
        await expect(
            service.upsertUserAttributeAsCode(
                createAccount(),
                'organization-uuid',
                { ...document, description: null, users: [], groups: [] },
            ),
        ).resolves.toEqual({ action: PromotionAction.UPDATE });
        expect(userAttributesModel.update).toHaveBeenCalledWith(
            'organization-uuid',
            'attribute-uuid',
            {
                name: 'team_id',
                description: '',
                attributeDefaults: null,
                users: [],
                groups: [],
            },
        );
    });
    it.each(['user', 'group'])(
        'rejects an unknown %s before mutation',
        async (kind) => {
            if (kind === 'user')
                organizationMemberProfileModel.findOrganizationMembersByEmails.mockResolvedValue(
                    [],
                );
            else groupsModel.find.mockResolvedValue({ data: [] });
            await expect(
                service.upsertUserAttributeAsCode(
                    createAccount(),
                    'organization-uuid',
                    document,
                ),
            ).rejects.toThrow('Unknown or ambiguous');
            expect(userAttributesModel.create).not.toHaveBeenCalled();
            expect(userAttributesModel.update).not.toHaveBeenCalled();
        },
    );
    it.each(['read', 'write'])(
        'rejects cross-organization %s before lookup',
        async (operation) => {
            await expect(
                operation === 'read'
                    ? service.getUserAttributesAsCode(
                          createAccount(),
                          'other-org',
                      )
                    : service.upsertUserAttributeAsCode(
                          createAccount(),
                          'other-org',
                          document,
                      ),
            ).rejects.toThrow();
            expect(userAttributesModel.find).not.toHaveBeenCalled();
            expect(groupsModel.find).not.toHaveBeenCalled();
        },
    );
    it.each(['read', 'write'])(
        'rejects unauthorized %s before lookup',
        async (operation) => {
            const account = createAccount('pat', false);
            await expect(
                operation === 'read'
                    ? service.getUserAttributesAsCode(
                          account,
                          'organization-uuid',
                      )
                    : service.upsertUserAttributeAsCode(
                          account,
                          'organization-uuid',
                          document,
                      ),
            ).rejects.toThrow();
            expect(userAttributesModel.find).not.toHaveBeenCalled();
        },
    );
    it('rejects conflicting assignments before lookup', async () => {
        await expect(
            service.upsertUserAttributeAsCode(
                createAccount(),
                'organization-uuid',
                {
                    ...document,
                    users: [
                        ...document.users,
                        { email: 'ANALYST@example.com', values: ['c'] },
                    ],
                },
            ),
        ).rejects.toThrow('Duplicate');
        expect(userAttributesModel.find).not.toHaveBeenCalled();
    });
});
