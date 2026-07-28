import { type ApiAppVersionSummary } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { useGetApp } from '../hooks/useGetApp';
import DataAppVizConversation from './DataAppVizConversation';

vi.mock('../hooks/useGetApp', () => ({ useGetApp: vi.fn() }));

const mockedUseGetApp = vi.mocked(useGetApp);

const version = (
    overrides: Partial<ApiAppVersionSummary> = {},
): ApiAppVersionSummary => ({
    version: 1,
    prompt: 'stacked bars per shipping method',
    status: 'ready',
    statusMessage: null,
    statusHistory: [],
    error: null,
    createdAt: new Date('2026-05-15T10:00:00Z'),
    statusUpdatedAt: new Date('2026-05-15T10:00:52Z'),
    createdByUser: { userUuid: 'u1', firstName: 'Katie', lastName: 'Jones' },
    resources: null,
    ...overrides,
});

const setVersions = (
    versions: ApiAppVersionSummary[],
    extra: { hasNextPage?: boolean; isLoading?: boolean } = {},
) => {
    mockedUseGetApp.mockReturnValue({
        data: {
            pages: [{ versions, hasMore: false }],
            pageParams: [undefined],
        },
        isLoading: extra.isLoading ?? false,
        hasNextPage: extra.hasNextPage ?? false,
        fetchNextPage: vi.fn(),
        isFetchingNextPage: false,
    } as unknown as ReturnType<typeof useGetApp>);
};

const render = () =>
    renderWithProviders(
        <DataAppVizConversation
            projectUuid="project-1"
            dataAppVizUuid="viz-1"
            composer={null}
        />,
    );

describe('DataAppVizConversation', () => {
    beforeEach(() => vi.clearAllMocks());

    it('shows the request and a receipt for a finished build', () => {
        setVersions([version()]);
        render();

        expect(
            screen.getByText('stacked bars per shipping method'),
        ).toBeInTheDocument();
        expect(screen.getByText('Built in 52s')).toBeInTheDocument();
    });

    it('names the declared slots on the receipt', () => {
        setVersions([
            version({
                resources: {
                    vizSchema: {
                        fields: [
                            {
                                name: 'x',
                                label: 'X Axis',
                                type: 'dimension',
                                required: true,
                            },
                            {
                                name: 'v',
                                label: 'Value',
                                type: 'metric',
                                required: true,
                            },
                        ],
                    },
                } as unknown as ApiAppVersionSummary['resources'],
            }),
        ]);
        render();

        expect(
            screen.getByText('Built in 52s · X Axis, Value'),
        ).toBeInTheDocument();
    });

    it('surfaces a failed build as its cause, not a success', () => {
        setVersions([
            version({ status: 'error', statusMessage: 'Build failed' }),
        ]);
        render();

        expect(screen.getByText('Build failed')).toBeInTheDocument();
        expect(screen.queryByText(/Built in/)).not.toBeInTheDocument();
    });

    it('shows no receipt while a build is still running', () => {
        setVersions([version({ status: 'building', statusUpdatedAt: null })]);
        render();

        expect(
            screen.getByText('stacked bars per shipping method'),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Built in/)).not.toBeInTheDocument();
    });

    it('credits the author when the first version is loaded', () => {
        setVersions([version()]);
        render();

        expect(screen.getByText(/Built by Katie Jones/)).toBeInTheDocument();
    });

    it('does not claim origin when earlier versions are still unloaded', () => {
        setVersions([version({ version: 7 })], { hasNextPage: true });
        render();

        expect(
            screen.getByText(/Last updated by Katie Jones/),
        ).toBeInTheDocument();
        expect(screen.getByText('Load earlier messages')).toBeInTheDocument();
    });

    it('offers no "load earlier" once version 1 is held', () => {
        // The server may still report another page; holding v1 means we have
        // the whole contiguous history regardless.
        setVersions([version()], { hasNextPage: true });
        render();

        expect(
            screen.queryByText('Load earlier messages'),
        ).not.toBeInTheDocument();
    });

    it('labels a prompt-less uploaded version instead of showing a blank', () => {
        setVersions([version({ prompt: '' })]);
        render();

        expect(screen.getByText('Uploaded from source')).toBeInTheDocument();
    });

    it('shows a sent request immediately, before any build lands', () => {
        // The gap that made the composer feel broken: you sent something and
        // the panel showed nothing back.
        setVersions([]);
        renderWithProviders(
            <DataAppVizConversation
                projectUuid="project-1"
                dataAppVizUuid={null}
                composer={{
                    itemsMap: {} as never,
                    placeholder: 'Describe a new visualization…',
                    isBuilding: true,
                    pendingPrompt: 'a donut of orders by status',
                    error: null,
                    onSubmit: vi.fn(),
                }}
            />,
        );

        expect(
            screen.getByText('a donut of orders by status'),
        ).toBeInTheDocument();
        expect(screen.getByText('Building')).toBeInTheDocument();
    });

    it('drops the optimistic request once history carries it', () => {
        setVersions([version({ prompt: 'a donut of orders by status' })]);
        renderWithProviders(
            <DataAppVizConversation
                projectUuid="project-1"
                dataAppVizUuid="viz-1"
                composer={{
                    itemsMap: {} as never,
                    placeholder: 'Ask for a change…',
                    isBuilding: false,
                    pendingPrompt: 'a donut of orders by status',
                    error: null,
                    onSubmit: vi.fn(),
                }}
            />,
        );

        // One bubble, not two: the server version supersedes the local one.
        expect(screen.getAllByText('a donut of orders by status')).toHaveLength(
            1,
        );
    });

    it('renders the composer only when one is supplied', () => {
        setVersions([version()]);
        render();
        expect(
            screen.queryByRole('button', { name: 'Send' }),
        ).not.toBeInTheDocument();
    });

    it('shows an empty state when the viz has no history', () => {
        setVersions([]);
        render();

        expect(
            screen.getByText('This visualization has no history yet.'),
        ).toBeInTheDocument();
    });
});
