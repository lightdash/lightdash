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
