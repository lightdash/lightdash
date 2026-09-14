import {
    ExternalSourceStatus,
    ExternalSourceScope,
    ExternalSourceType,
    getExternalSourceDisplayName,
    type ExternalSource,
} from '@lightdash/common';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCsvSourceAttachment } from './useCsvSourceAttachment';

const mocks = vi.hoisted(() => ({
    upload: vi.fn(),
    useUploadCsv: vi.fn(),
    commit: vi.fn(),
    getSource: vi.fn(),
    deleteSource: vi.fn(),
    showToastApiError: vi.fn(),
    showToastError: vi.fn(),
}));

vi.mock(
    '../../../../features/externalSources/hooks/useExternalSources',
    () => ({
        useUploadCsv: mocks.useUploadCsv,
        useCommitCsvUpload: () => ({
            mutateAsync: mocks.commit,
            isLoading: false,
        }),
        getExternalSourceApi: mocks.getSource,
        deleteExternalSourceApi: mocks.deleteSource,
    }),
);

vi.mock('../../../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastApiError: mocks.showToastApiError,
        showToastError: mocks.showToastError,
    }),
}));

const source: ExternalSource = {
    sourceUuid: 'source-1',
    projectUuid: 'project-1',
    type: ExternalSourceType.CSV,
    scope: ExternalSourceScope.ATTACHMENT,
    name: 'finance_export',
    connection: {
        type: ExternalSourceType.CSV,
        originalFilename: 'finance export.csv',
    },
    status: ExternalSourceStatus.SYNCING,
    errorMessage: null,
    createdByUserUuid: 'user-1',
    lastRefreshedAt: null,
    tables: [
        {
            tableUuid: 'table-1',
            sourceUuid: 'source-1',
            name: 'finance_export',
            label: 'Finance export',
            columns: null,
            rowCount: null,
            totalBytes: null,
            version: 0,
            lastIngestedAt: null,
        },
    ],
};

describe('useCsvSourceAttachment', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.useUploadCsv.mockReturnValue({
            mutateAsync: mocks.upload,
            isLoading: false,
        });
        mocks.upload.mockResolvedValue({ sourceUuid: source.sourceUuid });
        mocks.commit.mockResolvedValue({
            ...source,
            status: ExternalSourceStatus.READY,
        });
        mocks.deleteSource.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('keeps the original CSV filename and extension as its chat label', () => {
        expect(
            getExternalSourceDisplayName({
                ...source,
                name: 'attachment_2b5624c2_249c_474b_9681_820460a9bf08',
                connection: {
                    type: ExternalSourceType.CSV,
                    originalFilename: 'Customer Requests.csv',
                },
            }),
        ).toBe('Customer Requests.csv');
    });

    it('keeps the file pending until its committed source is ready', async () => {
        const onReady = vi.fn();
        let resolveCommit: (value: ExternalSource) => void = () => undefined;
        mocks.commit.mockReturnValue(
            new Promise<ExternalSource>((resolve) => {
                resolveCommit = resolve;
            }),
        );
        const { result } = renderHook(() =>
            useCsvSourceAttachment({
                projectUuid: 'project-1',
                onReady,
            }),
        );
        const file = new File(['amount\n42'], 'finance export.csv', {
            type: 'text/csv',
        });

        let request: Promise<void>;
        act(() => {
            request = result.current.attachFile(file);
        });

        await waitFor(() => expect(mocks.commit).toHaveBeenCalledOnce());

        expect(mocks.upload).toHaveBeenCalledWith(file);
        expect(mocks.useUploadCsv).toHaveBeenCalledWith(
            'project-1',
            ExternalSourceScope.ATTACHMENT,
        );
        expect(mocks.commit).toHaveBeenCalledWith({
            sourceUuid: source.sourceUuid,
            payload: {},
        });
        expect(result.current.pendingFiles).toEqual([
            {
                id: 0,
                filename: 'finance export.csv',
                status: 'preparing',
            },
        ]);
        expect(onReady).not.toHaveBeenCalled();

        const readySource = {
            ...source,
            status: ExternalSourceStatus.READY,
        };
        await act(async () => {
            resolveCommit(readySource);
            await request!;
        });

        expect(onReady).toHaveBeenCalledWith(readySource);
        expect(result.current.pendingFiles).toEqual([]);
    });

    it('keeps polling a queued source beyond one minute', async () => {
        vi.useFakeTimers();
        const onReady = vi.fn();
        mocks.commit.mockResolvedValue(source);
        let polls = 0;
        mocks.getSource.mockImplementation(() => {
            polls += 1;
            return Promise.resolve({
                ...source,
                status:
                    polls === 60
                        ? ExternalSourceStatus.READY
                        : ExternalSourceStatus.SYNCING,
            });
        });
        const { result } = renderHook(() =>
            useCsvSourceAttachment({
                projectUuid: 'project-1',
                onReady,
            }),
        );

        let request: Promise<void>;
        await act(async () => {
            request = result.current.attachFile(
                new File(['amount\n42'], 'finance.csv', { type: 'text/csv' }),
            );
            await Promise.resolve();
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(60_000);
            await request!;
        });

        expect(mocks.getSource).toHaveBeenCalledTimes(60);
        expect(onReady).toHaveBeenCalledWith(
            expect.objectContaining({ status: ExternalSourceStatus.READY }),
        );
        expect(mocks.deleteSource).not.toHaveBeenCalled();
    });

    it('accepts a ready response fetched at the polling deadline', async () => {
        vi.useFakeTimers();
        const startedAt = new Date('2026-08-21T12:00:00.000Z');
        vi.setSystemTime(startedAt);
        const onReady = vi.fn();
        mocks.commit.mockResolvedValue(source);
        mocks.getSource.mockResolvedValue({
            ...source,
            status: ExternalSourceStatus.READY,
        });
        const { result } = renderHook(() =>
            useCsvSourceAttachment({
                projectUuid: 'project-1',
                onReady,
            }),
        );

        let request: Promise<void>;
        await act(async () => {
            request = result.current.attachFile(
                new File(['amount\n42'], 'finance.csv', { type: 'text/csv' }),
            );
            await Promise.resolve();
        });
        vi.setSystemTime(new Date(startedAt.getTime() + 70 * 60 * 1000 - 500));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
            await request!;
        });

        expect(onReady).toHaveBeenCalledWith(
            expect.objectContaining({ status: ExternalSourceStatus.READY }),
        );
        expect(mocks.deleteSource).not.toHaveBeenCalled();
    });

    it('stops polling and disposes the staged source after unmount', async () => {
        vi.useFakeTimers();
        mocks.commit.mockResolvedValue(source);
        mocks.getSource.mockResolvedValue(source);
        const { result, unmount } = renderHook(() =>
            useCsvSourceAttachment({
                projectUuid: 'project-1',
                onReady: vi.fn(),
            }),
        );

        let request: Promise<void>;
        await act(async () => {
            request = result.current.attachFile(
                new File(['amount\n42'], 'finance.csv', { type: 'text/csv' }),
            );
            await Promise.resolve();
            await vi.advanceTimersByTimeAsync(1000);
        });
        expect(mocks.getSource).toHaveBeenCalledOnce();

        unmount();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(70 * 60 * 1000);
            await request!;
        });

        expect(mocks.getSource).toHaveBeenCalledOnce();
        expect(mocks.deleteSource).toHaveBeenCalledWith({
            projectUuid: 'project-1',
            sourceUuid: source.sourceUuid,
        });
    });

    it('attaches multiple selected CSVs as independent sources', async () => {
        const onReady = vi.fn();
        const { result } = renderHook(() =>
            useCsvSourceAttachment({
                projectUuid: 'project-1',
                onReady,
            }),
        );
        const files = [
            new File(['amount\n42'], 'finance.csv', { type: 'text/csv' }),
            new File(['region\nUS'], 'regions.csv', { type: 'text/csv' }),
        ];
        mocks.upload.mockImplementation((file: File) =>
            Promise.resolve({ sourceUuid: `source-${file.name}` }),
        );
        mocks.commit.mockImplementation(
            ({ sourceUuid }: { sourceUuid: string }) =>
                Promise.resolve({
                    ...source,
                    sourceUuid,
                    name: sourceUuid,
                    status: ExternalSourceStatus.READY,
                }),
        );

        await act(() => result.current.attachFiles(files));

        expect(mocks.upload).toHaveBeenCalledTimes(2);
        expect(mocks.commit).toHaveBeenCalledTimes(2);
        expect(onReady).toHaveBeenCalledTimes(2);
        expect(onReady.mock.calls.map(([ready]) => ready.sourceUuid)).toEqual(
            expect.arrayContaining([
                'source-finance.csv',
                'source-regions.csv',
            ]),
        );
        expect(result.current.pendingFiles).toEqual([]);
    });

    it('queues files beyond the two concurrent ingest slots', async () => {
        const onReady = vi.fn();
        const stageResolvers: Array<() => void> = [];
        let activeUploads = 0;
        let maxActiveUploads = 0;
        mocks.upload.mockImplementation(
            (file: File) =>
                new Promise((resolve) => {
                    activeUploads += 1;
                    maxActiveUploads = Math.max(
                        maxActiveUploads,
                        activeUploads,
                    );
                    stageResolvers.push(() => {
                        activeUploads -= 1;
                        resolve({ sourceUuid: `source-${file.name}` });
                    });
                }),
        );
        mocks.commit.mockImplementation(
            ({ sourceUuid }: { sourceUuid: string }) =>
                Promise.resolve({
                    ...source,
                    sourceUuid,
                    name: sourceUuid,
                    status: ExternalSourceStatus.READY,
                }),
        );
        const { result } = renderHook(() =>
            useCsvSourceAttachment({
                projectUuid: 'project-1',
                onReady,
            }),
        );
        const files = ['one.csv', 'two.csv', 'three.csv'].map(
            (name) => new File(['value\n1'], name, { type: 'text/csv' }),
        );

        let request: Promise<void>;
        act(() => {
            request = result.current.attachFiles(files);
        });

        await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
        expect(result.current.pendingFiles).toEqual([
            { id: 0, filename: 'one.csv', status: 'preparing' },
            { id: 1, filename: 'two.csv', status: 'preparing' },
            { id: 2, filename: 'three.csv', status: 'queued' },
        ]);

        await act(async () => {
            stageResolvers[0]();
        });
        await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(3));
        expect(maxActiveUploads).toBe(2);
        expect(result.current.pendingFiles).toContainEqual({
            id: 2,
            filename: 'three.csv',
            status: 'preparing',
        });

        await act(async () => {
            stageResolvers.slice(1).forEach((resolve) => resolve());
            await request!;
        });
        expect(onReady).toHaveBeenCalledTimes(3);
        expect(result.current.pendingFiles).toEqual([]);
    });

    it('deletes a prepared attachment when the user removes it', async () => {
        const { result } = renderHook(() =>
            useCsvSourceAttachment({
                projectUuid: 'project-1',
                onReady: vi.fn(),
            }),
        );

        await act(() =>
            result.current.attachFile(
                new File(['amount\n42'], 'finance.csv', { type: 'text/csv' }),
            ),
        );
        await act(() => result.current.discardSource(source.sourceUuid));

        expect(mocks.deleteSource).toHaveBeenCalledWith({
            projectUuid: 'project-1',
            sourceUuid: source.sourceUuid,
        });
    });

    it('retains attachments that were submitted with the prompt', async () => {
        const { result, unmount } = renderHook(() =>
            useCsvSourceAttachment({
                projectUuid: 'project-1',
                onReady: vi.fn(),
            }),
        );

        await act(() =>
            result.current.attachFile(
                new File(['amount\n42'], 'finance.csv', { type: 'text/csv' }),
            ),
        );
        act(() => result.current.retainSources([source.sourceUuid]));
        unmount();

        expect(mocks.deleteSource).not.toHaveBeenCalled();
    });

    it('deletes prepared attachments when the draft is abandoned', async () => {
        const { result, unmount } = renderHook(() =>
            useCsvSourceAttachment({
                projectUuid: 'project-1',
                onReady: vi.fn(),
            }),
        );

        await act(() =>
            result.current.attachFile(
                new File(['amount\n42'], 'finance.csv', { type: 'text/csv' }),
            ),
        );
        unmount();

        await waitFor(() =>
            expect(mocks.deleteSource).toHaveBeenCalledWith({
                projectUuid: 'project-1',
                sourceUuid: source.sourceUuid,
            }),
        );
    });

    it('deletes the staged source when preparation fails', async () => {
        mocks.commit.mockRejectedValue(new Error('commit failed'));
        const { result } = renderHook(() =>
            useCsvSourceAttachment({
                projectUuid: 'project-1',
                onReady: vi.fn(),
            }),
        );

        await act(() =>
            result.current.attachFile(
                new File(['amount\n42'], 'finance.csv', { type: 'text/csv' }),
            ),
        );

        expect(mocks.deleteSource).toHaveBeenCalledWith({
            projectUuid: 'project-1',
            sourceUuid: source.sourceUuid,
        });
    });
});
