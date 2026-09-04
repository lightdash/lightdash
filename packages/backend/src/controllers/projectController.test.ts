import { ForbiddenError, MergeJoinType } from '@lightdash/common';
import { fetchMiddlewares } from '@tsoa/runtime';
import express from 'express';
import { PassThrough } from 'stream';
import { gunzipSync, gzipSync } from 'zlib';
import { buildAccount } from '../services/ProjectService/ProjectService.mock';
import { type ServiceRepository } from '../services/ServiceRepository';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { ProjectController } from './projectController';

describe('ProjectController merged manifest', () => {
    test('requires session or API key authentication', () => {
        expect(
            fetchMiddlewares(ProjectController.prototype.getMergedManifest),
        ).toEqual([[allowApiKeyAuthentication, isAuthenticated]]);
    });

    test('streams gzip bytes with JSON content headers and no caching', async () => {
        const manifest = { nodes: {}, metrics: {} };
        const storedManifest = gzipSync(JSON.stringify(manifest));
        const getMergedManifest = vi.fn(async () => storedManifest);
        const controller = new ProjectController({
            getProjectService: () => ({ getMergedManifest }),
        } as unknown as ServiceRepository);
        const response = new PassThrough() as PassThrough & {
            status: ReturnType<typeof vi.fn>;
            setHeader: ReturnType<typeof vi.fn>;
        };
        response.status = vi.fn(() => response);
        response.setHeader = vi.fn();
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        const account = buildAccount();
        const request = {
            account,
            res: response,
        } as unknown as express.Request;

        await controller.getMergedManifest('project-uuid', request);

        expect(getMergedManifest).toHaveBeenCalledWith(account, 'project-uuid');
        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.setHeader).toHaveBeenCalledWith(
            'Content-Encoding',
            'gzip',
        );
        expect(response.setHeader).toHaveBeenCalledWith(
            'Content-Type',
            'application/json',
        );
        expect(response.setHeader).toHaveBeenCalledWith(
            'Cache-Control',
            'no-store',
        );
        const responseBody = Buffer.concat(chunks);
        expect(responseBody).toEqual(storedManifest);
        expect(JSON.parse(gunzipSync(responseBody).toString('utf8'))).toEqual(
            manifest,
        );
    });
});

describe('ProjectController merge routes', () => {
    const mergeQuery = {
        sources: [],
        joinKey: [],
        joinType: MergeJoinType.FULL,
        tableCalculations: [],
        limit: 500,
    };

    const buildController = () => {
        const compileMergeQuery = vi.fn();
        const executeLegacyAsyncMergeQuery = vi.fn();
        const controller = new ProjectController({
            getAsyncQueryService: () => ({
                compileMergeQuery,
                executeLegacyAsyncMergeQuery,
            }),
        } as unknown as ServiceRepository);
        controller.setStatus = vi.fn();
        return { controller, compileMergeQuery, executeLegacyAsyncMergeQuery };
    };

    const requestFor = (account: ReturnType<typeof buildAccount>) =>
        ({
            account,
            headers: {},
            header: vi.fn(),
        }) as unknown as express.Request;

    test('both routes refuse an unregistered account before reaching the service', async () => {
        const { controller, compileMergeQuery, executeLegacyAsyncMergeQuery } =
            buildController();
        const embedRequest = requestFor(
            buildAccount({ accountType: 'jwt', userType: 'anonymous' }),
        );

        await expect(
            controller.CompileMergeQuery(
                'project-uuid',
                { mergeQuery },
                embedRequest,
            ),
        ).rejects.toThrow(ForbiddenError);
        await expect(
            controller.RunMergeQuery(
                'project-uuid',
                { mergeQuery },
                embedRequest,
            ),
        ).rejects.toThrow(ForbiddenError);

        expect(compileMergeQuery).not.toHaveBeenCalled();
        expect(executeLegacyAsyncMergeQuery).not.toHaveBeenCalled();
    });

    test('both routes forward a registered account to the service', async () => {
        const { controller, compileMergeQuery, executeLegacyAsyncMergeQuery } =
            buildController();
        compileMergeQuery.mockResolvedValue({ sql: null, errors: [] });
        executeLegacyAsyncMergeQuery.mockResolvedValue({
            outcome: 'started',
            query: { queryUuid: 'query-uuid' },
        });
        const account = buildAccount();
        const request = requestFor(account);

        await controller.CompileMergeQuery(
            'project-uuid',
            { mergeQuery },
            request,
        );
        await controller.RunMergeQuery('project-uuid', { mergeQuery }, request);

        expect(compileMergeQuery).toHaveBeenCalledWith(
            expect.objectContaining({ account, projectUuid: 'project-uuid' }),
        );
        expect(executeLegacyAsyncMergeQuery).toHaveBeenCalledWith(
            expect.objectContaining({ account, projectUuid: 'project-uuid' }),
        );
    });
});
