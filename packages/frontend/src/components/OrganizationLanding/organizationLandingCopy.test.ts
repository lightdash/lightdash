import { type OrganizationLanding } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getCreateOrganizationWarning,
    getRequestCardContext,
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

describe('getRequestCardContext', () => {
    it('names the domain', () => {
        expect(getRequestCardContext(landing())).toContain(
            'People at acme.com use this organization',
        );
    });

    it('talks about the instance when it allows one organization', () => {
        expect(
            getRequestCardContext(landing({ canCreateOrganization: false })),
        ).toContain('This Lightdash instance has this organization');
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
