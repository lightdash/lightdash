import { DbtProjectType } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { lightdashApi } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import DbtSourcesPanel from './DbtSourcesPanel';

const compile = vi.hoisted(() => vi.fn());

vi.mock('../../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));

vi.mock('../../hooks/useRefreshServer', () => ({
    useRefreshServer: () => ({ mutate: compile, isLoading: false }),
}));

const mockApi = lightdashApi as unknown as Mock;

const sourcesUrl = '/projects/project-uuid/dbt-sources';
const bindingsUrl =
    '/projects/project-uuid/warehouse-connections/dbt-sources/bindings';
const bindUrl = (sourceUuid: string) =>
    `/projects/project-uuid/warehouse-connections/dbt-sources/${sourceUuid}`;

const summary = (
    projectDbtSourceUuid: string,
    name: string,
    isPrimary: boolean,
) => ({
    projectDbtSourceUuid,
    name,
    isPrimary,
    precedence: isPrimary ? 0 : 1,
    hasCredentialError: false,
    type: DbtProjectType.GITHUB,
    repository: `org/${name}`,
    branch: 'main',
    projectSubPath: '/',
    warehouseLocation: { database: null, schema: null },
});

const bindings = {
    connections: [
        {
            warehouseConnectionUuid: 'original-uuid',
            name: 'Main warehouse',
            isOriginal: true,
        },
        {
            warehouseConnectionUuid: 'finance-uuid',
            name: 'Finance warehouse',
            isOriginal: false,
        },
    ],
    sources: [
        {
            projectDbtSourceUuid: 'marketing-uuid',
            warehouseConnectionUuid: null,
        },
        {
            projectDbtSourceUuid: 'finance-source-uuid',
            warehouseConnectionUuid: 'finance-uuid',
        },
    ],
};

type Call = { url: string; method: string; body?: string };

const routeApi = (bindError?: unknown) => {
    mockApi.mockImplementation(async ({ url, method }: Call) => {
        if (url === sourcesUrl && method === 'GET') {
            return [
                summary('primary-uuid', 'dbt_project', true),
                summary('marketing-uuid', 'marketing', false),
                summary('finance-source-uuid', 'finance', false),
            ];
        }
        if (url === bindingsUrl && method === 'GET') return bindings;
        if (method === 'PUT' && url.startsWith(bindUrl(''))) {
            if (bindError) throw bindError;
            return undefined;
        }
        throw new Error(`Unexpected call ${method} ${url}`);
    });
};

const callsTo = (url: string, method: string) =>
    mockApi.mock.calls
        .map(([call]) => call as Call)
        .filter((call) => call.url === url && call.method === method);

const renderPanel = (connectionRoute: 'single' | 'multi') => {
    renderWithProviders(
        <DbtSourcesPanel
            project={{ projectUuid: 'project-uuid', connectionRoute }}
        />,
    );
    return userEvent.setup();
};

const pick = async (
    user: ReturnType<typeof userEvent.setup>,
    sourceName: string,
    connectionName: string,
) => {
    await user.click(
        await screen.findByRole('combobox', {
            name: `Connection for ${sourceName}`,
        }),
    );
    await user.click(
        await screen.findByRole('option', { name: connectionName }),
    );
};

describe('DbtSourcesPanel connections', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        routeApi();
    });

    it('renders the single-project panel with no connection controls and no binding request', async () => {
        renderPanel('single');

        expect(await screen.findByText('marketing')).toBeInTheDocument();
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(mockApi.mock.calls.map(([call]) => (call as Call).url)).toEqual([
            sourcesUrl,
        ]);
        expect(
            screen.queryByRole('combobox', { name: /Connection for/ }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/Always runs on/)).not.toBeInTheDocument();
    });

    it('shows the connection of each source, with the primary always on the original', async () => {
        renderPanel('multi');

        expect(
            await screen.findByText('Always runs on Main warehouse'),
        ).toBeInTheDocument();
        expect(
            await screen.findByRole('combobox', {
                name: 'Connection for marketing',
            }),
        ).toHaveValue('Main warehouse');
        expect(
            screen.getByRole('combobox', { name: 'Connection for finance' }),
        ).toHaveValue('Finance warehouse');
        expect(
            screen.queryByRole('combobox', {
                name: 'Connection for dbt_project',
            }),
        ).not.toBeInTheDocument();
    });

    it('binds a source to an extra connection, says the next compile moves its explores, and offers to compile', async () => {
        const user = renderPanel('multi');

        await pick(user, 'marketing', 'Finance warehouse');

        await waitFor(() =>
            expect(callsTo(bindUrl('marketing-uuid'), 'PUT')).toHaveLength(1),
        );
        expect(
            JSON.parse(callsTo(bindUrl('marketing-uuid'), 'PUT')[0].body!),
        ).toEqual({ warehouseConnectionUuid: 'finance-uuid' });
        expect(
            await screen.findByText(
                /marketing now runs on Finance warehouse\. Its explores move to Finance warehouse on the next compile/,
            ),
        ).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Compile now' }));
        expect(compile).toHaveBeenCalledWith(
            { syncContent: false },
            expect.anything(),
        );
    });

    it('binds a source back to the original with a null binding', async () => {
        const user = renderPanel('multi');

        await pick(user, 'finance', 'Main warehouse');

        await waitFor(() =>
            expect(callsTo(bindUrl('finance-source-uuid'), 'PUT')).toHaveLength(
                1,
            ),
        );
        expect(
            JSON.parse(callsTo(bindUrl('finance-source-uuid'), 'PUT')[0].body!),
        ).toEqual({ warehouseConnectionUuid: null });
    });

    it('shows the server error and no compile note when the binding is refused', async () => {
        routeApi({
            status: 'error',
            error: {
                name: 'NotFoundError',
                message: 'Connection not found',
                statusCode: 404,
                data: {},
            },
        });
        const user = renderPanel('multi');

        await pick(user, 'marketing', 'Finance warehouse');

        expect(
            await screen.findByText('Connection not found'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/on the next compile/),
        ).not.toBeInTheDocument();
    });
});
