import {
    DELIVERY_CAPTURE_GLOBAL,
    DownloadFileType,
    LightdashPage,
    LightdashRequestMethodHeader,
    NotFoundError,
    RequestMethod,
    SCREENSHOT_FAILED_STATUS,
    SCREENSHOT_SELECTORS,
    UnexpectedServerError,
    type DeliveryCaptureManifest,
    type Document,
} from '@lightdash/common';
import type { Route, WebSocketRoute } from 'playwright';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import { type SlackClient } from '../../clients/Slack/SlackClient';
import { type LightdashConfig } from '../../config/parseConfig';
import { type AppModel } from '../../models/AppModel';
import { type DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { type DocumentModel } from '../../models/DocumentModel';
import { type DownloadFileModel } from '../../models/DownloadFileModel';
import { type HeadlessBrowserLoginGrantModel } from '../../models/HeadlessBrowserLoginGrantModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type SavedChartModel } from '../../models/SavedChartModel';
import { type SavedSqlModel } from '../../models/SavedSqlModel';
import { type ShareModel } from '../../models/ShareModel';
import { type SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';
import { type SlackUnfurlImageModel } from '../../models/SlackUnfurlImageModel';
import { type UserModel } from '../../models/UserModel';
import type { DocumentService } from '../DocumentService/DocumentService';
import { User as SessionUserMock } from '../ShareService/ShareService.mock';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import {
    expandViewportToDashboardGrid,
    MAX_PRE_READY_VIEWPORT_HEIGHT,
    ScreenshotContext,
    UnfurlService,
} from './UnfurlService';

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

const obscureMocks = vi.hoisted(() => ({
    obscureThumbnailImage: vi.fn(),
}));

vi.mock('./obscureThumbnail', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./obscureThumbnail')>()),
    obscureThumbnailImage: obscureMocks.obscureThumbnailImage,
}));

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
        dashboardModel: Partial<DashboardModel>;
        projectModel: Partial<ProjectModel>;
        slackAuthenticationModel: Partial<SlackAuthenticationModel>;
        documentModel: Partial<DocumentModel>;
        documentService: Partial<DocumentService>;
        userModel: Partial<UserModel>;
        headlessBrowser: Record<string, unknown>;
    }> = {},
) {
    return new UnfurlService({
        lightdashConfig: {
            siteUrl: 'https://app.lightdash.cloud',
            headlessBrowser: {
                internalLightdashHost: 'http://headless-browser:8080',
                screenshotTimeoutMs: 45_000,
                ...(overrides.headlessBrowser ?? {}),
            },
        } as unknown as LightdashConfig,
        dashboardModel: (overrides.dashboardModel ??
            {}) as unknown as DashboardModel,
        savedChartModel: (overrides.savedChartModel ??
            {}) as unknown as SavedChartModel,
        savedSqlModel: (overrides.savedSqlModel ??
            {}) as unknown as SavedSqlModel,
        appModel: {} as unknown as AppModel,
        shareModel: {} as unknown as ShareModel,
        fileStorageClient:
            mockFileStorageClient as unknown as FileStorageClient,
        slackClient: {} as unknown as SlackClient,
        projectModel: (overrides.projectModel ?? {}) as unknown as ProjectModel,
        downloadFileModel:
            mockDownloadFileModel as unknown as DownloadFileModel,
        slackUnfurlImageModel:
            mockSlackUnfurlImageModel as unknown as SlackUnfurlImageModel,
        analytics: { track: vi.fn() } as unknown as LightdashAnalytics,
        slackAuthenticationModel: (overrides.slackAuthenticationModel ??
            {}) as unknown as SlackAuthenticationModel,
        spacePermissionService: {} as unknown as SpacePermissionService,
        headlessBrowserLoginGrantModel:
            {} as unknown as HeadlessBrowserLoginGrantModel,
        documentModel: (overrides.documentModel ??
            {}) as unknown as DocumentModel,
        documentService: (overrides.documentService ??
            {}) as unknown as DocumentService,
        userModel: (overrides.userModel ?? {}) as unknown as UserModel,
    });
}

describe('UnfurlService', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    const createMockFrame = () => ({
        addStyleTag: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue('rgba(0, 0, 0, 0)'),
    });

    const createScreenshotMockPage = () => {
        const appFrames = [createMockFrame(), createMockFrame()];
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
            appFrames,
            frames: vi.fn().mockReturnValue(appFrames),
            addInitScript: vi.fn().mockResolvedValue(undefined),
            context: vi.fn().mockReturnValue(pageContext),
            on: vi.fn(),
            goto: vi.fn().mockResolvedValue(undefined),
            waitForSelector: vi.fn().mockResolvedValue(undefined),
            getAttribute: vi.fn().mockResolvedValue('ready'),
            evaluate: vi.fn().mockResolvedValue(undefined),
            locator: vi.fn().mockReturnValue({
                boundingBox: vi.fn().mockResolvedValue(null),
                first: vi.fn().mockReturnValue({
                    elementHandle: vi
                        .fn()
                        .mockRejectedValue(new Error('no element')),
                    boundingBox: vi.fn().mockResolvedValue({
                        x: 0,
                        y: 0,
                        width: 1280,
                        height: 720,
                    }),
                }),
            }),
            setViewportSize: vi.fn().mockResolvedValue(undefined),
            waitForTimeout: vi.fn().mockResolvedValue(undefined),
            screenshot: vi.fn().mockResolvedValue(Buffer.from('png-bytes')),
            close: vi.fn().mockResolvedValue(undefined),
        };
    };

    const setupScreenshot = () => {
        const page = createScreenshotMockPage();
        const browser = {
            newPage: vi.fn().mockResolvedValue(page),
            close: vi.fn().mockResolvedValue(undefined),
        };
        playwrightMocks.connectOverCDP.mockResolvedValue(browser);
        const service = createService({
            headlessBrowser: {
                host: 'headless-browser',
                browserEndpoint: 'ws://headless-browser:3000',
                screenshotTimeoutMs: 180_000,
                maxScreenshotRetries: 1,
            },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.spyOn(service as any, 'getUserCookie').mockResolvedValue(
            'connect.sid=session-value; Path=/; HttpOnly',
        );
        return { service, browser, page };
    };

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

    describe('exportAiAgentArtifact', () => {
        const ACTING_USER = {
            userUuid: 'user-uuid-1',
            organizationUuid: 'org-uuid-1',
        } as never;
        const ARTIFACT_REFS = {
            projectUuid: '11111111-1111-4111-8111-111111111111',
            agentUuid: '22222222-2222-4222-8222-222222222222',
            artifactUuid: '33333333-3333-4333-8333-333333333333',
            versionUuid: '44444444-4444-4444-8444-444444444444',
        };
        // Callers resolve this via AiAgentService.getArtifact (access-checked)
        // and pass the result in.
        const customChartArtifact = {
            artifactUuid: ARTIFACT_REFS.artifactUuid,
            versionUuid: ARTIFACT_REFS.versionUuid,
            title: 'Revenue treemap',
            chartConfig: {
                source: 'customChartType',
                schemaVersion: 1,
                dataAppVizUuid: 'viz-1',
                config: {},
            },
        };
        const EXPORT_ARGS = {
            projectUuid: ARTIFACT_REFS.projectUuid,
            agentUuid: ARTIFACT_REFS.agentUuid,
            artifact: customChartArtifact as never,
        };

        it('rejects artifacts that are not custom chart type answers', async () => {
            const { service } = setupScreenshot();

            await expect(
                service.exportAiAgentArtifact(ACTING_USER, {
                    ...EXPORT_ARGS,
                    artifact: {
                        ...customChartArtifact,
                        chartConfig: { source: 'semantic', config: {} },
                    } as never,
                }),
            ).rejects.toThrow(/custom chart type/);
            expect(playwrightMocks.connectOverCDP).not.toHaveBeenCalled();
        });

        it('renders the minimal artifact page with app-style launch args and a fixed 800x600@2x viewport', async () => {
            const { service, browser, page } = setupScreenshot();
            mockFileStorageClient.isEnabled.mockReturnValue(true);
            mockFileStorageClient.uploadImage.mockResolvedValue(
                'https://s3.example.com/raw-signed-url',
            );
            mockSlackUnfurlImageModel.create.mockResolvedValue(undefined);

            const { imageBuffer, imageUrl } =
                await service.exportAiAgentArtifact(ACTING_USER, EXPORT_ARGS);

            // App-style launch: window sizing + secure-context for the
            // sandboxed viz iframe SDK.
            const [endpoint] = playwrightMocks.connectOverCDP.mock.calls[0];
            expect(endpoint).toContain('--window-size%3D800%2C600');
            expect(endpoint).toContain(
                'unsafely-treat-insecure-origin-as-secure',
            );

            expect(browser.newPage).toHaveBeenCalledWith(
                expect.objectContaining({
                    viewport: { width: 800, height: 600 },
                    deviceScaleFactor: 2,
                    serviceWorkers: 'block',
                }),
            );
            expect(page.cdpSession.send).toHaveBeenCalledWith(
                'Emulation.setDeviceMetricsOverride',
                expect.objectContaining({
                    width: 800,
                    height: 600,
                    deviceScaleFactor: 2,
                }),
            );

            expect(page.goto).toHaveBeenCalledWith(
                `http://headless-browser:8080/minimal/projects/${ARTIFACT_REFS.projectUuid}/ai-agents/${ARTIFACT_REFS.agentUuid}/artifacts/${ARTIFACT_REFS.artifactUuid}/versions/${ARTIFACT_REFS.versionUuid}`,
                expect.objectContaining({ timeout: expect.any(Number) }),
            );
            expect(page.waitForSelector).toHaveBeenCalledWith(
                SCREENSHOT_SELECTORS.READY_INDICATOR,
                { state: 'attached', timeout: 180_000 },
            );

            // Fixed-frame capture: viewport-sized, never content-measured.
            expect(page.setViewportSize).not.toHaveBeenCalled();
            expect(page.screenshot).toHaveBeenCalledTimes(1);
            expect(page.screenshot.mock.calls[0][0]).not.toMatchObject({
                fullPage: true,
            });

            expect(mockSlackUnfurlImageModel.create).toHaveBeenCalledWith(
                expect.objectContaining({ organizationUuid: 'org-uuid-1' }),
            );
            expect(imageUrl).toMatch(
                /^https:\/\/app\.lightdash\.cloud\/api\/v1\/slack\/preview\//,
            );
            expect(imageBuffer).toEqual(Buffer.from('png-bytes'));
        });

        it('requests the exact cached execution for deferred custom charts', async () => {
            const { service, page } = setupScreenshot();
            mockFileStorageClient.isEnabled.mockReturnValue(true);
            const cachedQueryUuid = '55555555-5555-4555-8555-555555555555';
            await service.exportAiAgentArtifact(ACTING_USER, {
                ...EXPORT_ARGS,
                cachedQueryUuid,
            });
            const url = new URL(page.goto.mock.calls[0][0]);
            expect(url.searchParams.get('cachedQueryUuid')).toBe(
                cachedQueryUuid,
            );
            expect(page.getAttribute).toHaveBeenCalledWith(
                SCREENSHOT_SELECTORS.READY_INDICATOR,
                'data-status',
            );
            expect(page.screenshot).toHaveBeenCalledTimes(1);
        });

        it('does not publish an error frame as a deferred chart image', async () => {
            const { service, page } = setupScreenshot();
            page.getAttribute.mockResolvedValue('completed-with-errors');
            await expect(
                service.exportAiAgentArtifact(ACTING_USER, {
                    ...EXPORT_ARGS,
                    cachedQueryUuid: 'execution',
                }),
            ).rejects.toThrow();
            expect(page.screenshot).not.toHaveBeenCalled();
            expect(page.close).toHaveBeenCalled();
        });

        it('closes a cancelled background capture without an internal retry', async () => {
            const { service, browser, page } = setupScreenshot();
            const controller = new AbortController();
            page.waitForSelector.mockImplementationOnce(async () => {
                controller.abort();
                throw new Error(
                    'Target page, context or browser has been closed',
                );
            });
            await expect(
                service.exportAiAgentArtifact(ACTING_USER, {
                    ...EXPORT_ARGS,
                    cachedQueryUuid: 'execution',
                    signal: controller.signal,
                }),
            ).rejects.toThrow();
            expect(page.screenshot).not.toHaveBeenCalled();
            expect(page.close).toHaveBeenCalled();
            expect(browser.close).toHaveBeenCalled();
            expect(playwrightMocks.connectOverCDP).toHaveBeenCalledTimes(1);
        });

        it('fails closed when the ready indicator never mounts', async () => {
            const { service, page } = setupScreenshot();
            const { errors } = await import('playwright');
            page.waitForSelector.mockRejectedValue(
                new errors.TimeoutError('Timeout 180000ms exceeded'),
            );

            await expect(
                service.exportAiAgentArtifact(ACTING_USER, EXPORT_ARGS),
            ).rejects.toThrow(/Screenshot timeout/);
            expect(page.screenshot).not.toHaveBeenCalled();
            expect(page.close).toHaveBeenCalled();
        });
    });

    describe('exportDataApp', () => {
        const EXPORT_ARGS = {
            projectUuid: '11111111-1111-4111-8111-111111111111',
            appUuid: '22222222-2222-4222-8222-222222222222',
            appName: 'Revenue app',
            authUserUuid: '33333333-3333-4333-8333-333333333333',
            organizationUuid: '44444444-4444-4444-8444-444444444444',
            context: ScreenshotContext.SLACK,
        };
        const MINIMAL_APP_URL = `http://headless-browser:8080/minimal/projects/${EXPORT_ARGS.projectUuid}/apps/${EXPORT_ARGS.appUuid}`;

        const exportAndGetRenderedUrl = async (
            args: Parameters<UnfurlService['exportDataApp']>[0],
        ) => {
            const { service, page } = setupScreenshot();
            mockFileStorageClient.isEnabled.mockReturnValue(true);
            mockFileStorageClient.uploadImage.mockResolvedValue(
                'https://s3.example.com/raw-signed-url',
            );
            mockSlackUnfurlImageModel.create.mockResolvedValue(undefined);

            const result = await service.exportDataApp(args);
            expect(result.imageBuffer).toEqual(Buffer.from('png-bytes'));
            return page.goto.mock.calls[0][0];
        };

        it('renders the latest ready version when no version is given', async () => {
            expect(await exportAndGetRenderedUrl(EXPORT_ARGS)).toBe(
                MINIMAL_APP_URL,
            );
        });

        it('renders the requested version', async () => {
            expect(
                await exportAndGetRenderedUrl({ ...EXPORT_ARGS, version: 3 }),
            ).toBe(`${MINIMAL_APP_URL}?version=3`);
        });
    });

    describe('captureDataAppVersion', () => {
        const CAPTURE_ARGS = {
            projectUuid: '11111111-1111-4111-8111-111111111111',
            appUuid: '22222222-2222-4222-8222-222222222222',
            appName: 'Revenue app',
            authUserUuid: '33333333-3333-4333-8333-333333333333',
            organizationUuid: '44444444-4444-4444-8444-444444444444',
            version: 3,
        };
        const neverSignalsReady = async (selector: string) => {
            if (selector === SCREENSHOT_SELECTORS.READY_INDICATOR) {
                throw new Error('Ready indicator never appeared');
            }
        };

        beforeEach(() => {
            obscureMocks.obscureThumbnailImage.mockImplementation(
                async (png: Buffer) =>
                    Buffer.concat([Buffer.from('blurred:'), png]),
            );
        });

        it('returns a blurred image of the requested version', async () => {
            const { service, page } = setupScreenshot();

            const image = await service.captureDataAppVersion(CAPTURE_ARGS);

            expect(obscureMocks.obscureThumbnailImage).toHaveBeenCalledWith(
                Buffer.from('png-bytes'),
            );
            expect(image).toEqual(Buffer.from('blurred:png-bytes'));
            expect(page.goto.mock.calls[0][0]).toBe(
                `http://headless-browser:8080/minimal/projects/${CAPTURE_ARGS.projectUuid}/apps/${CAPTURE_ARGS.appUuid}?version=3`,
            );
        });

        it('fails when the version never signals that it rendered', async () => {
            const { service, page } = setupScreenshot();
            page.waitForSelector.mockImplementation(neverSignalsReady);

            await expect(
                service.captureDataAppVersion(CAPTURE_ARGS),
            ).rejects.toThrow();
        });

        it('obscures the text of every frame before the screenshot', async () => {
            const { service, page } = setupScreenshot();

            await service.captureDataAppVersion(CAPTURE_ARGS);

            const screenshotAt = page.screenshot.mock.invocationCallOrder[0];
            page.appFrames.forEach((frame) => {
                expect(frame.addStyleTag).toHaveBeenCalledWith({
                    content: expect.stringContaining(
                        '-webkit-text-fill-color: transparent',
                    ),
                });
                expect(
                    frame.addStyleTag.mock.invocationCallOrder[0],
                ).toBeLessThan(screenshotAt);
                expect(frame.evaluate.mock.invocationCallOrder[0]).toBeLessThan(
                    screenshotAt,
                );
            });
        });

        it('fails when a frame does not confirm its text is hidden', async () => {
            const { service, page } = setupScreenshot();
            page.appFrames[1].evaluate.mockResolvedValue('rgb(0, 0, 0)');

            await expect(
                service.captureDataAppVersion(CAPTURE_ARGS),
            ).rejects.toThrow();
            expect(obscureMocks.obscureThumbnailImage).not.toHaveBeenCalled();
        });

        it('fails when the stylesheet cannot be added to a frame', async () => {
            const { service, page } = setupScreenshot();
            page.appFrames[0].addStyleTag.mockRejectedValue(
                new Error('Frame was detached'),
            );

            await expect(
                service.captureDataAppVersion(CAPTURE_ARGS),
            ).rejects.toThrow();
            expect(obscureMocks.obscureThumbnailImage).not.toHaveBeenCalled();
        });

        it('leaves exportDataApp returning an image for an app that never signals', async () => {
            const { service, page } = setupScreenshot();
            page.waitForSelector.mockImplementation(neverSignalsReady);
            mockFileStorageClient.isEnabled.mockReturnValue(true);
            mockFileStorageClient.uploadImage.mockResolvedValue(
                'https://s3.example.com/raw-signed-url',
            );
            mockSlackUnfurlImageModel.create.mockResolvedValue(undefined);

            const { version, ...exportArgs } = CAPTURE_ARGS;
            const result = await service.exportDataApp({
                ...exportArgs,
                context: ScreenshotContext.SLACK,
            });

            expect(result.imageBuffer).toEqual(Buffer.from('png-bytes'));
        });

        it('leaves exportDataApp images unobscured', async () => {
            const { service, page } = setupScreenshot();
            mockFileStorageClient.isEnabled.mockReturnValue(true);
            mockFileStorageClient.uploadImage.mockResolvedValue(
                'https://s3.example.com/raw-signed-url',
            );
            mockSlackUnfurlImageModel.create.mockResolvedValue(undefined);

            const { version, ...exportArgs } = CAPTURE_ARGS;
            const result = await service.exportDataApp({
                ...exportArgs,
                context: ScreenshotContext.SLACK,
            });

            expect(result.imageBuffer).toEqual(Buffer.from('png-bytes'));
            page.appFrames.forEach((frame) => {
                expect(frame.addStyleTag).not.toHaveBeenCalled();
            });
            expect(obscureMocks.obscureThumbnailImage).not.toHaveBeenCalled();
        });
    });

    describe('exportDocumentPdf', () => {
        const EXPORT_ARGS = {
            projectUuid: 'project-uuid',
            documentUuid: 'document-uuid',
            versionUuid: 'version-uuid',
            documentName: 'Weekly review',
            authUserUuid: 'user-uuid',
            organizationUuid: 'org-uuid',
            context: ScreenshotContext.EXPORT_DOCUMENT,
        };

        const setup = (indicator: Record<string, string>) => {
            const locator = {
                first: vi.fn(),
                elementHandle: vi.fn().mockRejectedValue(new Error('none')),
                waitFor: vi.fn().mockResolvedValue(undefined),
                boundingBox: vi.fn().mockResolvedValue({
                    x: 0,
                    y: 0,
                    width: 800,
                    height: 800,
                }),
                evaluateAll: vi.fn().mockResolvedValue([]),
                getAttribute: vi.fn(
                    async (name: string) => indicator[name] ?? null,
                ),
            };
            locator.first.mockReturnValue(locator);
            const page = {
                addInitScript: vi.fn().mockResolvedValue(undefined),
                context: vi.fn().mockReturnValue({
                    addCookies: vi.fn().mockResolvedValue(undefined),
                    route: vi.fn().mockResolvedValue(undefined),
                    routeWebSocket: vi.fn().mockResolvedValue(undefined),
                }),
                on: vi.fn(),
                goto: vi.fn().mockResolvedValue(undefined),
                waitForSelector: vi.fn().mockResolvedValue(undefined),
                evaluate: vi.fn().mockResolvedValue(undefined),
                locator: vi.fn().mockReturnValue(locator),
                viewportSize: vi
                    .fn()
                    .mockReturnValue({ width: 800, height: 1024 }),
                setViewportSize: vi.fn().mockResolvedValue(undefined),
                screenshot: vi.fn().mockResolvedValue(Buffer.from('png')),
                pdf: vi.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
                close: vi.fn().mockResolvedValue(undefined),
            };
            const browser = {
                newPage: vi.fn().mockResolvedValue(page),
                close: vi.fn().mockResolvedValue(undefined),
            };
            playwrightMocks.connectOverCDP.mockResolvedValue(browser);
            mockFileStorageClient.isEnabled.mockReturnValue(true);
            mockFileStorageClient.uploadPdf.mockResolvedValue({
                fileName: 'weekly.pdf',
                url: 'https://s3.example.com/weekly.pdf',
            });
            const service = createService({
                headlessBrowser: {
                    host: 'headless-browser',
                    browserEndpoint: 'ws://headless-browser:3000',
                    maxScreenshotRetries: 1,
                },
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.spyOn(service as any, 'getUserCookie').mockResolvedValue(
                'connect.sid=session-value; Path=/; HttpOnly',
            );
            return { service, browser, page };
        };

        it('prints the exact version as the user to paginated A4 and counts failed charts', async () => {
            const { service, browser, page } = setup({
                'data-status': 'completed-with-errors',
                'data-tiles-errored': '2',
            });

            await expect(
                service.exportDocumentPdf(EXPORT_ARGS),
            ).resolves.toEqual({
                pdfFile: {
                    source: 'https://s3.example.com/weekly.pdf',
                    fileName: 'weekly.pdf',
                },
                numFailures: 2,
            });
            expect(page.goto).toHaveBeenCalledWith(
                'http://headless-browser:8080/minimal/projects/project-uuid/documents/document-uuid?versionUuid=version-uuid',
                expect.anything(),
            );
            expect(browser.newPage).toHaveBeenCalledWith(
                expect.objectContaining({
                    viewport: { width: 800, height: 1024 },
                }),
            );
            expect(page.pdf).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({ format: 'A4', scale: 0.85 }),
            );
            expect(mockFileStorageClient.uploadPdf).toHaveBeenCalledWith(
                Buffer.from('pdf-bytes'),
                expect.stringMatching(/^document-pdf_/),
            );
        });

        it('fails instead of printing a Document the page could not load', async () => {
            const { service, page } = setup({
                'data-status': SCREENSHOT_FAILED_STATUS,
            });

            await expect(
                service.exportDocumentPdf(EXPORT_ARGS),
            ).rejects.toThrow(/could not be loaded/);
            expect(page.pdf).not.toHaveBeenCalled();
            expect(mockFileStorageClient.uploadPdf).not.toHaveBeenCalled();
        });

        it('unfurls only the top of a long Document as the preview image', async () => {
            const { service, page } = setup({ 'data-status': 'ready' });
            page.locator().boundingBox.mockResolvedValue({
                x: 0,
                y: 40,
                width: 800,
                height: 5000,
            });
            mockFileStorageClient.uploadImage.mockResolvedValue(
                'https://s3.example.com/preview.png',
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.spyOn(service as any, 'unfurlDetails').mockResolvedValue(
                undefined,
            );

            await service.unfurlImage({
                url: 'http://headless-browser:8080/minimal/projects/project-uuid/documents/document-uuid?versionUuid=version-uuid',
                lightdashPage: LightdashPage.DOCUMENT,
                imageId: 'slack-image-document',
                authUserUuid: 'user-uuid',
                context: ScreenshotContext.SLACK,
                selectedTabs: null,
            });

            expect(page.screenshot).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    clip: { x: 0, y: 40, width: 800, height: 1024 },
                }),
            );
            expect(page.pdf).not.toHaveBeenCalled();
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

    describe('parseUrl - chart and dashboard slugs', () => {
        const PROJECT_UUID = '21eef0b9-5bae-40f3-851e-9554588e71a6';
        const CHART_UUID = '11111111-2222-4333-8444-555555555555';
        const DASHBOARD_UUID = '66666666-7777-4888-8999-000000000000';

        it.each(['current-chart', 'retired-chart-alias'])(
            'resolves chart identifier %s to its canonical UUID',
            async (identifier) => {
                const get = vi.fn().mockResolvedValue({ uuid: CHART_UUID });
                const service = createService({
                    savedChartModel: { get },
                });

                const result = await service.parseUrl(
                    `https://app.lightdash.cloud/projects/${PROJECT_UUID}/saved/${identifier}/view`,
                );

                expect(get).toHaveBeenCalledWith(identifier, undefined, {
                    projectUuid: PROJECT_UUID,
                });
                expect(result).toMatchObject({
                    isValid: true,
                    lightdashPage: LightdashPage.CHART,
                    projectUuid: PROJECT_UUID,
                    chartUuid: CHART_UUID,
                    minimalUrl: `http://headless-browser:8080/minimal/projects/${PROJECT_UUID}/saved/${CHART_UUID}`,
                });
            },
        );

        it('resolves a dashboard slug to its canonical UUID', async () => {
            const getByIdOrSlug = vi
                .fn()
                .mockResolvedValue({ uuid: DASHBOARD_UUID });
            const service = createService({
                dashboardModel: { getByIdOrSlug },
            });

            const result = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_UUID}/dashboards/current-dashboard/view?foo=bar`,
            );

            expect(getByIdOrSlug).toHaveBeenCalledWith('current-dashboard', {
                projectUuid: PROJECT_UUID,
            });
            expect(result).toMatchObject({
                isValid: true,
                lightdashPage: LightdashPage.DASHBOARD,
                projectUuid: PROJECT_UUID,
                dashboardUuid: DASHBOARD_UUID,
                minimalUrl: `http://headless-browser:8080/minimal/projects/${PROJECT_UUID}/dashboards/${DASHBOARD_UUID}?foo=bar`,
            });
        });

        it('keeps UUID URLs on the existing lookup-free path', async () => {
            const get = vi.fn();
            const getByIdOrSlug = vi.fn();
            const service = createService({
                savedChartModel: { get },
                dashboardModel: { getByIdOrSlug },
            });

            const chartResult = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_UUID}/saved/${CHART_UUID}/view`,
            );
            const dashboardResult = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_UUID}/dashboards/${DASHBOARD_UUID}/view`,
            );

            expect(get).not.toHaveBeenCalled();
            expect(getByIdOrSlug).not.toHaveBeenCalled();
            expect(chartResult.chartUuid).toBe(CHART_UUID);
            expect(dashboardResult.dashboardUuid).toBe(DASHBOARD_UUID);
        });

        it('returns an invalid result when a slug does not resolve', async () => {
            const get = vi.fn().mockRejectedValue(new Error('not found'));
            const service = createService({ savedChartModel: { get } });

            const result = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_UUID}/saved/missing-chart/view`,
            );

            expect(result.isValid).toBe(false);
        });
    });

    describe('parseUrl - documents', () => {
        const PROJECT_UUID = '21eef0b9-5bae-40f3-851e-9554588e71a6';
        const DOCUMENT_UUID = '33333333-4444-4555-8666-777777777777';
        const LATEST_VERSION_UUID = '88888888-9999-4aaa-8bbb-cccccccccccc';
        const document = {
            documentUuid: DOCUMENT_UUID,
            version: { versionUuid: LATEST_VERSION_UUID },
        };
        const expectedMinimalUrl = `http://headless-browser:8080/minimal/projects/${PROJECT_UUID}/documents/${DOCUMENT_UUID}?versionUuid=${LATEST_VERSION_UUID}`;

        it('resolves a Document slug and pins its latest version', async () => {
            const getBySlug = vi.fn().mockResolvedValue(document);
            const service = createService({ documentModel: { getBySlug } });

            const result = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_UUID}/documents/payments-review/history`,
            );

            expect(getBySlug).toHaveBeenCalledWith(
                PROJECT_UUID,
                'payments-review',
            );
            expect(result).toMatchObject({
                isValid: true,
                lightdashPage: LightdashPage.DOCUMENT,
                projectUuid: PROJECT_UUID,
                documentUuid: DOCUMENT_UUID,
                minimalUrl: expectedMinimalUrl,
            });
        });

        it('resolves a Document UUID without a slug lookup', async () => {
            const get = vi.fn().mockResolvedValue(document);
            const getBySlug = vi.fn();
            const service = createService({
                documentModel: { get, getBySlug },
            });

            const result = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_UUID}/documents/${DOCUMENT_UUID}`,
            );

            expect(get).toHaveBeenCalledWith(PROJECT_UUID, DOCUMENT_UUID);
            expect(getBySlug).not.toHaveBeenCalled();
            expect(result.minimalUrl).toBe(expectedMinimalUrl);
        });

        it('returns an invalid result when the Document does not resolve', async () => {
            const getBySlug = vi
                .fn()
                .mockRejectedValue(new NotFoundError('Document not found'));
            const service = createService({ documentModel: { getBySlug } });

            const result = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_UUID}/documents/deleted-doc`,
            );

            expect(result.isValid).toBe(false);
        });
    });

    describe('unfurlSlackUrls - documents', () => {
        const ORGANIZATION_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
        const PROJECT_UUID = '21eef0b9-5bae-40f3-851e-9554588e71a6';
        const DOCUMENT_UUID = '33333333-4444-4555-8666-777777777777';
        const DOCUMENT_URL = `https://app.lightdash.cloud/projects/${PROJECT_UUID}/documents/payments-review`;

        const setup = (getByIdOrSlug: DocumentService['getByIdOrSlug']) => {
            const document = {
                documentUuid: DOCUMENT_UUID,
                organizationUuid: ORGANIZATION_UUID,
                name: 'Payments review',
                description: '',
                version: { versionUuid: 'version-uuid' },
            };
            const installer = {
                ...SessionUserMock,
                userUuid: 'installer-uuid',
                organizationUuid: ORGANIZATION_UUID,
            };
            const findSessionUserAndOrgByUuid = vi
                .fn()
                .mockResolvedValue(installer);
            const service = createService({
                headlessBrowser: { host: undefined },
                documentModel: {
                    get: vi.fn().mockResolvedValue(document),
                    getBySlug: vi.fn().mockResolvedValue(document),
                },
                documentService: { getByIdOrSlug },
                userModel: { findSessionUserAndOrgByUuid },
                slackAuthenticationModel: {
                    getUnfurlsEnabled: vi.fn().mockResolvedValue(true),
                    getOrganizationUuidFromTeamId: vi
                        .fn()
                        .mockResolvedValue(ORGANIZATION_UUID),
                    getUserUuid: vi.fn().mockResolvedValue('installer-uuid'),
                },
            });
            const unfurl = vi.fn().mockResolvedValue({ ok: true });
            const message = {
                event: {
                    channel: 'C1',
                    message_ts: '1.0',
                    links: [{ url: DOCUMENT_URL, domain: 'lightdash.cloud' }],
                },
                client: { chat: { unfurl } },
                context: { teamId: 'T1', botUserId: 'B1' },
            };
            return { service, unfurl, message, findSessionUserAndOrgByUuid };
        };

        const unfurlAndSettle = async (
            service: UnfurlService,
            message: unknown,
        ) => {
            await service.unfurlSlackUrls(
                message as Parameters<UnfurlService['unfurlSlackUrls']>[0],
            );
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
        };

        it('unfurls a Document the Slack installer can view', async () => {
            const getByIdOrSlug = vi
                .fn<DocumentService['getByIdOrSlug']>()
                .mockResolvedValue({} as Document);
            const { service, unfurl, message, findSessionUserAndOrgByUuid } =
                setup(getByIdOrSlug);

            await unfurlAndSettle(service, message);

            expect(findSessionUserAndOrgByUuid).toHaveBeenCalledWith(
                'installer-uuid',
                ORGANIZATION_UUID,
            );
            expect(getByIdOrSlug).toHaveBeenCalledWith(
                expect.objectContaining({
                    user: expect.objectContaining({
                        userUuid: 'installer-uuid',
                    }),
                }),
                PROJECT_UUID,
                DOCUMENT_UUID,
            );
            expect(unfurl).toHaveBeenCalledWith(
                expect.objectContaining({
                    unfurls: {
                        [DOCUMENT_URL]: expect.objectContaining({
                            blocks: expect.arrayContaining([
                                expect.objectContaining({
                                    text: expect.objectContaining({
                                        text: 'Payments review',
                                    }),
                                }),
                            ]),
                        }),
                    },
                }),
            );
        });

        it('does not unfurl a Document the Slack installer cannot view', async () => {
            const getByIdOrSlug = vi
                .fn<DocumentService['getByIdOrSlug']>()
                .mockRejectedValue(new NotFoundError('Document not found'));
            const { service, unfurl, message } = setup(getByIdOrSlug);

            await unfurlAndSettle(service, message);

            expect(getByIdOrSlug).toHaveBeenCalled();
            expect(unfurl).not.toHaveBeenCalled();
        });
    });

    describe('parseUrl - project slugs', () => {
        const ORGANIZATION_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
        const PROJECT_UUID = '21eef0b9-5bae-40f3-851e-9554588e71a6';
        const PROJECT_SLUG = 'analytics-project';
        const CHART_UUID = '11111111-2222-4333-8444-555555555555';
        const DASHBOARD_UUID = '66666666-7777-4888-8999-000000000000';

        const projectModel = () => ({
            getUuidBySlug: vi.fn().mockResolvedValue(PROJECT_UUID),
        });

        it('resolves a chart beneath an organization-scoped project slug', async () => {
            const project = projectModel();
            const get = vi.fn().mockResolvedValue({ uuid: CHART_UUID });
            const service = createService({
                projectModel: project,
                savedChartModel: { get },
            });

            const result = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_SLUG}/saved/retired-chart-alias`,
                ORGANIZATION_UUID,
            );

            expect(project.getUuidBySlug).toHaveBeenCalledWith(
                ORGANIZATION_UUID,
                PROJECT_SLUG,
            );
            expect(get).toHaveBeenCalledWith('retired-chart-alias', undefined, {
                projectUuid: PROJECT_UUID,
            });
            expect(result).toMatchObject({
                isValid: true,
                projectUuid: PROJECT_UUID,
                chartUuid: CHART_UUID,
                minimalUrl: `http://headless-browser:8080/minimal/projects/${PROJECT_UUID}/saved/${CHART_UUID}`,
            });
        });

        it('keeps UUID project URLs on the existing lookup-free path', async () => {
            const project = projectModel();
            const service = createService({ projectModel: project });

            const result = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_UUID}/saved/${CHART_UUID}`,
                ORGANIZATION_UUID,
            );

            expect(project.getUuidBySlug).not.toHaveBeenCalled();
            expect(result).toMatchObject({
                isValid: true,
                projectUuid: PROJECT_UUID,
                chartUuid: CHART_UUID,
                minimalUrl: `http://headless-browser:8080/minimal/projects/${PROJECT_UUID}/saved/${CHART_UUID}`,
            });
        });

        it('resolves a dashboard beneath an organization-scoped project slug', async () => {
            const project = projectModel();
            const getByIdOrSlug = vi
                .fn()
                .mockResolvedValue({ uuid: DASHBOARD_UUID });
            const service = createService({
                projectModel: project,
                dashboardModel: { getByIdOrSlug },
            });

            const result = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_SLUG}/dashboards/sales-dashboard/view`,
                ORGANIZATION_UUID,
            );

            expect(getByIdOrSlug).toHaveBeenCalledWith('sales-dashboard', {
                projectUuid: PROJECT_UUID,
            });
            expect(result).toMatchObject({
                isValid: true,
                projectUuid: PROJECT_UUID,
                dashboardUuid: DASHBOARD_UUID,
                minimalUrl: `http://headless-browser:8080/minimal/projects/${PROJECT_UUID}/dashboards/${DASHBOARD_UUID}?`,
            });
        });

        it('canonicalizes project slugs for SQL charts and explores', async () => {
            const project = projectModel();
            const getBySlug = vi.fn().mockResolvedValue({
                savedSqlUuid: CHART_UUID,
            });
            const service = createService({
                projectModel: project,
                savedSqlModel: { getBySlug },
            });

            const sqlResult = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_SLUG}/sql-runner/saved-query`,
                ORGANIZATION_UUID,
            );
            const exploreResult = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_SLUG}/tables/orders?foo=bar`,
                ORGANIZATION_UUID,
            );

            expect(sqlResult).toMatchObject({
                isValid: true,
                projectUuid: PROJECT_UUID,
                savedSqlUuid: CHART_UUID,
                minimalUrl: `http://headless-browser:8080/minimal/projects/${PROJECT_UUID}/sql-runner/${CHART_UUID}`,
            });
            expect(exploreResult).toMatchObject({
                isValid: true,
                projectUuid: PROJECT_UUID,
                exploreModel: 'orders',
                minimalUrl: `http://headless-browser:8080/projects/${PROJECT_UUID}/tables/orders?foo=bar`,
            });
        });

        it('fails safely when a project slug has no organization context', async () => {
            const project = projectModel();
            const get = vi.fn();
            const service = createService({
                projectModel: project,
                savedChartModel: { get },
            });

            const result = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_SLUG}/saved/chart`,
            );

            expect(result.isValid).toBe(false);
            expect(project.getUuidBySlug).not.toHaveBeenCalled();
            expect(get).not.toHaveBeenCalled();
        });

        it('does not fall back to another organization', async () => {
            const getUuidBySlug = vi
                .fn()
                .mockRejectedValue(new NotFoundError('not found'));
            const get = vi.fn();
            const service = createService({
                projectModel: { getUuidBySlug },
                savedChartModel: { get },
            });

            const result = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_SLUG}/saved/chart`,
                ORGANIZATION_UUID,
            );

            expect(getUuidBySlug).toHaveBeenCalledWith(
                ORGANIZATION_UUID,
                PROJECT_SLUG,
            );
            expect(result.isValid).toBe(false);
            expect(get).not.toHaveBeenCalled();
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
                    screenshotTimeoutMs: 180_000,
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
                { state: 'attached', timeout: 180_000 },
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

        // The browserless session budget has to outlast the ready-wait, or the
        // container's own TIMEOUT kills the session mid-capture.
        it('asks browserless for a session budget covering the ready-wait', async () => {
            const { service, page } = setup();
            page.evaluate.mockResolvedValue(validManifest);

            await service.captureAppDeliveryManifest({
                url: APP_URL,
                authUserUuid: 'user-uuid-1',
            });

            const [endpoint] =
                playwrightMocks.connectOverCDP.mock.calls[
                    playwrightMocks.connectOverCDP.mock.calls.length - 1
                ];
            expect(new URL(endpoint).searchParams.get('timeout')).toBe(
                '210000',
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

describe('expandViewportToDashboardGrid', () => {
    const createPage = (
        box: { x: number; y: number; width: number; height: number } | null,
        viewportHeight = 768,
    ) => {
        const grid = {
            waitFor: vi.fn().mockResolvedValue(undefined),
            boundingBox: vi.fn().mockResolvedValue(box),
        };
        const page = {
            locator: vi.fn().mockReturnValue({
                first: vi.fn().mockReturnValue(grid),
            }),
            setViewportSize: vi.fn().mockResolvedValue(undefined),
            viewportSize: vi
                .fn()
                .mockReturnValue({ width: 1400, height: viewportHeight }),
        };
        return { page, grid };
    };

    it('grows the viewport to the bottom of the dashboard grid', async () => {
        const { page, grid } = createPage({
            x: 0,
            y: 40.5,
            width: 1400,
            height: 1000,
        });

        const height = await expandViewportToDashboardGrid(
            page as never,
            1400,
            5_000,
        );

        expect(page.locator).toHaveBeenCalledWith(
            SCREENSHOT_SELECTORS.DASHBOARD_GRID,
        );
        expect(grid.waitFor).toHaveBeenCalledWith({
            state: 'attached',
            timeout: 5_000,
        });
        expect(height).toBe(1041);
        expect(page.setViewportSize).toHaveBeenCalledWith({
            width: 1400,
            height: 1041,
        });
    });

    it('caps the viewport height for very tall dashboards', async () => {
        const { page } = createPage({
            x: 0,
            y: 40,
            width: 1400,
            height: 111_500,
        });

        const height = await expandViewportToDashboardGrid(
            page as never,
            1400,
            5_000,
        );

        expect(height).toBe(MAX_PRE_READY_VIEWPORT_HEIGHT);
        expect(page.setViewportSize).toHaveBeenCalledWith({
            width: 1400,
            height: MAX_PRE_READY_VIEWPORT_HEIGHT,
        });
    });

    it('leaves the viewport alone when the grid already fits', async () => {
        const { page } = createPage({ x: 0, y: 40, width: 1400, height: 500 });

        const height = await expandViewportToDashboardGrid(
            page as never,
            1400,
            5_000,
        );

        expect(height).toBeUndefined();
        expect(page.setViewportSize).not.toHaveBeenCalled();
    });

    it('does nothing when the grid has no layout box', async () => {
        const { page } = createPage(null);

        const height = await expandViewportToDashboardGrid(
            page as never,
            1400,
            5_000,
        );

        expect(height).toBeUndefined();
        expect(page.setViewportSize).not.toHaveBeenCalled();
    });
});
