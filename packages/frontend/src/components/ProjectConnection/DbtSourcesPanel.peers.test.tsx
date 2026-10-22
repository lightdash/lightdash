import {
    DbtProjectType,
    FeatureFlags,
    type DbtRepositorySummary,
    type PeerDbtSourceSummary,
    type ProjectDbtSourceSummary,
} from '@lightdash/common';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { sharedLightdashApi } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import DbtSourcesPanel from './DbtSourcesPanel';

const flags = vi.hoisted(() => ({ peers: true }));
vi.mock('../../api');
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (flag: FeatureFlags) => ({
        data: {
            enabled: flag === FeatureFlags.MultiDbtSources || flags.peers,
        },
    }),
}));
vi.mock('./DbtSettingsForm', () => ({ default: () => null }));
vi.mock('../../hooks/useRefreshServer', () => ({
    useRefreshServer: () => ({ mutate: vi.fn(), isLoading: false }),
    useJob: vi.fn(),
}));

const mockApi = sharedLightdashApi as unknown as Mock;
const project = { projectUuid: 'project_a', connectionRoute: 'multi' as const };
const baseUrl = '/projects/project_a/dbt-sources';
const bindingsUrl =
    '/projects/project_a/warehouse-connections/dbt-sources/bindings';
const repository: DbtRepositorySummary = {
    dbtRepositoryUuid: 'repository_a',
    provider: 'github',
    host: 'github.com',
    owner: 'org_a',
    name: 'source_a',
    defaultBranch: 'main',
    dbtProjectName: 'project_a',
    createdByProjectUuid: 'project_a',
    isShared: false,
};
const primary: ProjectDbtSourceSummary = {
    projectDbtSourceUuid: 'primary_a',
    name: 'primary_a',
    isPrimary: true,
    precedence: 0,
    hasCredentialError: false,
    type: DbtProjectType.GITHUB,
    repository: 'org_a/primary_a',
    branch: 'main',
    projectSubPath: '/',
    warehouseLocation: { database: null, schema: null },
};
const source: PeerDbtSourceSummary = {
    ...primary,
    projectDbtSourceUuid: 'source_a',
    name: 'source_a',
    isPrimary: false,
    precedence: 1,
    repository: 'org_a/source_a',
    peer: {
        usesSharedCredentials: false,
        dbtRepositoryUuid: 'repository_a',
        dbtProjectName: 'project_a',
        warehouseConnectionUuid: null,
        membershipRole: 'publish',
        refreshPolicy: 'git_refresh',
        dbtProjectNameConflict: null,
        repository,
    },
};
const bindings = {
    connections: [
        {
            warehouseConnectionUuid: 'connection_a',
            name: 'Connection A',
            isOriginal: true,
        },
        {
            warehouseConnectionUuid: 'connection_b',
            name: 'Connection B',
            isOriginal: false,
        },
    ],
    sources: [
        { projectDbtSourceUuid: 'source_a', warehouseConnectionUuid: null },
    ],
};
type Call = { url: string; method: string; body?: string };
const calls = (url: string, method: string) =>
    mockApi.mock.calls
        .map(([call]) => call as Call)
        .filter((call) => call.url === url && call.method === method);

const routeApi = ({
    peerSource = source,
    noExtras = false,
    mutationError = false,
}: {
    peerSource?: PeerDbtSourceSummary;
    noExtras?: boolean;
    mutationError?: boolean;
} = {}) => {
    let isShared = peerSource.peer.repository?.isShared ?? false;
    mockApi.mockImplementation(async ({ url, method, body }: Call) => {
        if (url === baseUrl && method === 'GET') {
            return noExtras ? [primary] : [primary, peerSource];
        }
        if (url === `${baseUrl}/peers` && method === 'GET') {
            return noExtras
                ? [{ ...primary, peer: source.peer }]
                : [
                      {
                          ...peerSource,
                          peer: {
                              ...peerSource.peer,
                              repository: peerSource.peer.repository
                                  ? { ...peerSource.peer.repository, isShared }
                                  : null,
                          },
                      },
                  ];
        }
        if (url === `${baseUrl}/source_a` && method === 'GET') {
            return { ...peerSource, dbtConnection: null };
        }
        if (url === bindingsUrl && method === 'GET') return bindings;
        if (url === `${baseUrl}/shared` && method === 'GET') {
            return [
                {
                    ...repository,
                    createdByProjectUuid: 'project_b',
                    isShared: true,
                },
            ];
        }
        if (method === 'PATCH' || method === 'POST' || method === 'PUT') {
            if (mutationError) {
                throw {
                    status: 'error',
                    error: {
                        message: 'The source could not be updated',
                        statusCode: 400,
                        name: 'ParameterError',
                        data: {},
                    },
                };
            }
            if (url === `${baseUrl}/repositories/repository_a`) {
                isShared = JSON.parse(body!).isShared;
            }
            return method === 'POST' ? 'source_b' : undefined;
        }
        if (url === '/github/config') return { enabled: false };
        throw new Error(`Unexpected request ${method} ${url}`);
    });
};

const renderPanel = (canManage = true) => {
    renderWithProviders(<DbtSourcesPanel project={project} />, {
        user: {
            abilityRules: canManage
                ? [
                      {
                          action: 'manage',
                          subject: 'Project',
                          conditions: { projectUuid: 'project_a' },
                      },
                  ]
                : [],
        },
    });
    return userEvent.setup();
};
const openSettings = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByText(/dbt project: project_a/);
    await user.click(
        screen.getByRole('button', { name: 'Actions for source_a' }),
    );
    await user.click(
        await screen.findByRole('menuitem', { name: 'dbt settings' }),
    );
    return screen.findByRole('dialog');
};
const openShared = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: 'Add source' }));
    await user.click(
        await screen.findByRole('button', {
            name: 'Add a shared source instead',
        }),
    );
    return screen.findByRole('dialog', { name: 'Add a shared dbt source' });
};

describe('dbt peer settings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        flags.peers = true;
        routeApi();
    });

    it('makes no peer or shared requests and keeps the existing panel when the flag is off', async () => {
        flags.peers = false;
        const user = renderPanel();
        await screen.findByText('source_a');
        await user.click(
            screen.getByRole('button', { name: 'Actions for source_a' }),
        );
        expect(
            await screen.findByRole('menuitem', { name: 'Edit' }),
        ).toBeEnabled();
        expect(
            screen.queryByRole('menuitem', { name: 'dbt settings' }),
        ).not.toBeInTheDocument();
        expect(calls(`${baseUrl}/peers`, 'GET')).toHaveLength(0);
        expect(calls(`${baseUrl}/shared`, 'GET')).toHaveLength(0);
        expect(screen.queryByText(/dbt project:/)).not.toBeInTheDocument();
    });

    it('keeps a project with no extras unchanged until the add dialog is opened', async () => {
        routeApi({ noExtras: true });
        flags.peers = false;
        const user = userEvent.setup();
        const { container, rerender } = renderWithProviders(
            <DbtSourcesPanel project={project} />,
        );
        expect(await screen.findByText('primary_a')).toBeInTheDocument();
        const previousMarkup = container.innerHTML;
        flags.peers = true;
        rerender(<DbtSourcesPanel project={project} />);
        await waitFor(() =>
            expect(calls(`${baseUrl}/peers`, 'GET')).toHaveLength(1),
        );
        await waitFor(() => expect(container.innerHTML).toBe(previousMarkup));
        expect(screen.queryByText(/dbt project:/)).not.toBeInTheDocument();
        expect(screen.queryByText(/shared source/)).not.toBeInTheDocument();
        expect(calls(`${baseUrl}/shared`, 'GET')).toHaveLength(0);
        await user.click(screen.getByRole('button', { name: 'Add source' }));
        expect(
            await screen.findByRole('button', {
                name: 'Add a shared source instead',
            }),
        ).toBeInTheDocument();
        expect(calls(`${baseUrl}/shared`, 'GET')).toHaveLength(0);
    });

    it('keeps the primary row when the peer endpoint omits it and shows conflict guidance', async () => {
        routeApi({
            peerSource: {
                ...source,
                peer: { ...source.peer, dbtProjectNameConflict: 'project_a' },
            },
        });
        renderPanel();
        expect(await screen.findByText('primary_a')).toBeInTheDocument();
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Two sources provide dbt project project_a on the same connection; rename or rebind one.',
        );
    });

    it('validates the dbt project name and saves metadata without connection credentials', async () => {
        const user = renderPanel();
        const dialog = await openSettings(user);
        const name = within(dialog).getByRole('textbox', {
            name: 'dbt project name',
        });
        await user.clear(name);
        await user.type(name, 'invalid-name');
        await user.click(
            within(dialog).getByRole('button', { name: 'Save changes' }),
        );
        expect(
            within(dialog).getByText(/Use a dbt project name with letters/),
        ).toBeInTheDocument();
        expect(calls(`${baseUrl}/peers/source_a`, 'PATCH')).toHaveLength(0);
        await user.clear(name);
        await user.type(name, ' project_b ');
        await user.click(
            within(dialog).getByRole('combobox', { name: 'Membership role' }),
        );
        await user.click(
            await screen.findByRole('option', { name: 'Dependency only' }),
        );
        await user.click(
            within(dialog).getByRole('combobox', { name: 'Refresh policy' }),
        );
        await user.click(
            await screen.findByRole('option', { name: 'CI managed' }),
        );
        await user.click(
            within(dialog).getByRole('button', { name: 'Save changes' }),
        );
        await waitFor(() =>
            expect(calls(`${baseUrl}/peers/source_a`, 'PATCH')).toHaveLength(1),
        );
        expect(
            JSON.parse(calls(`${baseUrl}/peers/source_a`, 'PATCH')[0].body!),
        ).toEqual({
            dbtProjectName: 'project_b',
            membershipRole: 'dependency_only',
            refreshPolicy: 'ci_managed',
        });
        expect(calls(`${baseUrl}/source_a`, 'GET')).toHaveLength(0);
    });

    it('clears an absent dbt project name with null', async () => {
        const user = renderPanel();
        const dialog = await openSettings(user);
        await user.clear(
            within(dialog).getByRole('textbox', { name: 'dbt project name' }),
        );
        await user.click(
            within(dialog).getByRole('button', { name: 'Save changes' }),
        );
        await waitFor(() =>
            expect(calls(`${baseUrl}/peers/source_a`, 'PATCH')).toHaveLength(1),
        );
        expect(
            JSON.parse(calls(`${baseUrl}/peers/source_a`, 'PATCH')[0].body!)
                .dbtProjectName,
        ).toBeNull();
    });

    it('lets the owning project admin share a repository and refreshes the toggle', async () => {
        const user = renderPanel();
        const dialog = await openSettings(user);
        const toggle = within(dialog).getByRole('switch', {
            name: 'Share this repository with other projects',
        });
        await user.click(toggle);
        await waitFor(() => expect(toggle).toBeChecked());
        expect(
            JSON.parse(
                calls(`${baseUrl}/repositories/repository_a`, 'PATCH')[0].body!,
            ),
        ).toEqual({ isShared: true });
    });

    it('hides the connection editor and share toggle for a consuming project while keeping rebinding usable', async () => {
        routeApi({
            peerSource: {
                ...source,
                peer: {
                    ...source.peer,
                    usesSharedCredentials: true,
                    repository: {
                        ...repository,
                        createdByProjectUuid: 'project_b',
                        isShared: true,
                    },
                },
            },
        });
        const user = renderPanel();
        await screen.findByText(/dbt project: project_a/);
        await user.click(
            screen.getByRole('button', { name: 'Actions for source_a' }),
        );
        expect(
            screen.queryByRole('menuitem', { name: 'Edit' }),
        ).not.toBeInTheDocument();
        await user.click(
            await screen.findByRole('menuitem', { name: 'dbt settings' }),
        );
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).queryByRole('switch')).not.toBeInTheDocument();
        await user.click(within(dialog).getByRole('button', { name: 'Close' }));
        await user.click(
            screen.getByRole('combobox', { name: 'Connection for source_a' }),
        );
        await user.click(
            await screen.findByRole('option', { name: 'Connection B' }),
        );
        await waitFor(() =>
            expect(
                calls(
                    '/projects/project_a/warehouse-connections/dbt-sources/source_a',
                    'PUT',
                ),
            ).toHaveLength(1),
        );
        expect(calls(`${baseUrl}/source_a`, 'GET')).toHaveLength(0);
    });

    it('keeps an independent local source editable when another project owns its shared registry', async () => {
        routeApi({
            peerSource: {
                ...source,
                peer: {
                    ...source.peer,
                    usesSharedCredentials: false,
                    repository: {
                        ...repository,
                        createdByProjectUuid: 'project_b',
                        isShared: true,
                    },
                },
            },
        });
        const user = renderPanel();
        await screen.findByText(/dbt project: project_a/);
        await user.click(
            screen.getByRole('button', { name: 'Actions for source_a' }),
        );
        await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
        const dialog = await screen.findByRole('dialog', {
            name: 'Edit dbt source',
        });
        expect(
            await within(dialog).findByRole('textbox', { name: 'Name' }),
        ).toHaveValue('source_a');
        expect(calls(`${baseUrl}/source_a`, 'GET')).toHaveLength(1);
        await user.click(within(dialog).getByRole('button', { name: 'Close' }));
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        const settings = await openSettings(user);
        expect(within(settings).queryByRole('switch')).not.toBeInTheDocument();
    });

    it('shows disabled metadata controls to a non-admin and prevents add and rebind', async () => {
        const user = renderPanel(false);
        await screen.findByText(/dbt project: project_a/);
        expect(
            screen.getByRole('button', { name: 'Add source' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('combobox', { name: 'Connection for source_a' }),
        ).toBeDisabled();
        const dialog = await openSettings(user);
        expect(
            within(dialog).getByRole('textbox', { name: 'dbt project name' }),
        ).toBeDisabled();
        expect(
            within(dialog).getByRole('combobox', { name: 'Membership role' }),
        ).toBeDisabled();
        expect(
            within(dialog).getByRole('combobox', { name: 'Refresh policy' }),
        ).toBeDisabled();
        expect(
            within(dialog).queryByRole('button', { name: 'Save changes' }),
        ).not.toBeInTheDocument();
        expect(within(dialog).queryByRole('switch')).not.toBeInTheDocument();
        expect(
            mockApi.mock.calls.every(
                ([call]) => (call as Call).method === 'GET',
            ),
        ).toBe(true);
    });

    it('lists shared repositories only on request and adds one with the selected connection and policies', async () => {
        const user = renderPanel();
        await screen.findByText(/dbt project: project_a/);
        expect(calls(`${baseUrl}/shared`, 'GET')).toHaveLength(0);
        const dialog = await openShared(user);
        await user.click(
            within(dialog).getByRole('combobox', { name: 'Shared repository' }),
        );
        await user.click(
            await screen.findByRole('option', {
                name: 'github.com/org_a/source_a',
            }),
        );
        await user.type(
            within(dialog).getByRole('textbox', { name: 'Name' }),
            'source_b',
        );
        await user.click(
            within(dialog).getByRole('combobox', { name: 'Connection' }),
        );
        await user.click(
            await screen.findByRole('option', { name: 'Connection B' }),
        );
        await user.click(
            within(dialog).getByRole('combobox', { name: 'Membership role' }),
        );
        await user.click(
            await screen.findByRole('option', { name: 'Dependency only' }),
        );
        await user.click(
            within(dialog).getByRole('combobox', { name: 'Refresh policy' }),
        );
        await user.click(
            await screen.findByRole('option', { name: 'CI managed' }),
        );
        await user.click(
            within(dialog).getByRole('button', { name: 'Add source' }),
        );
        await waitFor(() =>
            expect(calls(`${baseUrl}/shared`, 'POST')).toHaveLength(1),
        );
        expect(JSON.parse(calls(`${baseUrl}/shared`, 'POST')[0].body!)).toEqual(
            {
                dbtRepositoryUuid: 'repository_a',
                name: 'source_b',
                warehouseConnectionUuid: 'connection_b',
                membershipRole: 'dependency_only',
                refreshPolicy: 'ci_managed',
            },
        );
    });

    it('keeps failed settings open and displays the server error', async () => {
        routeApi({ mutationError: true });
        const user = renderPanel();
        const dialog = await openSettings(user);
        await user.click(
            within(dialog).getByRole('button', { name: 'Save changes' }),
        );
        expect(await within(dialog).findByRole('alert')).toHaveTextContent(
            'The source could not be updated',
        );
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
});
