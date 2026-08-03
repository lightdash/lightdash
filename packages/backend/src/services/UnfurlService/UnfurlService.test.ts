import {
    DELIVERY_CAPTURE_GLOBAL,
    DownloadFileType,
    LightdashPage,
    LightdashRequestMethodHeader,
    NotFoundError,
    RequestMethod,
    SCREENSHOT_SELECTORS,
    UnexpectedServerError,
    type DeliveryCaptureManifest,
} from '@lightdash/common';
import type { Route, WebSocketRoute } from 'playwright';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import { type SlackClient } from '../../clients/Slack/SlackClient';
import { type LightdashConfig } from '../../config/parseConfig';
import { type AppModel } from '../../models/AppModel';
import { type DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { type DownloadFileModel } from '../../models/DownloadFileModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type SavedChartModel } from '../../models/SavedChartModel';
import { type SavedSqlModel } from '../../models/SavedSqlModel';
import { type ShareModel } from '../../models/ShareModel';
import { type SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';
import { type SlackUnfurlImageModel } from '../../models/SlackUnfurlImageModel';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { UnfurlService } from './UnfurlService';

const playwrightMocks = vi.hoisted(() => ({
    connectOverCDP: vi.fn(),
}));

const ssrfMocks = vi.hoisted(() => ({
    validatePublicHttpUrl: vi.fn(),
}));

vi.mock('playwright', () => {
    const chromium = { connectOverCDP: playwrightMocks.connectOverCDP };
    const errors = { TimeoutError: class extends Error {} };
    return {
        default: { chromium, errors },
        chromium,
        errors,
    };
});

vi.mock('../../utils/ssrfProtection', () => ({
    validatePublicHttpUrl: ssrfMocks.validatePublicHttpUrl,
}));

const mockFileStorageClient = {
    isEnabled: vi.fn(),
    uploadImage: vi.fn(),
    getFileUrl: vi.fn(),
    objectExists: vi.fn(),
    uploadPdf: vi.fn(),
    uploadTxt: vi.fn(),
    uploadCsv: vi.fn(),
    uploadZip: vi.fn(),
    uploadExcel: vi.fn(),
    streamResults: vi.fn(),
    getFileStream: vi.fn(),
    createUploadStream: vi.fn(),
    expirationDays: undefined,
};

const mockSlackUnfurlImageModel = {
    create: vi.fn(),
    get: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
};

const mockDownloadFileModel = {
    createDownloadFile: vi.fn(),
    getDownloadFile: vi.fn(),
};

function createService(
    overrides: Partial<{
        savedSqlModel: Partial<SavedSqlModel>;
        savedChartModel: Partial<SavedChartModel>;
        headlessBrowser: Record<string, unknown>;
    }> = {},
) {
    return new UnfurlService({
        lightdashConfig: {
            siteUrl: 'https://app.lightdash.cloud',
            headlessBrowser: {
                internalLightdashHost: 'http://headless-browser:8080',
                ...(overrides.headlessBrowser ?? {}),
            },
        } as unknown as LightdashConfig,
        dashboardModel: {} as unknown as DashboardModel,
        savedChartModel: (overrides.savedChartModel ??
            {}) as unknown as SavedChartModel,
        savedSqlModel: (overrides.savedSqlModel ??
            {}) as unknown as SavedSqlModel,
        appModel: {} as unknown as AppModel,
        shareModel: {} as unknown as ShareModel,
        fileStorageClient:
            mockFileStorageClient as unknown as FileStorageClient,
        slackClient: {} as unknown as SlackClient,
        projectModel: {} as unknown as ProjectModel,
        downloadFileModel:
            mockDownloadFileModel as unknown as DownloadFileModel,
        slackUnfurlImageModel:
            mockSlackUnfurlImageModel as unknown as SlackUnfurlImageModel,
        analytics: {} as unknown as LightdashAnalytics,
        slackAuthenticationModel: {} as unknown as SlackAuthenticationModel,
        spacePermissionService: {} as unknown as SpacePermissionService,
    });
}

describe('UnfurlService', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('exportChart', () => {
        it('keeps legacy slug export compatible without a project', async () => {
            const get = vi.fn().mockRejectedValue(new Error('stop'));
            const service = createService({ savedChartModel: { get } });

            await expect(
                service.exportChart('shared-slug', {} as never),
            ).rejects.toThrow('stop');
            expect(get).toHaveBeenCalledWith(
                'shared-slug',
                undefined,
                undefined,
            );
        });

        it('scopes slug resolution to the requested project', async () => {
            const get = vi.fn().mockRejectedValue(new Error('stop'));
            const service = createService({ savedChartModel: { get } });

            await expect(
                service.exportChart(
                    'shared-slug',
                    {} as never,
                    '22222222-2222-4222-8222-222222222222',
                ),
            ).rejects.toThrow('stop');
            expect(get).toHaveBeenCalledWith('shared-slug', undefined, {
                projectUuid: '22222222-2222-4222-8222-222222222222',
            });
        });

        it('keeps globally unique UUID export compatible without a project', async () => {
            const get = vi.fn().mockRejectedValue(new Error('stop'));
            const service = createService({ savedChartModel: { get } });

            await expect(
                service.exportChart(
                    '11111111-1111-4111-8111-111111111111',
                    {} as never,
                ),
            ).rejects.toThrow('stop');
            expect(get).toHaveBeenCalledWith(
                '11111111-1111-4111-8111-111111111111',
                undefined,
                undefined,
            );
        });
    });

    describe('getPreviewSignedUrl', () => {
        const service = createService();

        it('returns a signed URL when the storage object exists', async () => {
            mockSlackUnfurlImageModel.get.mockResolvedValueOnce({
                nanoid: 'abcdefghijklmnopqrstu',
                s3_key: 'slack-image-xyz.png',
                organization_uuid: '00000000-0000-0000-0000-000000000001',
                created_at: new Date(),
            });
            mockFileStorageClient.objectExists.mockResolvedValueOnce(true);
            mockFileStorageClient.getFileUrl.mockResolvedValueOnce(
                'https://s3.example.com/signed-url',
            );

            const result = await service.getPreviewSignedUrl(
                'abcdefghijklmnopqrstu',
            );

            expect(result).toBe('https://s3.example.com/signed-url');
        });

        it('throws NotFoundError when the DB row does not exist', async () => {
            mockSlackUnfurlImageModel.get.mockRejectedValueOnce(
                new NotFoundError('Slack unfurl image not found'),
            );

            await expect(
                service.getPreviewSignedUrl('nonexistentnanoid12345'),
            ).rejects.toThrow(NotFoundError);
        });

        it('throws NotFoundError when the storage object is missing', async () => {
            mockSlackUnfurlImageModel.get.mockResolvedValueOnce({
                nanoid: 'deadkeyabcdefghijklmn',
                s3_key: 'slack-image-deleted.png',
                organization_uuid: '00000000-0000-0000-0000-000000000001',
                created_at: new Date(),
            });
            mockFileStorageClient.objectExists.mockResolvedValueOnce(false);

            await expect(
                service.getPreviewSignedUrl('deadkeyabcdefghijklmn'),
            ).rejects.toThrow(NotFoundError);
        });
    });

    describe('unfurlImage image URL strategy', () => {
        const service = createService();
        const imageBuffer = Buffer.from('fake-png');

        beforeEach(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.spyOn(service as any, 'getUserCookie').mockResolvedValue(
                'mock-cookie',
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.spyOn(service as any, 'saveScreenshot').mockResolvedValue({
                imageBuffer,
                pdfBuffer: undefined,
            });
        });

        const callUnfurlImage = (orgUuid: string | undefined) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.spyOn(service as any, 'unfurlDetails').mockResolvedValue(
                orgUuid
                    ? {
                          title: 'Test',
                          organizationUuid: orgUuid,
                          pageType: 'dashboard',
                          minimalUrl: 'https://app.lightdash.cloud/test',
                          imageUrl: undefined,
                      }
                    : undefined,
            );

            return service.unfurlImage({
                url: 'https://app.lightdash.cloud/test',
                imageId: 'slack-image-test_abc',
                authUserUuid: 'user-uuid-1',
                context: 'slack' as never,
                selectedTabs: null,
            });
        };

        it('S3 enabled + orgUuid → creates preview record and returns preview URL', async () => {
            mockFileStorageClient.isEnabled.mockReturnValue(true);
            mockFileStorageClient.uploadImage.mockResolvedValue(
                'https://s3.example.com/raw-signed-url',
            );
            mockSlackUnfurlImageModel.create.mockResolvedValue(undefined);

            const result = await callUnfurlImage('org-uuid-1');

            expect(mockFileStorageClient.uploadImage).toHaveBeenCalledWith(
                imageBuffer,
                'slack-image-test_abc',
            );
            expect(mockSlackUnfurlImageModel.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    s3Key: 'slack-image-test_abc.png',
                    organizationUuid: 'org-uuid-1',
                }),
            );
            expect(result.imageUrl).toMatch(
                /^https:\/\/app\.lightdash\.cloud\/api\/v1\/slack\/preview\//,
            );
        });

        it('missing orgUuid → returns raw S3 URL, no DB create', async () => {
            mockFileStorageClient.isEnabled.mockReturnValue(true);
            mockFileStorageClient.uploadImage.mockResolvedValue(
                'https://s3.example.com/raw-signed-url',
            );

            const result = await callUnfurlImage(undefined);

            expect(mockFileStorageClient.uploadImage).toHaveBeenCalled();
            expect(mockSlackUnfurlImageModel.create).not.toHaveBeenCalled();
            expect(result.imageUrl).toBe(
                'https://s3.example.com/raw-signed-url',
            );
        });

        it('S3 disabled → uses local /tmp path', async () => {
            mockFileStorageClient.isEnabled.mockReturnValue(false);
            mockDownloadFileModel.createDownloadFile.mockResolvedValue(
                undefined,
            );

            const result = await callUnfurlImage('org-uuid-1');

            expect(mockSlackUnfurlImageModel.create).not.toHaveBeenCalled();
            expect(mockDownloadFileModel.createDownloadFile).toHaveBeenCalled();
            expect(result.imageUrl).toMatch(
                /^https:\/\/app\.lightdash\.cloud\/api\/v1\/slack\/image\//,
            );
        });
    });

    describe('parseUrl - SQL Runner charts', () => {
        const PROJECT_UUID = '21eef0b9-5bae-40f3-851e-9554588e71a6';
        const SQL_CHART_UUID = '11111111-2222-3333-4444-555555555555';

        it('recognizes a saved SQL Runner URL and rewrites to a minimal URL', async () => {
            const getBySlug = vi.fn().mockResolvedValue({
                savedSqlUuid: SQL_CHART_UUID,
                name: 'my chart',
                description: null,
            });
            const service = createService({
                savedSqlModel: { getBySlug } as Partial<SavedSqlModel>,
            });

            const result = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_UUID}/sql-runner/my-saved-chart`,
            );

            expect(result.isValid).toBe(true);
            expect(result.lightdashPage).toBe('sql_chart');
            expect(result.projectUuid).toBe(PROJECT_UUID);
            expect(result.savedSqlUuid).toBe(SQL_CHART_UUID);
            expect(result.minimalUrl).toBe(
                `http://headless-browser:8080/minimal/projects/${PROJECT_UUID}/sql-runner/${SQL_CHART_UUID}`,
            );
            expect(getBySlug).toHaveBeenCalledWith(
                PROJECT_UUID,
                'my-saved-chart',
            );
        });

        it('also recognizes `/sql-runner/<slug>/edit` and resolves to the same minimal URL', async () => {
            const getBySlug = vi.fn().mockResolvedValue({
                savedSqlUuid: SQL_CHART_UUID,
                name: 'my chart',
                description: null,
            });
            const service = createService({
                savedSqlModel: { getBySlug } as Partial<SavedSqlModel>,
            });

            const result = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_UUID}/sql-runner/my-saved-chart/edit`,
            );

            expect(result.isValid).toBe(true);
            expect(result.savedSqlUuid).toBe(SQL_CHART_UUID);
            expect(getBySlug).toHaveBeenCalledWith(
                PROJECT_UUID,
                'my-saved-chart',
            );
        });

        it('returns isValid: false when the slug does not resolve to a saved chart', async () => {
            const getBySlug = vi.fn().mockRejectedValue(new Error('not found'));
            const service = createService({
                savedSqlModel: { getBySlug } as Partial<SavedSqlModel>,
            });

            const result = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_UUID}/sql-runner/missing-chart`,
            );

            expect(result.isValid).toBe(false);
        });

        it('returns isValid: false for `/sql-runner` with no slug (unsaved chart)', async () => {
            const getBySlug = vi.fn();
            const service = createService({
                savedSqlModel: { getBySlug } as Partial<SavedSqlModel>,
            });

            const result = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_UUID}/sql-runner`,
            );

            expect(result.isValid).toBe(false);
            expect(getBySlug).not.toHaveBeenCalled();
        });
    });

    describe('captureAppDeliveryManifest', () => {
        const APP_URL =
            'http://headless-browser:8080/minimal/projects/p1/apps/a1?captureMode=delivery';
        const validManifest: DeliveryCaptureManifest = {
            version: 1,
            items: [
                {
                    status: 'ready',
                    captureKey: 'v1:abc',
                    label: 'Revenue by month',
                    exploreName: 'orders',
                    queryUuid: '11111111-1111-4111-8111-111111111111',
                    order: 0,
                    rowCount: 12,
                    limitReached: false,
                },
            ],
            overflowCount: 0,
        };

        const createMockPage = () => {
            const cdpSession = { send: vi.fn().mockResolvedValue(undefined) };
            const pageContext = {
                addCookies: vi.fn().mockResolvedValue(undefined),
                newCDPSession: vi.fn().mockResolvedValue(cdpSession),
                route: vi.fn().mockResolvedValue(undefined),
                routeWebSocket: vi.fn().mockResolvedValue(undefined),
            };
            return {
                cdpSession,
                pageContext,
                addInitScript: vi.fn().mockResolvedValue(undefined),
                context: vi.fn().mockReturnValue(pageContext),
                on: vi.fn(),
                goto: vi.fn().mockResolvedValue(undefined),
                waitForSelector: vi.fn().mockResolvedValue(undefined),
                evaluate: vi.fn().mockResolvedValue(undefined),
                screenshot: vi.fn().mockResolvedValue(Buffer.from('nope')),
                close: vi.fn().mockResolvedValue(undefined),
            };
        };

        type MockPage = ReturnType<typeof createMockPage>;

        const getRequestRouteHandler = (
            page: MockPage,
        ): ((route: Route) => Promise<void>) => {
            const registration = page.pageContext.route.mock.calls.find(
                ([pattern]) => pattern === '**',
            );
            expect(registration).toBeDefined();
            if (!registration) {
                throw new Error('Expected a catch-all browser route');
            }
            return registration[1] as (route: Route) => Promise<void>;
        };

        const createMockRoute = (
            url: string,
            headers: Record<string, string> = {},
        ) => ({
            request: vi.fn().mockReturnValue({
                url: vi.fn().mockReturnValue(url),
                headers: vi.fn().mockReturnValue(headers),
            }),
            abort: vi.fn().mockResolvedValue(undefined),
            continue: vi.fn().mockResolvedValue(undefined),
            fallback: vi.fn().mockResolvedValue(undefined),
        });

        const getWebSocketRouteHandler = (
            page: MockPage,
        ): ((route: WebSocketRoute) => Promise<void>) => {
            const registration =
                page.pageContext.routeWebSocket.mock.calls.find(
                    ([pattern]) => pattern === '**',
                );
            expect(registration).toBeDefined();
            if (!registration) {
                throw new Error('Expected a catch-all websocket route');
            }
            return registration[1] as (route: WebSocketRoute) => Promise<void>;
        };

        const setup = () => {
            const page = createMockPage();
            const browser = {
                newPage: vi.fn().mockResolvedValue(page),
                close: vi.fn().mockResolvedValue(undefined),
            };
            playwrightMocks.connectOverCDP.mockResolvedValue(browser);
            const service = createService({
                headlessBrowser: {
                    host: 'headless-browser',
                    browserEndpoint: 'ws://headless-browser:3000',
                },
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.spyOn(service as any, 'getUserCookie').mockResolvedValue(
                'connect.sid=session-value; Path=/; HttpOnly',
            );
            return { service, browser, page };
        };

        it('returns the validated manifest published on the window global', async () => {
            const { service, browser, page } = setup();
            page.evaluate.mockResolvedValue(validManifest);

            const result = await service.captureAppDeliveryManifest({
                url: APP_URL,
                authUserUuid: 'user-uuid-1',
                contextId: 'job-1',
            });

            expect(result).toEqual(validManifest);
            expect(page.goto).toHaveBeenCalledWith(
                APP_URL,
                expect.objectContaining({ timeout: expect.any(Number) }),
            );
            expect(page.waitForSelector).toHaveBeenCalledWith(
                SCREENSHOT_SELECTORS.READY_INDICATOR,
                { state: 'attached', timeout: 60_000 },
            );
            expect(page.evaluate).toHaveBeenCalledWith(
                expect.any(Function),
                DELIVERY_CAPTURE_GLOBAL,
            );
            expect(page.screenshot).not.toHaveBeenCalled();
            expect(page.close).toHaveBeenCalled();
            expect(browser.close).toHaveBeenCalled();
        });

        it('renders with the same window geometry as the app screenshot path', async () => {
            const { service, browser, page } = setup();
            page.evaluate.mockResolvedValue(validManifest);

            await service.captureAppDeliveryManifest({
                url: APP_URL,
                authUserUuid: 'user-uuid-1',
            });

            expect(playwrightMocks.connectOverCDP).toHaveBeenCalledWith(
                expect.stringContaining('--window-size%3D1400%2C4000'),
                expect.anything(),
            );
            expect(page.cdpSession.send).toHaveBeenCalledWith(
                'Emulation.setDeviceMetricsOverride',
                expect.objectContaining({ width: 1400, height: 4000 }),
            );
            expect(browser.newPage).toHaveBeenCalledWith(
                expect.objectContaining({ serviceWorkers: 'block' }),
            );
        });

        it('guards dashboard and chart screenshots and preserves internal request headers', async () => {
            const { service, browser, page } = setup();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.spyOn(service as any, 'unfurlDetails').mockResolvedValue(
                undefined,
            );
            page.addInitScript.mockRejectedValueOnce(
                new Error('stop after route registration'),
            );

            await expect(
                service.unfurlImage({
                    url: APP_URL,
                    imageId: 'image-1',
                    authUserUuid: 'user-uuid-1',
                    context: 'export_dashboard' as never,
                    selectedTabs: null,
                }),
            ).rejects.toThrow('stop after route registration');

            expect(browser.newPage).toHaveBeenCalledWith(
                expect.objectContaining({ serviceWorkers: 'block' }),
            );
            expect(page.pageContext.route).toHaveBeenCalledWith(
                '**',
                expect.any(Function),
            );
            expect(page.pageContext.routeWebSocket).toHaveBeenCalledWith(
                '**',
                expect.any(Function),
            );

            const handler = getRequestRouteHandler(page);
            const route = createMockRoute(
                'http://headless-browser:8080/api/v1/health',
                {
                    authorization: 'Bearer internal-token',
                    cookie: 'connect.sid=session-value',
                },
            );

            await handler(route as unknown as Route);

            expect(ssrfMocks.validatePublicHttpUrl).not.toHaveBeenCalled();
            expect(route.continue).toHaveBeenCalledWith({
                headers: {
                    authorization: 'Bearer internal-token',
                    cookie: 'connect.sid=session-value',
                    [LightdashRequestMethodHeader]:
                        RequestMethod.HEADLESS_BROWSER,
                    'Lightdash-Headless-Browser-Context': 'export_dashboard',
                    'Lightdash-Headless-Browser-Context-Id': 'undefined',
                },
            });
        });

        it('blocks outbound browser requests to non-public destinations', async () => {
            const { service, page } = setup();
            page.evaluate.mockResolvedValue(validManifest);
            ssrfMocks.validatePublicHttpUrl.mockRejectedValueOnce(
                new Error('non-public destination'),
            );

            await service.captureAppDeliveryManifest({
                url: APP_URL,
                authUserUuid: 'user-uuid-1',
            });

            const handler = getRequestRouteHandler(page);
            const route = createMockRoute('http://127.0.0.1/private');

            await handler(route as unknown as Route);

            expect(route.abort).toHaveBeenCalledWith('accessdenied');
            expect(route.continue).not.toHaveBeenCalled();
        });

        it('continues public browser requests without internal headers', async () => {
            const { service, page } = setup();
            page.evaluate.mockResolvedValue(validManifest);
            ssrfMocks.validatePublicHttpUrl.mockResolvedValueOnce(
                new URL('https://cdn.example.com/image.png'),
            );

            await service.captureAppDeliveryManifest({
                url: APP_URL,
                authUserUuid: 'user-uuid-1',
            });

            const handler = getRequestRouteHandler(page);
            const route = createMockRoute('https://cdn.example.com/image.png');

            await handler(route as unknown as Route);

            expect(ssrfMocks.validatePublicHttpUrl).toHaveBeenCalledWith(
                'https://cdn.example.com/image.png',
                { allowedProtocols: ['http:', 'https:'] },
            );
            expect(route.continue).toHaveBeenCalledWith();
            expect(route.abort).not.toHaveBeenCalled();
        });

        it('continues Lightdash requests with headless-browser headers', async () => {
            const { service, page } = setup();
            page.evaluate.mockResolvedValue(validManifest);

            await service.captureAppDeliveryManifest({
                url: APP_URL,
                authUserUuid: 'user-uuid-1',
                contextId: 'job-1',
            });

            const handler = getRequestRouteHandler(page);
            const route = createMockRoute(
                'http://headless-browser:8080/api/v1/health',
                { accept: '*/*' },
            );

            await handler(route as unknown as Route);

            expect(ssrfMocks.validatePublicHttpUrl).not.toHaveBeenCalled();
            expect(route.continue).toHaveBeenCalledWith({
                headers: expect.objectContaining({
                    accept: '*/*',
                    'Lightdash-Headless-Browser-Context': 'scheduled_delivery',
                    'Lightdash-Headless-Browser-Context-Id': 'job-1',
                }),
            });
        });

        it.each([
            'https://headless-browser:8080/api/v1/health',
            'http://headless-browser:8081/api/v1/health',
        ])('validates internal-origin near miss %s', async (url) => {
            const { service, page } = setup();
            page.evaluate.mockResolvedValue(validManifest);
            ssrfMocks.validatePublicHttpUrl.mockResolvedValueOnce(new URL(url));

            await service.captureAppDeliveryManifest({
                url: APP_URL,
                authUserUuid: 'user-uuid-1',
            });

            const handler = getRequestRouteHandler(page);
            const route = createMockRoute(url, {
                authorization: 'Bearer internal-token',
            });

            await handler(route as unknown as Route);

            expect(ssrfMocks.validatePublicHttpUrl).toHaveBeenCalledWith(url, {
                allowedProtocols: ['http:', 'https:'],
            });
            expect(route.continue).toHaveBeenCalledWith();
        });

        it('blocks websocket connections to non-public destinations', async () => {
            const { service, page } = setup();
            page.evaluate.mockResolvedValue(validManifest);
            ssrfMocks.validatePublicHttpUrl.mockRejectedValueOnce(
                new Error('non-public destination'),
            );

            await service.captureAppDeliveryManifest({
                url: APP_URL,
                authUserUuid: 'user-uuid-1',
            });

            const handler = getWebSocketRouteHandler(page);
            const webSocketRoute = {
                url: vi.fn().mockReturnValue('ws://127.0.0.1/private'),
                close: vi.fn().mockResolvedValue(undefined),
                connectToServer: vi.fn(),
            };

            await handler(webSocketRoute as unknown as WebSocketRoute);

            expect(webSocketRoute.close).toHaveBeenCalledWith({
                code: 1008,
                reason: 'Destination is not permitted',
            });
            expect(webSocketRoute.connectToServer).not.toHaveBeenCalled();
        });

        it('connects websocket requests to public destinations', async () => {
            const { service, page } = setup();
            page.evaluate.mockResolvedValue(validManifest);
            ssrfMocks.validatePublicHttpUrl.mockResolvedValueOnce(
                new URL('wss://stream.example.com/socket'),
            );

            await service.captureAppDeliveryManifest({
                url: APP_URL,
                authUserUuid: 'user-uuid-1',
            });

            const handler = getWebSocketRouteHandler(page);
            const webSocketRoute = {
                url: vi.fn().mockReturnValue('wss://stream.example.com/socket'),
                close: vi.fn().mockResolvedValue(undefined),
                connectToServer: vi.fn(),
            };

            await handler(webSocketRoute as unknown as WebSocketRoute);

            expect(ssrfMocks.validatePublicHttpUrl).toHaveBeenCalledWith(
                'wss://stream.example.com/socket',
                { allowedProtocols: ['ws:', 'wss:'] },
            );
            expect(webSocketRoute.connectToServer).toHaveBeenCalled();
            expect(webSocketRoute.close).not.toHaveBeenCalled();
        });

        it('connects internal websocket requests without public validation', async () => {
            const { service, page } = setup();
            page.evaluate.mockResolvedValue(validManifest);

            await service.captureAppDeliveryManifest({
                url: APP_URL,
                authUserUuid: 'user-uuid-1',
            });

            const handler = getWebSocketRouteHandler(page);
            const webSocketRoute = {
                url: vi
                    .fn()
                    .mockReturnValue('ws://headless-browser:8080/socket'),
                close: vi.fn().mockResolvedValue(undefined),
                connectToServer: vi.fn(),
            };

            await handler(webSocketRoute as unknown as WebSocketRoute);

            expect(ssrfMocks.validatePublicHttpUrl).not.toHaveBeenCalled();
            expect(webSocketRoute.connectToServer).toHaveBeenCalled();
            expect(webSocketRoute.close).not.toHaveBeenCalled();
        });

        it('throws when the window global is missing', async () => {
            const { service, browser, page } = setup();
            page.evaluate.mockResolvedValue(undefined);

            await expect(
                service.captureAppDeliveryManifest({
                    url: APP_URL,
                    authUserUuid: 'user-uuid-1',
                    contextId: 'job-1',
                }),
            ).rejects.toThrow(UnexpectedServerError);
            expect(page.close).toHaveBeenCalled();
            expect(browser.close).toHaveBeenCalled();
        });

        it('throws when the window global is malformed', async () => {
            const { service, page } = setup();
            page.evaluate.mockResolvedValue({
                version: 1,
                items: [{ status: 'ready', captureKey: 'v1:abc' }],
                overflowCount: 0,
            });

            await expect(
                service.captureAppDeliveryManifest({
                    url: APP_URL,
                    authUserUuid: 'user-uuid-1',
                    contextId: 'job-1',
                }),
            ).rejects.toThrow(/malformed/);
        });

        it('rethrows the ready-indicator timeout without falling back to a screenshot', async () => {
            const { service, browser, page } = setup();
            const timeoutError = new Error('Timeout 60000ms exceeded');
            timeoutError.name = 'TimeoutError';
            page.waitForSelector.mockRejectedValue(timeoutError);

            await expect(
                service.captureAppDeliveryManifest({
                    url: APP_URL,
                    authUserUuid: 'user-uuid-1',
                    contextId: 'job-1',
                }),
            ).rejects.toThrow('Timeout 60000ms exceeded');
            expect(page.evaluate).not.toHaveBeenCalled();
            expect(page.screenshot).not.toHaveBeenCalled();
            expect(page.close).toHaveBeenCalled();
            expect(browser.close).toHaveBeenCalled();
        });
    });

    describe('getTitleAndDescription - SQL_CHART', () => {
        const PROJECT_UUID = '21eef0b9-5bae-40f3-851e-9554588e71a6';
        const SQL_CHART_UUID = '11111111-2222-3333-4444-555555555555';

        it('returns chart name + description + organizationUuid from saved_sql', async () => {
            const getByUuid = vi.fn().mockResolvedValue({
                savedSqlUuid: SQL_CHART_UUID,
                name: 'Prompts created over time',
                description: 'A monthly trend of AI prompts',
                organization: {
                    organizationUuid: '00000000-0000-0000-0000-000000000aaa',
                },
            });
            const service = createService({
                savedSqlModel: { getByUuid } as Partial<SavedSqlModel>,
            });

            const result = await service.getTitleAndDescription(
                {
                    isValid: true,
                    lightdashPage: LightdashPage.SQL_CHART,
                    url: 'irrelevant',
                    minimalUrl: 'irrelevant',
                    projectUuid: PROJECT_UUID,
                    savedSqlUuid: SQL_CHART_UUID,
                },
                null,
            );

            expect(result.title).toBe('Prompts created over time');
            expect(result.description).toBe('A monthly trend of AI prompts');
            expect(result.organizationUuid).toBe(
                '00000000-0000-0000-0000-000000000aaa',
            );
            expect(result.resourceUuid).toBe(SQL_CHART_UUID);
            expect(getByUuid).toHaveBeenCalledWith(SQL_CHART_UUID);
        });
    });
});
