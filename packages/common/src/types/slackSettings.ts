import { type SlackChannelProjectMapping } from './slack';

export enum SlackFeature {
    SCHEDULED_DELIVERIES = 'scheduledDeliveries',
    CUSTOM_APP_PROFILE = 'customAppProfile',
    LINK_UNFURLING = 'linkUnfurling',
    WRITEBACK_REACTIONS = 'writebackReactions',
    AI_AGENT = 'aiAgent',
}

type SlackFeatureScopes = {
    scopes: string[];
    // Only required on the commercial edition
    commercialScopes: string[];
};

export const SLACK_FEATURE_SCOPES: Record<SlackFeature, SlackFeatureScopes> = {
    [SlackFeature.SCHEDULED_DELIVERIES]: {
        scopes: [
            'chat:write',
            'files:write',
            'files:read',
            'channels:read',
            'groups:read',
            'users:read',
        ],
        commercialScopes: [],
    },
    [SlackFeature.CUSTOM_APP_PROFILE]: {
        scopes: ['chat:write.customize'],
        commercialScopes: [],
    },
    [SlackFeature.LINK_UNFURLING]: {
        scopes: ['links:read', 'links:write'],
        commercialScopes: [],
    },
    [SlackFeature.WRITEBACK_REACTIONS]: {
        scopes: ['reactions:write'],
        commercialScopes: [],
    },
    [SlackFeature.AI_AGENT]: {
        scopes: [
            'app_mentions:read',
            'chat:write',
            'users:read',
            'files:read',
            'files:write',
        ],
        commercialScopes: ['channels:history', 'groups:history'],
    },
};

export type SlackFeatureAvailability = {
    available: boolean;
    missingScopes: string[];
};

// Explicit keys (not Record<SlackFeature, ...>) so TSOA can emit the schema
export type SlackFeatureAvailabilityMap = {
    scheduledDeliveries: SlackFeatureAvailability;
    customAppProfile: SlackFeatureAvailability;
    linkUnfurling: SlackFeatureAvailability;
    writebackReactions: SlackFeatureAvailability;
    aiAgent: SlackFeatureAvailability;
};

const getFeatureScopes = (
    feature: SlackFeature,
    isCommercial: boolean,
): string[] => {
    const { scopes, commercialScopes } = SLACK_FEATURE_SCOPES[feature];
    return isCommercial ? [...scopes, ...commercialScopes] : scopes;
};

export const getSlackInstallScopes = (isCommercial: boolean): string[] =>
    Array.from(
        new Set(
            Object.values(SlackFeature).flatMap((feature) =>
                getFeatureScopes(feature, isCommercial),
            ),
        ),
    );

const getAvailability = (
    granted: Set<string>,
    feature: SlackFeature,
    isCommercial: boolean,
): SlackFeatureAvailability => {
    const missingScopes = getFeatureScopes(feature, isCommercial).filter(
        (scope) => !granted.has(scope),
    );
    return { available: missingScopes.length === 0, missingScopes };
};

export const getSlackFeatureAvailability = (
    grantedScopes: string[] | undefined,
    isCommercial: boolean,
): SlackFeatureAvailabilityMap => {
    const granted = new Set(grantedScopes ?? []);
    return {
        scheduledDeliveries: getAvailability(
            granted,
            SlackFeature.SCHEDULED_DELIVERIES,
            isCommercial,
        ),
        customAppProfile: getAvailability(
            granted,
            SlackFeature.CUSTOM_APP_PROFILE,
            isCommercial,
        ),
        linkUnfurling: getAvailability(
            granted,
            SlackFeature.LINK_UNFURLING,
            isCommercial,
        ),
        writebackReactions: getAvailability(
            granted,
            SlackFeature.WRITEBACK_REACTIONS,
            isCommercial,
        ),
        aiAgent: getAvailability(granted, SlackFeature.AI_AGENT, isCommercial),
    };
};

export type SlackSettings = {
    organizationUuid: string;
    slackTeamName: string;
    appName?: string;
    createdAt: Date;
    token?: string;
    scopes: string[];
    notificationChannel: string | undefined;
    appProfilePhotoUrl: string | undefined;
    slackChannelProjectMappings?: SlackChannelProjectMapping[];
    aiThreadAccessConsent?: boolean;
    // True when every install scope is granted
    hasRequiredScopes: boolean;
    features: SlackFeatureAvailabilityMap;
    aiRequireOAuth?: boolean;
    aiLinksOnly?: boolean;
    aiMultiAgentChannelId?: string;
    aiMultiAgentProjectUuids?: string[] | null;
    unfurlsEnabled?: boolean;
    aiAgentsEnabled?: boolean;
};
