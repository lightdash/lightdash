import { ContentSortByColumns, ContentType } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import InfiniteResourceTable from './InfiniteResourceTable';
import { ColumnVisibility } from './types';

const mocks = vi.hoisted(() => ({
    refetch: vi.fn(),
    useInfiniteContent: vi.fn(),
    isError: true,
    spaces: [],
    table: {
        resetRowSelection: vi.fn(),
        getFilteredSelectedRowModel: () => ({ flatRows: [] }),
    },
}));

vi.mock('../../../hooks/useContent', () => ({
    useInfiniteContent: (...args: unknown[]) => {
        mocks.useInfiniteContent(...args);
        return {
            data: undefined,
            isInitialLoading: false,
            isFetching: false,
            isError: mocks.isError,
            error: { error: { message: 'Request failed' } },
            refetch: mocks.refetch,
        };
    },
    useContentBulkAction: () => ({}),
}));
vi.mock('../../../hooks/useSpaces', () => ({
    useSpaceSummaries: () => ({ data: mocks.spaces }),
}));
vi.mock('../../../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => undefined,
}));
vi.mock('../../../hooks/useInfiniteScroll', () => ({
    useInfiniteScroll: () => ({}),
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));
vi.mock('../../../hooks/validation/useValidation', () => ({
    useValidationUserAbility: () => false,
}));
vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({ user: {} }),
}));
vi.mock('../ContentTable', () => ({
    useContentTable: () => mocks.table,
    ContentTable: () => <div>Resource results</div>,
}));
vi.mock('./ResourceActionHandlers', () => ({ default: () => null }));

const renderTable = (errorStateTitle?: string) =>
    render(
        <MantineProvider env="test">
            <MemoryRouter>
                <InfiniteResourceTable
                    filters={{
                        projectUuid: 'project',
                        contentTypes: [ContentType.DOCUMENT],
                    }}
                    errorStateTitle={errorStateTitle}
                />
            </MemoryRouter>
        </MantineProvider>,
    );

describe('Resource list error state', () => {
    beforeEach(() => {
        mocks.isError = true;
        mocks.refetch.mockClear();
    });

    test('shows the opted-in failure instead of empty results and retries the query', () => {
        renderTable('Unable to load documents');
        expect(
            screen.getByText('Unable to load documents'),
        ).toBeInTheDocument();
        expect(screen.getByText('Request failed')).toBeInTheDocument();
        expect(screen.queryByText('Resource results')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(mocks.refetch).toHaveBeenCalledOnce();
    });

    test('keeps existing callers unchanged when no error title is provided', () => {
        renderTable();
        expect(screen.getByText('Resource results')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Retry' }),
        ).not.toBeInTheDocument();
    });

    test('renders results after a successful retry', () => {
        mocks.isError = false;
        renderTable('Unable to load documents');
        expect(screen.getByText('Resource results')).toBeInTheDocument();
        expect(
            screen.queryByText('Unable to load documents'),
        ).not.toBeInTheDocument();
    });
});

describe('Resource list initial sorting', () => {
    beforeEach(() => {
        mocks.isError = false;
        mocks.useInfiniteContent.mockClear();
    });

    test('defaults to last updated, newest first', () => {
        renderTable();
        expect(mocks.useInfiniteContent).toHaveBeenLastCalledWith(
            expect.objectContaining({
                sortBy: ContentSortByColumns.LAST_UPDATED_AT,
                sortDirection: 'desc',
            }),
            expect.anything(),
        );
    });

    test('queries with the provided initial sorting', () => {
        render(
            <MantineProvider env="test">
                <MemoryRouter>
                    <InfiniteResourceTable
                        filters={{
                            projectUuid: 'project',
                            contentTypes: [ContentType.SPACE],
                        }}
                        initialSorting={[
                            { id: ColumnVisibility.NAME, desc: false },
                        ]}
                    />
                </MemoryRouter>
            </MantineProvider>,
        );
        expect(mocks.useInfiniteContent).toHaveBeenLastCalledWith(
            expect.objectContaining({
                sortBy: ContentSortByColumns.NAME,
                sortDirection: 'asc',
            }),
            expect.anything(),
        );
    });
});
