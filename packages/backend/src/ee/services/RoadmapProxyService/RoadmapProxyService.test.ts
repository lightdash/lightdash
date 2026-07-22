import {
    ForbiddenError,
    MissingConfigError,
    RoadmapItemStatus,
    SessionUser,
    UnexpectedServerError,
} from '@lightdash/common';
import type { Mocked } from 'vitest';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import type { LightdashConfig } from '../../../config/parseConfig';
import type { FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { RoadmapProxyService } from './RoadmapProxyService';

const organizationUuid = '11111111-1111-1111-1111-111111111111';

const user = {
    userUuid: '22222222-2222-2222-2222-222222222222',
    organizationUuid,
} as SessionUser;

const configuredConfig: LightdashConfig = {
    ...lightdashConfigMock,
    license: { licenseKey: 'license-key' },
    roadmap: {
        ...lightdashConfigMock.roadmap,
        serviceUrl: 'https://roadmap.lightdash.com/',
    },
};

const createFeatureFlagService = (
    enabled: boolean,
): Mocked<Pick<FeatureFlagService, 'get'>> => ({
    get: vi.fn().mockResolvedValue({ id: 'roadmap', enabled }),
});

const buildService = (
    featureFlagService: ReturnType<typeof createFeatureFlagService>,
    config: LightdashConfig = configuredConfig,
) =>
    new RoadmapProxyService({
        lightdashConfig: config,
        featureFlagService: featureFlagService as unknown as FeatureFlagService,
    });

const curatedItem = {
    title: 'Dark mode',
    description: 'please',
    status: RoadmapItemStatus.BUILDING,
    issueUrl: null,
    pullRequestUrl: null,
};

describe('RoadmapProxyService', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    it('throws ForbiddenError when the feature flag is disabled', async () => {
        const service = buildService(createFeatureFlagService(false));

        await expect(service.getRoadmapForUser(user)).rejects.toThrow(
            ForbiddenError,
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws ForbiddenError when the user has no organization', async () => {
        const service = buildService(createFeatureFlagService(true));

        await expect(
            service.getRoadmapForUser({
                userUuid: user.userUuid,
            } as SessionUser),
        ).rejects.toThrow(ForbiddenError);
    });

    it('throws MissingConfigError when the service URL is not configured', async () => {
        const service = buildService(createFeatureFlagService(true), {
            ...configuredConfig,
            roadmap: { ...configuredConfig.roadmap, serviceUrl: null },
        });

        await expect(service.getRoadmapForUser(user)).rejects.toThrow(
            MissingConfigError,
        );
    });

    it('throws MissingConfigError when the license key is not configured', async () => {
        const service = buildService(createFeatureFlagService(true), {
            ...configuredConfig,
            license: { licenseKey: null },
        });

        await expect(service.getRoadmapForUser(user)).rejects.toThrow(
            MissingConfigError,
        );
    });

    it('fetches the org roadmap with the license key header', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ status: 'ok', results: [curatedItem] }),
        });
        const service = buildService(createFeatureFlagService(true));

        const items = await service.getRoadmapForUser(user);

        expect(items).toEqual([curatedItem]);
        expect(fetchMock).toHaveBeenCalledWith(
            `https://roadmap.lightdash.com/api/v1/roadmap/organizations/${organizationUuid}`,
            { headers: { 'lightdash-license-key': 'license-key' } },
        );
    });

    it('serves exactly the allowlisted fields when upstream adds extras', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                status: 'ok',
                results: [{ ...curatedItem, id: 'leak', sortOrder: 3 }],
            }),
        });
        const service = buildService(createFeatureFlagService(true));

        const items = await service.getRoadmapForUser(user);

        expect(items).toEqual([curatedItem]);
        expect(Object.keys(items[0]).sort()).toEqual([
            'description',
            'issueUrl',
            'pullRequestUrl',
            'status',
            'title',
        ]);
    });

    it('excludes items the redaction checkpoint rejects', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                status: 'ok',
                results: [
                    curatedItem,
                    { ...curatedItem, title: 'Leaky', arr: 100000 },
                ],
            }),
        });
        const service = buildService(createFeatureFlagService(true));

        const items = await service.getRoadmapForUser(user);

        expect(items).toEqual([curatedItem]);
    });

    it('throws without forwarding upstream error details on non-ok responses', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 401,
            text: async () => 'Invalid license key [SECRET_DETAIL]',
        });
        const service = buildService(createFeatureFlagService(true));

        const error = await service.getRoadmapForUser(user).catch((e) => e);

        expect(error).toBeInstanceOf(UnexpectedServerError);
        expect(error.message).not.toContain('SECRET_DETAIL');
    });

    it('throws when the response has no results array', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ status: 'ok' }),
        });
        const service = buildService(createFeatureFlagService(true));

        await expect(service.getRoadmapForUser(user)).rejects.toThrow(
            UnexpectedServerError,
        );
    });

    it('throws when the roadmap service is unreachable', async () => {
        fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        const service = buildService(createFeatureFlagService(true));

        await expect(service.getRoadmapForUser(user)).rejects.toThrow(
            'Could not reach the roadmap service',
        );
    });
});
