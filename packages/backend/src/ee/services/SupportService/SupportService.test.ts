import { LightdashPage, SessionUser } from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { composerSavedChartVariant } from '../../../testing/composerSavedChartFixture';
import { SupportService } from './SupportService';

const ORGANIZATION_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PROJECT_UUID = '21eef0b9-5bae-40f3-851e-9554588e71a6';
const PROJECT_SLUG = 'analytics-project';

const user = {
    userUuid: '11111111-2222-4333-8444-555555555555',
    organizationUuid: ORGANIZATION_UUID,
    firstName: 'Test',
    lastName: 'User',
    role: 'admin',
} as SessionUser;

const createService = () => {
    const projectModel = {
        getUuidBySlug: vi.fn().mockResolvedValue(PROJECT_UUID),
        get: vi.fn().mockResolvedValue({
            projectUuid: PROJECT_UUID,
            name: 'Analytics project',
        }),
    };
    const unfurlService = {
        parseUrl: vi.fn().mockImplementation((url: string) => ({
            isValid: false,
            url,
            minimalUrl: url,
        })),
    };

    const service = new SupportService({
        dashboardModel: {} as never,
        savedChartModel: {} as never,
        spaceModel: {} as never,
        projectModel: projectModel as never,
        fileStorageClient: {} as never,
        organizationModel: {
            get: vi.fn().mockResolvedValue({
                organizationUuid: ORGANIZATION_UUID,
                name: 'Test organization',
            }),
        } as never,
        unfurlService: unfurlService as never,
        projectService: {} as never,
        lightdashConfig: {
            slack: { supportUrl: 'https://support.example' },
            k8s: { podNamespace: 'test' },
        } as never,
        analytics: { track: vi.fn() } as never,
    });

    return { projectModel, service, unfurlService };
};

describe('SupportService project URL parsing', () => {
    beforeEach(() => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            status: 200,
        } as Response);
    });

    it('resolves a project slug within the authenticated organization', async () => {
        const { projectModel, service, unfurlService } = createService();
        const referer = `https://app.lightdash.cloud/projects/${PROJECT_SLUG}/home`;

        await service.shareWithSupport(
            user,
            {
                canImpersonate: false,
                logs: [],
                network: [],
            },
            { referer, origin: 'https://app.lightdash.cloud' },
        );

        expect(projectModel.getUuidBySlug).toHaveBeenCalledWith(
            ORGANIZATION_UUID,
            PROJECT_SLUG,
        );
        expect(projectModel.get).toHaveBeenCalledWith(PROJECT_UUID);
        expect(unfurlService.parseUrl).toHaveBeenCalledWith(
            referer,
            ORGANIZATION_UUID,
        );
    });

    it('keeps project UUID URLs on the existing path', async () => {
        const { projectModel, service, unfurlService } = createService();
        const referer = `https://app.lightdash.cloud/projects/${PROJECT_UUID}/home`;

        await service.shareWithSupport(
            user,
            {
                canImpersonate: false,
                logs: [],
                network: [],
            },
            { referer, origin: 'https://app.lightdash.cloud' },
        );

        expect(projectModel.getUuidBySlug).not.toHaveBeenCalled();
        expect(projectModel.get).toHaveBeenCalledWith(PROJECT_UUID);
        expect(unfurlService.parseUrl).toHaveBeenCalledWith(
            referer,
            ORGANIZATION_UUID,
        );
    });
});

describe('SupportService chart details', () => {
    it('describes a composer chart from its chart config and pipeline without compiling SQL', async () => {
        const uploadTxt = vi
            .fn()
            .mockImplementation(
                async (_buffer: Buffer, name: string) =>
                    `https://files.example/${name}`,
            );
        const compileQuery = vi.fn();
        const service = new SupportService({
            dashboardModel: {} as never,
            savedChartModel: {
                getVariant: vi.fn().mockResolvedValue(
                    composerSavedChartVariant({
                        uuid: 'composer-chart-uuid',
                    }),
                ),
            } as never,
            spaceModel: {} as never,
            projectModel: {
                get: vi.fn().mockResolvedValue({
                    projectUuid: PROJECT_UUID,
                    name: 'Analytics project',
                }),
            } as never,
            fileStorageClient: { uploadTxt } as never,
            organizationModel: {
                get: vi.fn().mockResolvedValue({
                    organizationUuid: ORGANIZATION_UUID,
                    name: 'Test organization',
                }),
            } as never,
            unfurlService: {
                parseUrl: vi.fn().mockReturnValue({
                    isValid: true,
                    lightdashPage: LightdashPage.CHART,
                    projectUuid: PROJECT_UUID,
                    chartUuid: 'composer-chart-uuid',
                    url: 'https://app.example/chart',
                    minimalUrl: 'https://app.example/chart',
                }),
            } as never,
            projectService: { compileQuery } as never,
            lightdashConfig: {
                slack: { supportUrl: 'https://support.example' },
                k8s: { podNamespace: 'test' },
            } as never,
            analytics: { track: vi.fn() } as never,
        });
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            status: 200,
        } as Response);

        await service.shareWithSupport(
            user,
            { canImpersonate: false, logs: [], network: [] },
            {
                referer: `https://app.example/projects/${PROJECT_UUID}/saved/composer-chart-uuid`,
                origin: 'https://app.example',
            },
        );

        expect(compileQuery).not.toHaveBeenCalled();
        const uploaded = uploadTxt.mock.calls.map(([, name]) => name);
        expect(uploaded).toEqual(
            expect.arrayContaining([
                expect.stringMatching(/^support-chartconfig-/),
                expect.stringMatching(/^support-pipeline-/),
            ]),
        );
    });
});
