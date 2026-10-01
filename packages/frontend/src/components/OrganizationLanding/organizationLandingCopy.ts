import {
    validateOrganizationEmailDomains,
    type OrganizationLanding,
} from '@lightdash/common';
import { inferOrganizationName } from '../../utils/organizationName';

export const getRequestCardContext = (landing: OrganizationLanding): string =>
    landing.canCreateOrganization
        ? `People at ${landing.emailDomain} use this organization. An admin approves new members.`
        : 'This Lightdash instance has this organization. An admin approves new members.';

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
