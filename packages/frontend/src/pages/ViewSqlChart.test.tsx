import { ChartKind } from '@lightdash/common';
import { Button, MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { type PropsWithChildren, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useSavedSqlChartResults } from '../features/sqlRunner/hooks/useSavedSqlChartResults';
import ViewSqlChartPage from './ViewSqlChart';

vi.mock('react-router', () => ({ useParams: () => ({ slug: 'sql-chart' }) }));
vi.mock('react-redux', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    Provider: ({ children }: PropsWithChildren) => children,
}));
vi.mock('../features/sqlRunner/store', () => ({ store: {} }));
vi.mock('../features/sqlRunner/store/hooks', () => ({
    useAppDispatch: () => vi.fn(),
    useAppSelector: () => ({}),
}));
vi.mock('../features/sqlRunner/hooks/useSavedSqlChartResults', () => ({
    useSavedSqlChartResults: vi.fn(),
}));
vi.mock('../hooks/useProjectUuid', () => ({ useProjectUuid: () => 'project' }));
vi.mock('../features/parameters', () => ({
    Parameters: () => null,
    useParameters: () => ({ data: [] }),
}));
vi.mock('../components/common/Page/Page', () => ({
    default: ({
        children,
        header,
    }: PropsWithChildren<{ header: ReactNode }>) => (
        <>
            {header}
            {children}
        </>
    ),
}));
vi.mock('../components/common/ErrorState', () => ({
    default: () => 'Access removed',
}));
vi.mock('../features/sqlRunner/components/Header', () => ({
    Header: () => <Button>Share</Button>,
}));
vi.mock(
    '../features/sqlRunner/components/Download/ResultsDownloadButton',
    () => ({ default: () => <Button>Download</Button> }),
);
vi.mock('../components/DataViz/visualizations/Table', () => ({
    Table: () => 'Cached results',
}));

describe('SQL viewer access loss', () => {
    it.each([403, 404])(
        'removes header actions and cached downloads when a refetch returns %s',
        (statusCode) => {
            const cachedQuery = {
                chartQuery: {
                    data: {
                        sql: 'select 1',
                        config: { type: ChartKind.TABLE },
                        name: 'Chart',
                    },
                    isLoading: false,
                    error: null,
                },
                chartResultsQuery: {
                    data: { chartUnderlyingData: { columns: [], rows: [] } },
                    isLoading: false,
                },
                getDownloadQueryUuid: vi.fn(),
            };
            vi.mocked(useSavedSqlChartResults).mockReturnValue(
                cachedQuery as unknown as ReturnType<
                    typeof useSavedSqlChartResults
                >,
            );
            const page = (
                <MantineProvider>
                    <ViewSqlChartPage />
                </MantineProvider>
            );
            const { rerender } = render(page);
            expect(
                screen.getByRole('button', { name: 'Share' }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Download' }),
            ).toBeInTheDocument();

            vi.mocked(useSavedSqlChartResults).mockReturnValue({
                ...cachedQuery,
                chartQuery: {
                    ...cachedQuery.chartQuery,
                    error: { error: { statusCode, message: 'Access removed' } },
                },
            } as unknown as ReturnType<typeof useSavedSqlChartResults>);
            rerender(
                <MantineProvider>
                    <ViewSqlChartPage />
                </MantineProvider>,
            );
            expect(screen.getByText('Access removed')).toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Share' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Download' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText('Cached results'),
            ).not.toBeInTheDocument();
        },
    );
});
