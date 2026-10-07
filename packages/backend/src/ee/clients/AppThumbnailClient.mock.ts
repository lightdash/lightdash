import { type OrganizationSettings } from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import {
    AppThumbnailClient,
    type AppThumbnailClientArgs,
    type AppThumbnailStorage,
} from './AppThumbnailClient';

const SIGNED_URL_PREFIX = 'https://storage.test/';

/** A bucket held in memory; `download` follows a signed URL to its image. */
export const createInMemoryAppThumbnailStorage = () => {
    const objects = new Map<string, Buffer>();
    const storage: AppThumbnailStorage = {
        put: async (key, image) => {
            objects.set(key, image);
        },
        exists: async (key) => objects.has(key),
        copy: async (fromKey, toKey) => {
            const image = objects.get(fromKey);
            if (!image) throw new Error(`No such object: ${fromKey}`);
            objects.set(toKey, image);
        },
        delete: async (key) => {
            objects.delete(key);
        },
        getSignedUrl: async (key) => `${SIGNED_URL_PREFIX}${key}`,
    };
    const download = (url: string | null): string | null => {
        if (url === null) return null;
        return (
            objects.get(url.slice(SIGNED_URL_PREFIX.length))?.toString() ?? null
        );
    };
    return { storage, objects, download };
};

const NOTHING_STORED: OrganizationSettings = {
    oidcLinkingEnabled: null,
    oidcToEmailLinkingEnabled: null,
    supportImpersonationEnabled: null,
    semanticLayerPgwireEnabled: null,
    inviteLinkExpirationDays: null,
    scheduledDeliveryExpirationSeconds: null,
    scheduledDeliveryExpirationSecondsEmail: null,
    scheduledDeliveryExpirationSecondsSlack: null,
    scheduledDeliveryExpirationSecondsMsTeams: null,
    scheduledDeliveryExpirationSecondsGoogleChat: null,
    queryLimit: null,
    csvCellsLimit: null,
    corsAllowedDomains: null,
    dataAppAutomaticThumbnailsEnabled: null,
};

/** Organization settings where each org's stored automatic capture choice is read on every call. */
export const organizationSettingsModelWith = (
    storedChoice: (organizationUuid: string) => boolean | null,
): AppThumbnailClientArgs['organizationSettingsModel'] => ({
    get: async (organizationUuid) => ({
        ...NOTHING_STORED,
        dataAppAutomaticThumbnailsEnabled: storedChoice(organizationUuid),
    }),
});

type AppThumbnailClientMockArgs = {
    appModel: AppThumbnailClientArgs['appModel'];
    headlessBrowserConfigured: boolean;
    captureDataAppVersion: AppThumbnailClientArgs['unfurlService']['captureDataAppVersion'];
    storage: AppThumbnailStorage;
    organizationSettingsModel: AppThumbnailClientArgs['organizationSettingsModel'];
};

/** A thumbnail client on fakes: no headless browser and an empty bucket by default. */
export const buildAppThumbnailClientMock = ({
    appModel = {} as AppThumbnailClientArgs['appModel'],
    headlessBrowserConfigured = false,
    captureDataAppVersion = async () => {
        throw new Error('No headless browser in this test');
    },
    storage = createInMemoryAppThumbnailStorage().storage,
    organizationSettingsModel = organizationSettingsModelWith(() => null),
}: Partial<AppThumbnailClientMockArgs> = {}): AppThumbnailClient =>
    new AppThumbnailClient({
        lightdashConfig: {
            ...lightdashConfigMock,
            headlessBrowser: {
                ...lightdashConfigMock.headlessBrowser,
                host: headlessBrowserConfigured
                    ? 'headless-browser'
                    : undefined,
            },
        },
        appModel,
        unfurlService: { captureDataAppVersion },
        storage,
        organizationSettingsModel,
    });
