import { type Project, ProvisioningSource } from '@lightdash/common';
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
const projectQuery = vi.hoisted(() => ({
    data: undefined as
        | Pick<Project, 'projectUuid' | 'provisioningSource'>
        | undefined,
    isInitialLoading: false,
}));
vi.mock('../hooks/useProject', () => ({
    useProject: () => projectQuery,
}));

beforeEach(() => {
    projectQuery.data = { projectUuid: 'project-uuid' };
    projectQuery.isInitialLoading = false;
});
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

const SqlRunnerTest = () => (
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
    </MemoryRouter>
);

const renderSqlRunner = () => renderWithProviders(<SqlRunnerTest />);

it('keeps the explore connection after clearing navigation state', async () => {
    renderSqlRunner();

    await waitFor(() =>
        expect(screen.getByTestId('navigation-state')).toHaveTextContent(
            'null',
        ),
    );
    expect(screen.getByTestId('connection-hint')).toHaveTextContent(
        'finance-uuid',
    );
});

it('preserves navigation state while the project loads, then opens the runner', async () => {
    projectQuery.data = undefined;
    projectQuery.isInitialLoading = true;
    const { rerender } = renderSqlRunner();

    expect(screen.getByText('Loading project')).toBeInTheDocument();
    expect(screen.queryByTestId('connection-hint')).not.toBeInTheDocument();
    expect(screen.getByTestId('navigation-state')).toHaveTextContent(
        'select 1',
    );

    projectQuery.data = { projectUuid: 'project-uuid' };
    projectQuery.isInitialLoading = false;
    // Trigger a rerender without replacing the router or its navigation state.
    rerender(<SqlRunnerTest />);

    await waitFor(() =>
        expect(screen.getByTestId('navigation-state')).toHaveTextContent(
            'null',
        ),
    );
    expect(screen.getByTestId('connection-hint')).toHaveTextContent(
        'finance-uuid',
    );
});

it('does not mount SQL Runner for managed analytics projects', () => {
    projectQuery.data = {
        projectUuid: 'project-uuid',
        provisioningSource: ProvisioningSource.ANALYTICS,
    };
    renderSqlRunner();

    expect(
        screen.getByText(
            'SQL Runner is unavailable for managed analytics projects',
        ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('connection-hint')).not.toBeInTheDocument();
    expect(screen.getByTestId('navigation-state')).toHaveTextContent(
        'select 1',
    );
});
