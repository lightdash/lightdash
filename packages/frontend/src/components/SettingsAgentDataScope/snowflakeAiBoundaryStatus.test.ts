import { type SnowflakeAiBoundaryGuideConfig } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getBoundarySecuritySummary,
    getRefusedMemberCount,
    needsRestrictionsConfirmation,
} from './snowflakeAiBoundaryStatus';

const config: SnowflakeAiBoundaryGuideConfig = {
    redirectUri: '',
    snowflakeAccount: '',
    cloud: false,
    aiSignInEnabled: false,
    signedIn: false,
    memberCount: 3,
    signedInMemberCount: 1,
    readyIdentityCount: 2,
    aiIdentityAccountUuid: null,
    aiIdentitiesEnabled: true,
    identityNames: [],
    restrictionsEnabled: false,
    boundaryVerified: false,
    state: { marks: {}, lastTest: null },
    statuses: {
        prerequisites: 'not_started',
        masking: 'not_started',
        session_policy: 'not_started',
        identities: 'needs_attention',
        oauth: 'not_started',
        checks: 'not_started',
    },
};

describe('boundary restrictions confirmation', () => {
    it('counts people who will be refused using the active identity path', () => {
        expect(getRefusedMemberCount(config)).toBe(1);
        expect(
            getRefusedMemberCount({ ...config, aiIdentitiesEnabled: false }),
        ).toBe(2);
    });
    it('requires confirmation for unrun checks even when every identity is ready', () => {
        expect(
            needsRestrictionsConfirmation({ ...config, readyIdentityCount: 3 }),
        ).toBe(true);
    });
    it('requires confirmation when a person is not ready even with verified checks', () => {
        expect(
            needsRestrictionsConfirmation({
                ...config,
                statuses: { ...config.statuses, checks: 'verified' },
            }),
        ).toBe(true);
    });
    it('does not require confirmation when checks and every identity are ready', () => {
        expect(
            needsRestrictionsConfirmation({
                ...config,
                readyIdentityCount: 3,
                statuses: { ...config.statuses, checks: 'verified' },
            }),
        ).toBe(false);
    });
    it('exports attributed manual evidence without calling it verified', () => {
        const summary = getBoundarySecuritySummary({
            ...config,
            state: {
                marks: {
                    masking: {
                        userUuid: 'user',
                        name: 'Test Admin',
                        at: '2026-10-05T10:00:00Z',
                    },
                },
                lastTest: null,
            },
        });
        expect(summary).toContain('marked as done by Test Admin on 2026-10-05');
        expect(summary).toContain('Checks have not run.');
        expect(summary).toContain('Does not cover:');
    });
});
