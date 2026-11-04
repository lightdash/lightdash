import { Ability, AbilityBuilder } from '@casl/ability';
import {
    buildAbilityFromScopes,
    defineUserAbility,
    ForbiddenError,
    OrganizationMemberRole,
    type MemberAbility,
    type SessionUser,
    type SlackAppCustomSettings,
} from '@lightdash/common';
import type { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import type { SlackClient } from '../../clients/Slack/SlackClient';
import type { SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';
import { SlackIntegrationService } from './SlackIntegrationService';

const organizationUuid = 'org-uuid';
const userUuid = 'user-uuid';

const makeUser = (ability: MemberAbility): SessionUser =>
    ({
        userUuid,
        userId: 7,
        organizationUuid,
        firstName: 'Test',
        lastName: 'User',
        ability,
    }) as unknown as SessionUser;

const userWithRole = (role: OrganizationMemberRole) =>
    makeUser(defineUserAbility({ userUuid, role, organizationUuid }, []));

// Org-level custom role, built the same way production builds one from scopes.
const userWithScopes = (scopes: string[]) => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    buildAbilityFromScopes(
        {
            organizationUuid,
            userUuid,
            scopes,
            isEnterprise: true,
            organizationRole: OrganizationMemberRole.MEMBER,
        },
        builder,
    );
    return makeUser(builder.build());
};

const settings: SlackAppCustomSettings = {
    notificationChannel: null,
    appProfilePhotoUrl: null,
    aiRequireOAuth: false,
};

describe('SlackIntegrationService permissions', () => {
    const slackClient = {
        getSlackOptions: vi.fn(() => ({ clientId: 'client-id' })),
        updateAppCustomSettings: vi.fn(async () => undefined),
    };

    const service = new SlackIntegrationService({
        analytics: { track: vi.fn() } as unknown as LightdashAnalytics,
        slackAuthenticationModel: {} as SlackAuthenticationModel,
        slackClient: slackClient as unknown as SlackClient,
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getSlackInstallOptions', () => {
        it('lets an organization admin start the Slack install for their organization', async () => {
            const { metadata } = await service.getSlackInstallOptions(
                userWithRole(OrganizationMemberRole.ADMIN),
            );

            expect(metadata).toEqual({ organizationUuid, userId: 7 });
        });

        it('lets a custom role with manage:Organization start the Slack install', async () => {
            const { metadata } = await service.getSlackInstallOptions(
                userWithScopes(['manage:Organization']),
            );

            expect(metadata).toEqual({ organizationUuid, userId: 7 });
        });

        it.each([
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.VIEWER,
            OrganizationMemberRole.INTERACTIVE_VIEWER,
            OrganizationMemberRole.EDITOR,
            OrganizationMemberRole.DEVELOPER,
        ])(
            'blocks the %s role from starting the Slack install',
            async (role) => {
                await expect(
                    service.getSlackInstallOptions(userWithRole(role)),
                ).rejects.toThrow(ForbiddenError);
            },
        );

        it('does not let the AI settings scope start the Slack install', async () => {
            await expect(
                service.getSlackInstallOptions(
                    userWithScopes(['manage:OrganizationAiAgent']),
                ),
            ).rejects.toThrow(ForbiddenError);
        });
    });

    describe('updateAppCustomSettings', () => {
        it.each([
            OrganizationMemberRole.ADMIN,
            // Developers reach the org AI settings page, which saves these settings
            OrganizationMemberRole.DEVELOPER,
        ])('lets the %s role save Slack settings', async (role) => {
            await service.updateAppCustomSettings(userWithRole(role), settings);

            expect(slackClient.updateAppCustomSettings).toHaveBeenCalledWith(
                'Test User',
                organizationUuid,
                settings,
            );
        });

        it('lets a custom role with manage:OrganizationAiAgent save Slack settings', async () => {
            await service.updateAppCustomSettings(
                userWithScopes(['manage:OrganizationAiAgent']),
                settings,
            );

            expect(slackClient.updateAppCustomSettings).toHaveBeenCalledWith(
                'Test User',
                organizationUuid,
                settings,
            );
        });

        it.each([
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.VIEWER,
            OrganizationMemberRole.INTERACTIVE_VIEWER,
            OrganizationMemberRole.EDITOR,
        ])('blocks the %s role from saving Slack settings', async (role) => {
            await expect(
                service.updateAppCustomSettings(userWithRole(role), settings),
            ).rejects.toThrow(ForbiddenError);

            expect(slackClient.updateAppCustomSettings).not.toHaveBeenCalled();
        });
    });
});
