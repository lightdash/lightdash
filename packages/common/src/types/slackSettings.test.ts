import {
    getSlackFeatureAvailability,
    getSlackInstallScopes,
    SLACK_FEATURE_SCOPES,
    SlackFeature,
} from './slackSettings';

const BASE_INSTALL_SCOPES = [
    'links:read',
    'links:write',
    'chat:write',
    'chat:write.customize',
    'channels:read',
    'groups:read',
    'users:read',
    'app_mentions:read',
    'files:write',
    'files:read',
    'reactions:write',
];
const COMMERCIAL_INSTALL_SCOPES = [
    ...BASE_INSTALL_SCOPES,
    'channels:history',
    'groups:history',
];

const sorted = (scopes: string[]) => [...scopes].sort();

describe('getSlackInstallScopes', () => {
    it('matches the historical non-commercial install list exactly', () => {
        expect(sorted(getSlackInstallScopes(false))).toEqual(
            sorted(BASE_INSTALL_SCOPES),
        );
    });

    it('matches the historical commercial install list exactly', () => {
        expect(sorted(getSlackInstallScopes(true))).toEqual(
            sorted(COMMERCIAL_INSTALL_SCOPES),
        );
    });

    it('has no duplicate scopes', () => {
        const scopes = getSlackInstallScopes(true);
        expect(new Set(scopes).size).toBe(scopes.length);
    });
});

describe('getSlackFeatureAvailability', () => {
    it('marks every feature available for a full install', () => {
        const result = getSlackFeatureAvailability(
            COMMERCIAL_INSTALL_SCOPES,
            true,
        );
        Object.values(SlackFeature).forEach((feature) => {
            expect(result[feature]).toEqual({
                available: true,
                missingScopes: [],
            });
        });
    });

    it('treats undefined and empty scopes as nothing granted', () => {
        [undefined, []].forEach((granted) => {
            const result = getSlackFeatureAvailability(granted, false);
            expect(result.scheduledDeliveries.available).toBe(false);
            expect(result.scheduledDeliveries.missingScopes).toEqual(
                SLACK_FEATURE_SCOPES[SlackFeature.SCHEDULED_DELIVERIES].scopes,
            );
        });
    });

    it('only disables custom app profile when chat:write.customize is missing', () => {
        const granted = COMMERCIAL_INSTALL_SCOPES.filter(
            (s) => s !== 'chat:write.customize',
        );
        const result = getSlackFeatureAvailability(granted, true);
        expect(result.customAppProfile).toEqual({
            available: false,
            missingScopes: ['chat:write.customize'],
        });
        expect(result.scheduledDeliveries.available).toBe(true);
        expect(result.linkUnfurling.available).toBe(true);
        expect(result.writebackReactions.available).toBe(true);
        expect(result.aiAgent.available).toBe(true);
    });

    it('only disables writeback reactions when reactions:write is missing', () => {
        const granted = COMMERCIAL_INSTALL_SCOPES.filter(
            (s) => s !== 'reactions:write',
        );
        const result = getSlackFeatureAvailability(granted, true);
        expect(result.writebackReactions.available).toBe(false);
        expect(result.scheduledDeliveries.available).toBe(true);
        expect(result.customAppProfile.available).toBe(true);
        expect(result.aiAgent.available).toBe(true);
    });

    it('disables both deliveries and AI agent when the shared chat:write is missing', () => {
        const granted = COMMERCIAL_INSTALL_SCOPES.filter(
            (s) => s !== 'chat:write',
        );
        const result = getSlackFeatureAvailability(granted, true);
        expect(result.scheduledDeliveries).toEqual({
            available: false,
            missingScopes: ['chat:write'],
        });
        expect(result.aiAgent).toEqual({
            available: false,
            missingScopes: ['chat:write'],
        });
    });

    it('does not require commercial scopes on the non-commercial edition', () => {
        const result = getSlackFeatureAvailability(BASE_INSTALL_SCOPES, false);
        expect(result.aiAgent).toEqual({ available: true, missingScopes: [] });
    });

    it('requires history scopes for the AI agent on the commercial edition', () => {
        const result = getSlackFeatureAvailability(BASE_INSTALL_SCOPES, true);
        expect(result.aiAgent).toEqual({
            available: false,
            missingScopes: ['channels:history', 'groups:history'],
        });
        expect(result.scheduledDeliveries.available).toBe(true);
    });

    it('lists missing scopes in the feature declaration order', () => {
        const result = getSlackFeatureAvailability(['chat:write'], false);
        expect(result.scheduledDeliveries.missingScopes).toEqual([
            'files:write',
            'files:read',
            'channels:read',
            'groups:read',
            'users:read',
        ]);
    });
});
