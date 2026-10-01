import {
    validateOrganizationEmailDomains,
    type OrganizationLanding,
} from '@lightdash/common';
import { inferOrganizationName } from '../../utils/organizationName';

export const getOrganizationDisplayName = (name: string): string =>
    name.trim() || 'Unnamed organization';

export const formatMemberCount = (count: number): string =>
    `${count} ${count === 1 ? 'member' : 'members'}`;

export const getRequestListIntro = (landing: OrganizationLanding): string => {
    const organizations =
        landing.requestable.length === 1
            ? 'this organization'
            : 'these organizations';
    return landing.canCreateOrganization
        ? `People at ${landing.emailDomain} use ${organizations}. An admin approves new members.`
        : `This Lightdash instance has ${organizations}. An admin approves new members.`;
};

export const getLandingTitle = (landing: OrganizationLanding | undefined) =>
    landing?.canCreateOrganization &&
    landing.joinable.length === 0 &&
    landing.requestable.length === 0
        ? 'Create your organization'
        : 'Choose your organization';

export const getCreateOrganizationWarning = (
    landing: OrganizationLanding,
): string | null =>
    landing.joinable.length > 0 || landing.requestable.length > 0
        ? `This creates a separate organization. People at ${landing.emailDomain} who already use Lightdash will not see it.`
        : null;

export const hasNoWayIn = (landing: OrganizationLanding): boolean =>
    !landing.canCreateOrganization &&
    landing.joinable.length === 0 &&
    landing.requestable.length === 0;

export const getSuggestedOrganizationName = (
    landing: OrganizationLanding,
): string =>
    getCreateOrganizationWarning(landing) === null &&
    !validateOrganizationEmailDomains([landing.emailDomain])
        ? inferOrganizationName(landing.emailDomain)
        : '';
