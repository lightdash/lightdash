import {
    ForbiddenError,
    NotFoundError,
    ParameterError,
    UnexpectedServerError,
    type Account,
} from '@lightdash/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LightdashConfig } from '../../config/parseConfig';
import { LearnService } from './LearnService';

const buildAccount = (): Account =>
    ({
        authentication: { type: 'session', source: 'session-cookie' },
        organization: {
            organizationUuid: 'org-uuid',
            name: 'Org',
            createdAt: new Date(),
        },
        user: {
            id: 'user-uuid',
            userUuid: 'user-uuid',
            userId: 1,
            email: 'learner+test@example.com',
            firstName: 'Test',
            lastName: 'User',
            role: 'admin',
            type: 'registered',
            isActive: true,
            isTrackingAnonymized: false,
            isMarketingOptedIn: false,
            isSetupComplete: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            timezone: null,
        },
        isAnonymousUser: () => false,
        isAuthenticated: () => true,
        isJwtUser: () => false,
        isOauthUser: () => false,
        isPatUser: () => false,
        isRegisteredUser: () => true,
        isServiceAccount: () => false,
        isSessionUser: () => true,
    }) as Account;

const catalogueEntry = {
    id: 'viewer-fundamentals',
    title: 'Viewer Fundamentals',
    description: 'Learn to view.',
    version: 1,
    contentHash: 'abc123def456',
    path: 'courses/viewer-fundamentals/abc123def456/course.json',
    lessonCount: 2,
    durationMinutes: 25,
    tags: ['viewer'],
    track: 'foundations',
    publishedAt: '2026-08-01T00:00:00.000Z',
};

const cataloguePayload = {
    generatedAt: '2026-08-01T00:00:00.000Z',
    courses: [catalogueEntry],
};

const coursePayload = {
    id: 'viewer-fundamentals',
    title: 'Viewer Fundamentals',
    passingScore: 80,
    lessons: [{ id: 'l1', title: 'Lesson One', html: '<p>hi</p>' }],
    quiz: {
        questions: [{ id: 'q1', prompt: 'Q?', choices: ['a', 'b'], answer: 1 }],
    },
    version: 1,
    contentHash: 'abc123def456',
    publishedAt: '2026-08-01T00:00:00.000Z',
};

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

const buildService = ({ flagEnabled = true, withToken = true } = {}) => {
    const serviceToken = withToken ? 'service-token-1' : undefined;
    const featureFlagService = {
        get: vi.fn().mockResolvedValue({ enabled: flagEnabled }),
    };
    const lightdashConfig = {
        learn: {
            contentBaseUrl: 'https://content.test',
            progressApiUrl: 'https://progress.test',
            serviceToken,
        },
    } as LightdashConfig;
    return {
        service: new LearnService({ lightdashConfig, featureFlagService }),
        featureFlagService,
    };
};

describe('LearnService', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe('feature flag gate', () => {
        it('throws ForbiddenError when the Learn flag is off', async () => {
            const { service } = buildService({ flagEnabled: false });
            await expect(service.getCatalogue(buildAccount())).rejects.toThrow(
                ForbiddenError,
            );
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    describe('getCatalogue', () => {
        it('returns the parsed catalogue from the content CDN', async () => {
            const { service } = buildService();
            fetchMock.mockResolvedValue(jsonResponse(cataloguePayload));
            const catalogue = await service.getCatalogue(buildAccount());
            expect(catalogue.courses).toHaveLength(1);
            expect(fetchMock).toHaveBeenCalledWith(
                'https://content.test/catalogue.json',
                expect.anything(),
            );
        });

        it('passes through unknown catalogue fields (forward compatibility)', async () => {
            const { service } = buildService();
            const withExtras = {
                ...cataloguePayload,
                courses: [
                    {
                        ...catalogueEntry,
                        requires: [{ id: 'ai-copilot' }],
                        docsUrl: 'https://docs.lightdash.com/x',
                    },
                ],
            };
            fetchMock.mockResolvedValue(jsonResponse(withExtras));
            const catalogue = await service.getCatalogue(buildAccount());
            expect(
                (catalogue.courses[0] as Record<string, unknown>).docsUrl,
            ).toBe('https://docs.lightdash.com/x');
        });

        it('maps upstream failures to UnexpectedServerError', async () => {
            const { service } = buildService();
            fetchMock.mockResolvedValue(jsonResponse({}, 502));
            await expect(service.getCatalogue(buildAccount())).rejects.toThrow(
                UnexpectedServerError,
            );
        });

        it('maps invalid payloads to UnexpectedServerError', async () => {
            const { service } = buildService();
            fetchMock.mockResolvedValue(jsonResponse({ nope: true }));
            await expect(service.getCatalogue(buildAccount())).rejects.toThrow(
                UnexpectedServerError,
            );
        });
    });

    describe('getCourse', () => {
        it('throws NotFoundError for a course missing from the catalogue', async () => {
            const { service } = buildService();
            fetchMock.mockResolvedValue(jsonResponse(cataloguePayload));
            await expect(
                service.getCourse(buildAccount(), 'not-a-course'),
            ).rejects.toThrow(NotFoundError);
        });

        it('fetches the course payload and derives assetBaseUrl', async () => {
            const { service } = buildService();
            fetchMock
                .mockResolvedValueOnce(jsonResponse(cataloguePayload))
                .mockResolvedValueOnce(jsonResponse(coursePayload));
            const course = await service.getCourse(
                buildAccount(),
                'viewer-fundamentals',
            );
            expect(course.assetBaseUrl).toBe(
                'https://content.test/courses/viewer-fundamentals/abc123def456',
            );
            expect(fetchMock).toHaveBeenNthCalledWith(
                2,
                `https://content.test/${catalogueEntry.path}`,
                expect.anything(),
            );
        });
    });

    describe('getProgress', () => {
        it('reports serverSynced: false without a service token and never calls upstream', async () => {
            const { service } = buildService({ withToken: false });
            const result = await service.getProgress(buildAccount());
            expect(result).toEqual({ courses: null, serverSynced: false });
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('proxies with the server-held token and the session email', async () => {
            const { service } = buildService();
            fetchMock.mockResolvedValue(
                jsonResponse({
                    email: 'learner+test@example.com',
                    courses: [],
                }),
            );
            const result = await service.getProgress(buildAccount());
            expect(result).toEqual({ courses: [], serverSynced: true });
            const [url, init] = fetchMock.mock.calls[0];
            expect(url).toBe(
                'https://progress.test/api/v1/progress?email=learner%2Btest%40example.com',
            );
            expect((init.headers as Record<string, string>).authorization).toBe(
                'Bearer service-token-1',
            );
        });
    });

    describe('recordEvents', () => {
        const validEvent = {
            verb: 'started',
            object: { type: 'course', course: 'viewer-fundamentals' },
            occurredAt: '2026-08-01T00:00:00.000Z',
        };

        it('rejects invalid payloads with ParameterError', async () => {
            const { service } = buildService();
            await expect(
                service.recordEvents(buildAccount(), [{ nope: true }]),
            ).rejects.toThrow(ParameterError);
            await expect(
                service.recordEvents(buildAccount(), []),
            ).rejects.toThrow(ParameterError);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('rejects batches over 100 events', async () => {
            const { service } = buildService();
            const events = Array.from({ length: 101 }, () => validEvent);
            await expect(
                service.recordEvents(buildAccount(), events),
            ).rejects.toThrow(ParameterError);
        });

        it('accepts and drops events when no service token is configured', async () => {
            const { service } = buildService({ withToken: false });
            const result = await service.recordEvents(buildAccount(), [
                validEvent,
            ]);
            expect(result).toEqual({ accepted: 0 });
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('stamps source: learn on every event before forwarding', async () => {
            const { service } = buildService();
            fetchMock.mockResolvedValue(jsonResponse({ accepted: 1 }));
            const result = await service.recordEvents(buildAccount(), [
                validEvent,
            ]);
            expect(result).toEqual({ accepted: 1 });
            const [, init] = fetchMock.mock.calls[0];
            const body = JSON.parse(init.body as string);
            expect(body[0].source).toBe('learn');
        });

        it('maps upstream write failures to UnexpectedServerError', async () => {
            const { service } = buildService();
            fetchMock.mockResolvedValue(jsonResponse({}, 500));
            await expect(
                service.recordEvents(buildAccount(), [validEvent]),
            ).rejects.toThrow(UnexpectedServerError);
        });
    });
});
