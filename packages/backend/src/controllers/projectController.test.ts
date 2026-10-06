import { ForbiddenError, MergeJoinType } from '@lightdash/common';
import { fetchMiddlewares } from '@tsoa/runtime';
import express from 'express';
import { PassThrough } from 'stream';
import { gunzipSync, gzipSync } from 'zlib';
import { buildAccount } from '../services/ProjectService/ProjectService.mock';
import { type ServiceRepository } from '../services/ServiceRepository';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import {
    ProjectController,
    SnowflakeAiBoundaryGuideController,
} from './projectController';

describe('ProjectController AI access restrictions', () => {
    test('gets and updates the setting through ProjectService', async () => {
        const getAiAccessRestrictions = vi.fn(async () => ({
            enabled: true,
        }));
        const updateAiAccessRestrictions = vi.fn(async () => undefined);
        const controller = new ProjectController({
            getProjectService: () => ({
                getAiAccessRestrictions,
                updateAiAccessRestrictions,
            }),
        } as unknown as ServiceRepository);
        const account = buildAccount();
        const request = { account } as express.Request;

        await expect(
            controller.getAiAccessRestrictions('project-uuid', request),
        ).resolves.toEqual({
            status: 'ok',
            results: { enabled: true },
        });
        await expect(
            controller.updateAiAccessRestrictions(
                'project-uuid',
                { enabled: false },
                request,
            ),
        ).resolves.toEqual({ status: 'ok', results: undefined });
        expect(getAiAccessRestrictions).toHaveBeenCalledWith(
            account,
            'project-uuid',
        );
        expect(updateAiAccessRestrictions).toHaveBeenCalledWith(
            account,
            'project-uuid',
            { enabled: false },
        );
    });
});

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

describe('Snowflake AI boundary guide routes', () => {
    test('routes guide reads, updates and checks through ProjectService', async () => {
        const config = { state: { marks: {}, lastTest: null } };
        const checks = [{ id: 'agent_active', status: 'pass' }];
        const getSnowflakeAiBoundaryGuideConfig = vi.fn(async () => config);
        const updateSnowflakeAiBoundaryGuideState = vi.fn(async () => config);
        const testSnowflakeAiBoundary = vi.fn(async () => checks);
        const services = {
            getProjectService: () => ({
                getSnowflakeAiBoundaryGuideConfig,
                updateSnowflakeAiBoundaryGuideState,
                testSnowflakeAiBoundary,
            }),
        } as unknown as ServiceRepository;
        const legacy = new ProjectController(services);
        const guide = new SnowflakeAiBoundaryGuideController(services);
        const account = buildAccount();
        const request = { account } as express.Request;
        const update = { section: 'masking' as const, markedDone: true };
        const body = { protectedColumn: null };

        expect(
            await legacy.getSnowflakeAiBoundaryGuide('project-uuid', request),
        ).toEqual({ status: 'ok', results: config });
        expect(await guide.getGuide('project-uuid', request)).toEqual({
            status: 'ok',
            results: config,
        });
        expect(
            await guide.updateGuide('project-uuid', request, update),
        ).toEqual({ status: 'ok', results: config });
        expect(
            await legacy.testSnowflakeAiBoundary('project-uuid', body, request),
        ).toEqual({ status: 'ok', results: checks });
        expect(await guide.testBoundary('project-uuid', request, body)).toEqual(
            { status: 'ok', results: checks },
        );
        expect(getSnowflakeAiBoundaryGuideConfig).toHaveBeenCalledWith(
            account,
            'project-uuid',
        );
        expect(updateSnowflakeAiBoundaryGuideState).toHaveBeenCalledWith(
            account,
            'project-uuid',
            update,
        );
        expect(testSnowflakeAiBoundary).toHaveBeenCalledWith(
            account,
            'project-uuid',
            body,
        );
    });
});
