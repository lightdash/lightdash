import express from 'express';
import { validateHeaderValue } from 'node:http';
import { PassThrough, Readable } from 'stream';
import { type ServiceRepository } from '../services/ServiceRepository';
import { FileController } from './fileController';

const FILE_ID = 'test-nanoid-123456789';

const setup = ({
    s3Key,
    contentDisposition,
}: {
    s3Key: string;
    contentDisposition: string | null;
}) => {
    const services = {
        getPersistentDownloadFileService: () => ({
            getFileStream: vi.fn(async () => ({
                stream: Readable.from(['hello,world\n']),
                fileType: 'csv',
                s3Key,
                contentDisposition,
            })),
        }),
    } as unknown as ServiceRepository;

    const headers: Record<string, string> = {};
    const res = new PassThrough();
    // @ts-expect-error minimal express.Response stub — only setHeader is used
    res.setHeader = (name: string, value: string) => {
        // Mirror Node's own validation, so any header we couldn't actually
        // send fails the test rather than passing silently.
        validateHeaderValue(name, value);
        headers[name] = value;
    };
    const req = {
        res,
        ip: '127.0.0.1',
        headers: {},
    } as unknown as express.Request;

    return { controller: new FileController(services), req, headers };
};

describe('FileController', () => {
    describe('getFile', () => {
        it('uses the content disposition stored on the object', async () => {
            const { controller, req, headers } = setup({
                s3Key: 'csv-my-chart-1755512345678.csv',
                contentDisposition: 'attachment; filename="My Chart.csv"',
            });

            await controller.getFile(FILE_ID, req);

            expect(headers['Content-Disposition']).toBe(
                'attachment; filename="My Chart.csv"',
            );
            expect(headers['Content-Type']).toBe('text/csv; charset=utf-8');
        });

        it('falls back to the storage key when the object has no content disposition', async () => {
            const { controller, req, headers } = setup({
                s3Key: 'csv-my-chart-1755512345678.csv',
                contentDisposition: null,
            });

            await controller.getFile(FILE_ID, req);

            expect(headers['Content-Disposition']).toContain(
                'csv-my-chart-1755512345678.csv',
            );
        });

        it('falls back when the stored content disposition contains CR/LF', async () => {
            const { controller, req, headers } = setup({
                s3Key: 'csv-my-chart-1755512345678.csv',
                contentDisposition:
                    'attachment; filename="evil.csv"\r\nX-Injected: yes',
            });

            await controller.getFile(FILE_ID, req);

            expect(headers['Content-Disposition']).not.toContain('X-Injected');
            expect(headers['Content-Disposition']).toContain(
                'csv-my-chart-1755512345678.csv',
            );
        });

        it('falls back when the stored content disposition holds raw non-latin-1', async () => {
            const { controller, req, headers } = setup({
                s3Key: 'csv-my-chart-1755512345678.csv',
                contentDisposition: 'attachment; filename="売上.csv"',
            });

            await controller.getFile(FILE_ID, req);

            expect(headers['Content-Disposition']).toContain(
                'csv-my-chart-1755512345678.csv',
            );
        });

        it('RFC 5987 encodes a non-ASCII storage key on the fallback path', async () => {
            const { controller, req, headers } = setup({
                s3Key: 'csv-売上-1755512345678.csv',
                contentDisposition: null,
            });

            await controller.getFile(FILE_ID, req);

            expect(headers['Content-Disposition']).toBe(
                'attachment; filename="csv--1755512345678.csv"; filename*=UTF-8\'\'csv-%E5%A3%B2%E4%B8%8A-1755512345678.csv',
            );
        });

        it('passes a non-ASCII stored content disposition through untouched', async () => {
            const stored =
                'attachment; filename="download.csv"; filename*=UTF-8\'\'%E5%A3%B2%E4%B8%8A.csv';
            const { controller, req, headers } = setup({
                s3Key: 'csv-1755512345678.csv',
                contentDisposition: stored,
            });

            await controller.getFile(FILE_ID, req);

            expect(headers['Content-Disposition']).toBe(stored);
        });
    });
});
