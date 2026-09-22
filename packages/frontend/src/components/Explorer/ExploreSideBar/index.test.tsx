import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import type * as ReactRouter from 'react-router';
import {
    buildInitialExplorerState,
    createExplorerStore,
    selectTableName,
} from '../../../features/explorer/store';
import ExploreSideBar from './index';

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router', async () => ({
    ...(await vi.importActual<typeof ReactRouter>('react-router')),
    useNavigate: () => mocks.navigate,
}));
vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project',
}));
vi.mock('../../../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => ({ projectUrlIdentifier: 'project-slug' }),
}));
vi.mock('../../../hooks/organization/useOrganization', () => ({
    useOrganization: () => ({ data: { organizationUuid: 'org' } }),
}));
vi.mock('../../../providers/Ability/useAbilityContext', () => ({
    useAbilityContext: () => ({ can: () => true }),
}));
vi.mock('../../../providers/Tracking/TrackingProvider', () => ({
    TrackSection: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../ExplorePanel', () => ({
    default: ({ onBack }: { onBack: () => void }) => (
        <button onClick={onBack}>Back to tables</button>
    ),
}));
vi.mock('./BasePanel', () => ({ default: () => <div>Tables</div> }));
vi.mock('../ExploreTree/LoadingSkeleton', () => ({ default: () => null }));

const clients: QueryClient[] = [];
beforeEach(() => mocks.navigate.mockReset());
afterEach(() => clients.forEach((client) => client.clear()));
const renderSidebar = (
    onBeforeBackToTables?: (proceed: () => void) => void,
    onBackToTables?: () => void,
) => {
    const state = buildInitialExplorerState({ isEditMode: true });
    const store = createExplorerStore({
        explorer: {
            ...state,
            unsavedChartVersion: {
                ...state.unsavedChartVersion,
                tableName: 'orders',
            },
        },
    });
    const client = new QueryClient();
    clients.push(client);
    render(
        <QueryClientProvider client={client}>
            <Provider store={store}>
                <MemoryRouter>
                    <ExploreSideBar
                        onBeforeBackToTables={onBeforeBackToTables}
                        onBackToTables={onBackToTables}
                    />
                </MemoryRouter>
            </Provider>
        </QueryClientProvider>,
    );
    return store;
};

it('keeps default back behavior: reset the query and navigate to project tables', async () => {
    const store = renderSidebar();
    fireEvent.click(
        await screen.findByRole('button', { name: 'Back to tables' }),
    );
    expect(selectTableName(store.getState())).toBe('');
    expect(mocks.navigate).toHaveBeenCalledWith(
        '/projects/project-slug/tables',
    );
});

it('defers resetting the store and calling the host until its guard proceeds', async () => {
    const guard = vi.fn();
    const back = vi.fn();
    const store = renderSidebar(guard, back);
    fireEvent.click(
        await screen.findByRole('button', { name: 'Back to tables' }),
    );
    expect(guard).toHaveBeenCalledWith(expect.any(Function));
    expect(selectTableName(store.getState())).toBe('orders');
    expect(back).not.toHaveBeenCalled();
    await act(() => guard.mock.calls[0][0]());
    expect(selectTableName(store.getState())).toBe('');
    expect(back).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).not.toHaveBeenCalled();
});
