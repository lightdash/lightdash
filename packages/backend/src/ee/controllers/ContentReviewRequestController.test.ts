import { ContentReviewContentType } from '@lightdash/common';
import { fetchMiddlewares } from '@tsoa/runtime';
import { type Request, type RequestHandler, type Response } from 'express';
import { buildAccount } from '../../auth/account/account.mock';
import { type ServiceRepository } from '../../services/ServiceRepository';
import { ContentReviewRequestController } from './ContentReviewRequestController';

const setup = () => {
    const legacyMatches = [
        { contentUuid: 'existing', matchReason: 'same_name' },
    ];
    const service = {
        findSimilarContent: vi.fn().mockResolvedValue(legacyMatches),
        findSimilarContentWithAi: vi.fn().mockResolvedValue([]),
    };
    const controller = new ContentReviewRequestController({
        getContentReviewRequestService: () => service,
    } as unknown as ServiceRepository);
    const req = { account: buildAccount() } as Request;
    return { controller, service, req, legacyMatches };
};

it.each(Object.values(ContentReviewContentType))(
    'preserves GET %s name-only results',
    async (type) => {
        const { controller, service, req, legacyMatches } = setup();
        expect(
            await controller.findSimilar(req, 'project', type, 'Revenue'),
        ).toEqual({
            status: 'ok',
            results: legacyMatches,
        });
        expect(service.findSimilarContent).toHaveBeenCalledWith(
            expect.anything(),
            'project',
            {
                contentType: type,
                name: 'Revenue',
                excludeContentUuid: null,
            },
        );
        expect(service.findSimilarContentWithAi).not.toHaveBeenCalled();
    },
);

it('preserves the GET exclusion without treating it as an AI source', async () => {
    const { controller, service, req } = setup();
    await controller.findSimilar(
        req,
        'project',
        ContentReviewContentType.CHART,
        'Revenue',
        'exclude',
    );
    expect(service.findSimilarContent).toHaveBeenCalledWith(
        expect.anything(),
        'project',
        {
            contentType: ContentReviewContentType.CHART,
            name: 'Revenue',
            excludeContentUuid: 'exclude',
        },
    );
    expect(service.findSimilarContentWithAi).not.toHaveBeenCalled();
});

it('keeps POST on the AI-only path', async () => {
    const { controller, service, req } = setup();
    const body = {
        contentType: ContentReviewContentType.CHART,
        name: 'Revenue',
        excludeContentUuid: 'source',
    };
    expect(await controller.compareSimilar(req, 'project', body)).toEqual({
        status: 'ok',
        results: [],
    });
    expect(service.findSimilarContentWithAi).toHaveBeenCalledWith(
        expect.anything(),
        'project',
        body,
    );
    expect(service.findSimilarContent).not.toHaveBeenCalled();
});

it('announces the GET deprecation, sunset and replacement', () => {
    const middleware = fetchMiddlewares<RequestHandler | RequestHandler[]>(
        ContentReviewRequestController.prototype.findSimilar,
    )
        .flat()
        .at(-1)!;
    const headers: Record<string, string> = {};
    const response = {
        setHeader: (name: string, value: string) => {
            headers[name] = value;
        },
    } as Response;
    const next = vi.fn();
    middleware({ method: 'GET', path: '/similar' } as Request, response, next);
    expect(headers.Deprecation).toBe('Mon, 14 Sep 2026 00:00:00 GMT');
    expect(headers.Sunset).toBe('Mon, 14 Dec 2026 00:00:00 GMT');
    expect(headers.Warning).toContain(
        'POST /api/v1/projects/{projectUuid}/review-requests/similar',
    );
    expect(next).toHaveBeenCalledOnce();
});
