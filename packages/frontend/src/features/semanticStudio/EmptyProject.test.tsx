import {
    DbtProjectType,
    WarehouseTypes,
    type SemanticLayerStatus,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { LiveSourceActionsContext } from '../externalConnections/liveSources/liveSourceActions';
import { ExternalSourceActionsContext } from '../externalSources/hooks/externalSourceActions';
import { BuildFirstModel, EmptyProject } from './EmptyProject';
import { type StudioPermissions } from './permissions';
import { useSemanticStudio } from './useSemanticStudio';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => api,
}));
type FlagState = {
    data: { enabled: boolean } | undefined;
    isInitialLoading: boolean;
};
const flag = vi.hoisted((): { current: FlagState } => ({
    current: { data: { enabled: true }, isInitialLoading: false },
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => flag.current,
}));

const ADMIN: StudioPermissions = {
    modelled: true,
    sqlViews: true,
    files: true,
    live: true,
};
const EDITOR: StudioPermissions = {
    modelled: false,
    sqlViews: false,
    files: true,
    live: false,
};
const EDITABLE: SemanticLayerStatus = {
    enabled: true,
    blocker: null,
    appliesAs: 'live',
};
const NO_ROLE: SemanticLayerStatus = {
    enabled: false,
    blocker: 'no_access',
    appliesAs: 'live',
};
const PENDING = new Promise<never>(() => {});

type Setup = {
    status: SemanticLayerStatus | 'pending';
    warehouse: boolean;
    dbtType: DbtProjectType;
};

const mockApi = ({ status, warehouse, dbtType }: Setup) =>
    api.mockImplementation(({ url }: { url: string }) => {
        if (url === '/projects/project') {
            return Promise.resolve({
                projectUuid: 'project',
                warehouseConnection: warehouse
                    ? { type: WarehouseTypes.POSTGRES }
                    : undefined,
                dbtConnection: { type: dbtType },
            });
        }
        if (url === '/projects/project/sqlRunner/tables') {
            return Promise.resolve({
                db: { schema_a: { table_a: {}, table_b: {} } },
            });
        }
        if (url === '/projects/project/semantic-studio/status') {
            return status === 'pending' ? PENDING : Promise.resolve(status);
        }
        if (url.startsWith('/health')) {
            return Promise.resolve({
                externalSources: { engineAvailable: true },
                rudder: { writeKey: '', dataPlaneUrl: '' },
            });
        }
        if (url === '/aiAgents/settings') {
            return Promise.resolve({ isCopilotEnabled: true });
        }
        return Promise.reject(new Error(`Unexpected ${url}`));
    });

const Harness: FC<{
    permissions: StudioPermissions;
    isLoadingAgents: boolean;
    onAsk: ((prompt: string) => void) | null;
}> = ({ permissions, isLoadingAgents, onAsk }) => {
    const view = useSemanticStudio({
        project: {
            id: 'project',
            name: 'Project',
            warehouse: undefined,
            sources: [],
            explores: [],
        },
        permissions,
        canOpenSettings: permissions.live,
        route: { ref: null },
        onNavigate: () => {},
    });
    return onAsk ? (
        <BuildFirstModel view={view} onAsk={onAsk} firstRequest={null} />
    ) : (
        <EmptyProject view={view} isLoadingAgents={isLoadingAgents} />
    );
};

const renderEmpty = ({
    permissions = ADMIN,
    isLoadingAgents = false,
    onAsk = null,
    ...setup
}: Partial<Setup> & {
    permissions?: StudioPermissions;
    isLoadingAgents?: boolean;
    onAsk?: ((prompt: string) => void) | null;
}) => {
    mockApi({
        status: EDITABLE,
        warehouse: true,
        dbtType: DbtProjectType.NONE,
        ...setup,
    });
    renderWithProviders(
        <MemoryRouter>
            <LiveSourceActionsContext.Provider
                value={
                    permissions.live
                        ? {
                              add: vi.fn(),
                              getReconnect: () => null,
                              remove: vi.fn(),
                          }
                        : null
                }
            >
                <ExternalSourceActionsContext.Provider
                    value={
                        permissions.files
                            ? {
                                  add: vi.fn(),
                                  preview: vi.fn(),
                                  rename: vi.fn(),
                                  replaceFile: vi.fn(),
                                  remove: vi.fn(),
                              }
                            : null
                    }
                >
                    <Harness
                        permissions={permissions}
                        isLoadingAgents={isLoadingAgents}
                        onAsk={onAsk}
                    />
                </ExternalSourceActionsContext.Provider>
            </LiveSourceActionsContext.Provider>
        </MemoryRouter>,
    );
};

const startFromButtons = () =>
    screen
        .getAllByRole('button')
        .concat(screen.queryAllByRole('link'))
        .map((element) => element.textContent)
        .filter((text) =>
            ['Virtual view', 'External source', 'Live data source'].includes(
                text ?? '',
            ),
        )
        .sort();

beforeEach(() => {
    api.mockReset();
    flag.current = { data: { enabled: true }, isInitialLoading: false };
});

describe('EmptyProject', () => {
    it('shows a skeleton, not copy, while the status loads', async () => {
        renderEmpty({ status: 'pending' });
        expect(await screen.findByLabelText('Loading')).toBeInTheDocument();
        expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    });

    it('shows a skeleton while the agents load', async () => {
        renderEmpty({ isLoadingAgents: true });
        expect(await screen.findByLabelText('Loading')).toBeInTheDocument();
        expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    });

    it('shows a skeleton while the editing flag loads', async () => {
        flag.current = { data: undefined, isInitialLoading: true };
        renderEmpty({});
        expect(await screen.findByLabelText('Loading')).toBeInTheDocument();
    });

    it('offers an agent, the warehouse and the CLI to someone who can edit without one', async () => {
        renderEmpty({});
        expect(
            await screen.findByRole('link', {
                name: 'Create an agent to draft models for you',
            }),
        ).toBeInTheDocument();
        expect(
            await screen.findByText('db.schema_a · 2 tables'),
        ).toBeInTheDocument();
        expect(screen.getByText('table_a')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /Model table_a/ }),
        ).not.toBeInTheDocument();
        expect(screen.getByText(/Prefer code\?/)).toBeInTheDocument();
        expect(startFromButtons()).toEqual([
            'External source',
            'Live data source',
            'Virtual view',
        ]);
    });

    it('tells someone without the role why, read-only, with only what their role adds', async () => {
        renderEmpty({ status: NO_ROLE, permissions: EDITOR });
        expect(
            await screen.findByText(/needs the Developer or Admin role/),
        ).toBeInTheDocument();
        expect(
            await screen.findByText('db.schema_a · 2 tables'),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Prefer code\?/)).not.toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: /Create an agent/ }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /Model table_a/ }),
        ).not.toBeInTheDocument();
        expect(startFromButtons()).toEqual(['External source']);
    });

    it('says editing is off for the organization, with no role or CLI advice', async () => {
        flag.current = { data: { enabled: false }, isInitialLoading: false };
        renderEmpty({});
        expect(
            await screen.findByText(
                "Semantic layer editing isn't turned on for this organization.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/Developer or Admin/),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/Prefer code\?/)).not.toBeInTheDocument();
    });

    it('asks to connect a warehouse when there is none', async () => {
        renderEmpty({ warehouse: false });
        expect(
            await screen.findByText('Connect a warehouse to start'),
        ).toBeInTheDocument();
    });

    it('waits for a connected dbt project to refresh', async () => {
        renderEmpty({ dbtType: DbtProjectType.GITHUB });
        expect(await screen.findByText('No models yet')).toBeInTheDocument();
    });
});

describe('BuildFirstModel', () => {
    it('starts the chat on a table from the warehouse card', async () => {
        const user = userEvent.setup();
        const onAsk = vi.fn();
        renderEmpty({ onAsk });
        await user.click(
            await screen.findByRole('button', { name: 'Model table_b' }),
        );
        expect(onAsk).toHaveBeenCalledWith(
            expect.stringContaining('schema_a.table_b'),
        );
    });
});
