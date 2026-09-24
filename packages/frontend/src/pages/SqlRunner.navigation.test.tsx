import { screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { renderWithProviders } from '../testing/testUtils';
import SqlRunnerNewPage from './SqlRunner';

vi.mock('../components/common/Page/Page', () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../features/sqlRunner', () => ({
    SqlRunnerSidebar: () => null,
}));
vi.mock('../features/sqlRunner/components/ContentPanel', () => ({
    ContentPanel: () => null,
}));
vi.mock('../features/sqlRunner/components/Header', () => ({
    Header: () => null,
}));
vi.mock(
    '../features/sqlRunner/multiConnection/components/SqlRunnerConnectionScope',
    () => ({
        SqlRunnerConnectionScope: ({
            connectionHint,
            children,
        }: {
            connectionHint: string | null | undefined;
            children: React.ReactNode;
        }) => (
            <>
                <output data-testid="connection-hint">
                    {connectionHint ?? 'none'}
                </output>
                {children}
            </>
        ),
    }),
);
vi.mock('../features/sqlRunner/hooks/useSavedSqlCharts', () => ({
    useSavedSqlChart: () => ({ data: undefined, error: null }),
}));
vi.mock('../features/sqlRunner/hooks/useSqlRunnerShareUrl', () => ({
    useSqlRunnerShareUrl: () => ({ error: null, sqlRunnerState: null }),
}));
vi.mock('../hooks/useProject', () => ({
    useProject: () => ({ data: undefined }),
}));
vi.mock('../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
}));
vi.mock('../hooks/useSearchParams', () => ({
    default: () => null,
}));
vi.mock('../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastError: vi.fn() }),
}));

const LocationState = () => {
    const location = useLocation();
    return (
        <output data-testid="navigation-state">
            {JSON.stringify(location.state)}
        </output>
    );
};

it('keeps the explore connection after clearing navigation state', async () => {
    renderWithProviders(
        <MemoryRouter
            initialEntries={[
                {
                    pathname: '/projects/project-uuid/sql-runner',
                    state: {
                        sql: 'select 1',
                        warehouseConnectionUuid: 'finance-uuid',
                    },
                },
            ]}
        >
            <Routes>
                <Route
                    path="/projects/:projectUuid/sql-runner"
                    element={
                        <>
                            <SqlRunnerNewPage />
                            <LocationState />
                        </>
                    }
                />
            </Routes>
        </MemoryRouter>,
    );

    await waitFor(() =>
        expect(screen.getByTestId('navigation-state')).toHaveTextContent(
            'null',
        ),
    );
    expect(screen.getByTestId('connection-hint')).toHaveTextContent(
        'finance-uuid',
    );
});
