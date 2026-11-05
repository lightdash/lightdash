import { type SlackSettings } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { normalizeSlackSettings } from './useSlack';

const base = {
    organizationUuid: 'org',
    slackTeamName: 'team',
    createdAt: new Date(),
    scopes: [],
    notificationChannel: undefined,
    appProfilePhotoUrl: undefined,
    hasRequiredScopes: false,
};

const ok = { available: true, missingScopes: [] };

const normalized = (
    raw: Parameters<typeof normalizeSlackSettings>[0],
): SlackSettings => {
    const result = normalizeSlackSettings(raw);
    if (result === undefined) throw new Error('expected settings');
    return result;
};

describe('normalizeSlackSettings', () => {
    it('keeps features from a current API response untouched', () => {
        const features: SlackSettings['features'] = {
            scheduledDeliveries: ok,
            customAppProfile: { available: false, missingScopes: ['x'] },
            linkUnfurling: ok,
            writebackReactions: ok,
            aiAgent: ok,
        };
        expect(normalized({ ...base, features }).features).toBe(features);
    });

    it('derives every feature from hasRequiredScopes when an old API omits features', () => {
        const result = normalized({ ...base, hasRequiredScopes: true });
        Object.values(result.features).forEach((feature) => {
            expect(feature).toEqual({ available: true, missingScopes: [] });
        });
        const blocked = normalized({ ...base, hasRequiredScopes: false });
        expect(blocked.features.scheduledDeliveries.available).toBe(false);
    });

    it('passes through an absent installation', () => {
        expect(normalizeSlackSettings(undefined)).toBeUndefined();
    });
});
