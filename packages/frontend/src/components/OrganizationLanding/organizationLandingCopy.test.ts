import { type OrganizationLanding } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    formatMemberCount,
    getOrganizationDisplayName,
    getCreateOrganizationWarning,
    getLandingTitle,
    getRequestListIntro,
    getSuggestedOrganizationName,
    hasNoWayIn,
} from './organizationLandingCopy';

const landing = (
    overrides: Partial<OrganizationLanding> = {},
): OrganizationLanding => ({
    emailDomain: 'acme.com',
    isEmailVerified: true,
    canCreateOrganization: true,
    joinable: [],
    requestable: [],
    ...overrides,
});

const match = {
    organizationUuid: 'org',
    name: 'Acme',
    hasAdmin: true,
    joinRequest: null,
};

describe('getRequestListIntro', () => {
    it('names the domain', () => {
        expect(getRequestListIntro(landing({ requestable: [match] }))).toBe(
            'People at acme.com use this organization. An admin approves new members.',
        );
    });

    it('talks about every organization when there are several', () => {
        expect(
            getRequestListIntro(landing({ requestable: [match, match] })),
        ).toContain('People at acme.com use these organizations');
    });

    it('talks about the instance when it allows one organization', () => {
        expect(
            getRequestListIntro(
                landing({ canCreateOrganization: false, requestable: [match] }),
            ),
        ).toContain('This Lightdash instance has this organization');
    });
});

describe('getLandingTitle', () => {
    it('asks to create when there is nothing to join', () => {
        expect(getLandingTitle(landing())).toBe('Create your organization');
    });

    it('asks to choose when there is something to join', () => {
        expect(getLandingTitle(landing({ requestable: [match] }))).toBe(
            'Choose your organization',
        );
    });

    it('asks to choose before the page loads', () => {
        expect(getLandingTitle(undefined)).toBe('Choose your organization');
    });
});

describe('getCreateOrganizationWarning', () => {
    it('warns before a separate organization when a match exists', () => {
        expect(
            getCreateOrganizationWarning(landing({ requestable: [match] })),
        ).toContain('separate organization');
    });

    it('does not warn without a match', () => {
        expect(getCreateOrganizationWarning(landing())).toBeNull();
    });
});

describe('hasNoWayIn', () => {
    it('is true when nothing can be joined, requested or created', () => {
        expect(hasNoWayIn(landing({ canCreateOrganization: false }))).toBe(
            true,
        );
    });

    it('is false when a request is possible', () => {
        expect(
            hasNoWayIn(
                landing({ canCreateOrganization: false, requestable: [match] }),
            ),
        ).toBe(false);
    });
});

describe('getSuggestedOrganizationName', () => {
    it('suggests a name from a company domain with no match', () => {
        expect(getSuggestedOrganizationName(landing())).not.toBe('');
    });

    it('suggests nothing when a match exists', () => {
        expect(
            getSuggestedOrganizationName(landing({ requestable: [match] })),
        ).toBe('');
    });

    it('suggests nothing for a public email domain', () => {
        expect(
            getSuggestedOrganizationName(landing({ emailDomain: 'gmail.com' })),
        ).toBe('');
    });
});

describe('formatMemberCount', () => {
    it('uses the singular for one member', () => {
        expect(formatMemberCount(1)).toBe('1 member');
    });

    it('uses the plural for other counts', () => {
        expect(formatMemberCount(0)).toBe('0 members');
        expect(formatMemberCount(7)).toBe('7 members');
    });
});

describe('getOrganizationDisplayName', () => {
    it('keeps a real name', () => {
        expect(getOrganizationDisplayName('Acme')).toBe('Acme');
    });

    it('labels an organization without a name', () => {
        expect(getOrganizationDisplayName('  ')).toBe('Unnamed organization');
    });
});
