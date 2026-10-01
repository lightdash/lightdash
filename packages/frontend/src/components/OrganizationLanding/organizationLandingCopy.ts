import {
    OrganizationJoinRequestStatus,
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

export const LANDING_VISIBLE_MATCHES = 5;

export const isPendingRequest = (
    match: OrganizationLanding['requestable'][number],
): boolean =>
    match.joinRequest?.status === OrganizationJoinRequestStatus.PENDING;

export const getMatchCount = (landing: OrganizationLanding): number =>
    landing.joinable.length + landing.requestable.length;

export const shouldShowOrganizationSearch = (
    landing: OrganizationLanding,
): boolean => getMatchCount(landing) > LANDING_VISIBLE_MATCHES;

export type VisibleLandingMatches = Pick<
    OrganizationLanding,
    'joinable' | 'requestable'
> & { hiddenCount: number };

export const getVisibleLandingMatches = (
    landing: OrganizationLanding,
    query: string,
): VisibleLandingMatches => {
    const search = query.trim().toLowerCase();
    if (search) {
        const matchesSearch = ({ name }: { name: string }) =>
            getOrganizationDisplayName(name).toLowerCase().includes(search);
        return {
            joinable: landing.joinable.filter(matchesSearch),
            requestable: landing.requestable.filter(matchesSearch),
            hiddenCount: 0,
        };
    }
    const pending = landing.requestable.filter(isPendingRequest);
    const budget = Math.max(LANDING_VISIBLE_MATCHES - pending.length, 0);
    const joinable = landing.joinable.slice(0, budget);
    const requestable = [
        ...pending,
        ...landing.requestable
            .filter((match) => !isPendingRequest(match))
            .slice(0, budget - joinable.length),
    ];
    return {
        joinable,
        requestable,
        hiddenCount:
            getMatchCount(landing) - joinable.length - requestable.length,
    };
};
