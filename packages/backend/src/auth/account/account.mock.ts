import { Ability } from '@casl/ability';
import {
    AnonymousAccount,
    CreateEmbedJwt,
    Embed,
    OrganizationMemberRole,
    PossibleAbilities,
    SessionAccount,
    SessionUser,
    UserAccessControls,
} from '@lightdash/common';
import { fromJwt, fromSession } from './account';

const defaultUserId = 'test-user-uuid';
const defaultOrganizationUuid = 'test-org-uuid';
const defaultOrganizationName = 'Test Organization';
const defaultEmail = 'test@example.com';

export const defaultSessionUser: SessionUser = {
    userUuid: defaultUserId,
    userId: 123,
    role: OrganizationMemberRole.DEVELOPER,
    email: defaultEmail,
    firstName: 'Test',
    lastName: 'User',
    organizationUuid: defaultOrganizationUuid,
    organizationName: defaultOrganizationName,
    organizationCreatedAt: new Date('2024-01-01'),
    isActive: true,
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ability: new Ability<PossibleAbilities>([
        { subject: 'Project', action: ['update', 'view'] },
        { subject: 'Job', action: ['view'] },
        { subject: 'SqlRunner', action: ['manage'] },
        { subject: 'Explore', action: ['manage'] },
    ]),
    abilityRules: [],
};

export const defaultOrganization: Embed['organization'] = {
    organizationUuid: defaultOrganizationUuid,
    name: defaultOrganizationName,
};

export const defaultJwtToken: CreateEmbedJwt = {
    user: {
        externalId: 'external-user-123',
        email: 'external@example.com',
    },
    content: {
        type: 'dashboard',
        dashboardUuid: 'test-dashboard-uuid',
        dashboardFiltersInteractivity: {
            enabled: true,
            allowedFilters: ['department', 'region'],
        },
    },
};

export const defaultUserAttributes: UserAccessControls = {
    userAttributes: {
        department: ['engineering'],
        region: ['us-west'],
    },
    intrinsicUserAttributes: {
        email: 'external@example.com',
    },
};

/**
 * Builds an account with customizable accountType
 */
export function buildAccount(params: {
    accountType: 'session';
}): SessionAccount;
export function buildAccount(params: { accountType: 'jwt' }): AnonymousAccount;
export function buildAccount(): SessionAccount;
export function buildAccount({
    accountType = 'session',
}: {
    accountType?: 'session' | 'jwt';
} = {}) {
    if (accountType === 'session') {
        return fromSession(defaultSessionUser, 'session-cookie');
    }
    return fromJwt({
        decodedToken: defaultJwtToken,
        organization: defaultOrganization,
        source: 'test-jwt-token',
        dashboardUuid: 'test-dashboard-uuid',
        userAttributes: defaultUserAttributes,
    });
}
