import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    type DataAppViz,
    type ItemsMap,
    type PossibleAbilities,
    type RegistryChartTypeListItem,
} from '@lightdash/common';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExplorerStore } from '../../../features/explorer/store';
import type * as ExplorerStore from '../../../features/explorer/store';
import { AbilityContext } from '../../../providers/Ability/context';
import { renderWithProviders } from '../../../testing/testUtils';
import AddChartTypeMenu from './AddChartTypeMenu';

const { mocks } = vi.hoisted(() => ({
    mocks: {
        selectProjectChartType: vi.fn(),
        navigate: vi.fn(),
        dispatch: vi.fn(),
        canCreateDataApp: vi.fn(() => true),
        installChartType: vi.fn(),
        getDataAppVisualization: vi.fn(),
    },
}));

const installedChartType = {
    dataAppVizUuid: 'installed-chart-type',
    slug: 'official-pulse',
    name: 'Official pulse',
    description: 'Ranked bars from the library',
    projectUuid: 'project-uuid',
    spaceUuid: null,
    createdAt: new Date('2026-08-20T00:00:00Z'),
    createdByUserUuid: 'user-uuid',
    schema: { fields: [], configOptions: [], colorPalette: null },
    icon: null,
    registrySlug: 'official-pulse',
} satisfies DataAppViz;

// Just the fields the library card and detail modal read.
const registryChart = {
    slug: 'official-pulse',
    name: 'Official pulse',
    description: 'Ranked bars from the library',
    version: '1.0.0',
    channel: 'stable',
    releaseStage: 'stable',
    state: 'not_installed',
    publishedAt: new Date('2026-09-01T00:00:00Z'),
    thumbnail: null,
    thumbnailDark: null,
    screenshots: [],
    vizSchema: { fields: [], configOptions: [] },
    installedAppUuid: null,
    installedRegistryVersion: null,
    installedCreatedByUserUuid: null,
} as unknown as RegistryChartTypeListItem;

const itemsMap = { orders_status: { name: 'status' } } as unknown as ItemsMap;

vi.mock('../../../features/chartTypes/hooks/useDataAppVisualization', () => ({
    getDataAppVisualization: (...args: unknown[]) =>
        mocks.getDataAppVisualization(...args),
}));
const { featureFlags } = vi.hoisted(() => ({
    featureFlags: { current: {} as Record<string, boolean> },
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (flag: string) => ({
        data: { enabled: featureFlags.current[flag] === true },
    }),
}));
vi.mock('../../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => ({ itemsMap }),
}));
vi.mock(
    '../../VisualizationConfigs/CustomChartType/useSelectProjectChartType',
    () => ({
        useSelectProjectChartType: () => mocks.selectProjectChartType,
    }),
);
vi.mock('../../../features/apps/hooks/useCanCreateDataApp', () => ({
    useCanCreateDataApp: () => mocks.canCreateDataApp(),
}));
vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
}));
// The library modal's section fetches the registry; an enabled registry
// keeps the modal renderable without network.
const { registryState } = vi.hoisted(() => ({
    registryState: {
        current: { registryEnabled: true, charts: [] as unknown[] },
    },
}));
vi.mock('../../../features/chartTypes/hooks/useRegistryChartTypes', () => ({
    useRegistryChartTypes: () => ({
        data: registryState.current,
        error: null,
        isInitialLoading: false,
        refetch: vi.fn(),
    }),
}));
vi.mock(
    '../../../features/chartTypes/hooks/useInstallRegistryChartType',
    () => ({
        useInstallRegistryChartType: () => ({
            isLoading: false,
            mutate: mocks.installChartType,
        }),
    }),
);
vi.mock('../../../features/explorer/store', async (importOriginal) => ({
    ...(await importOriginal<typeof ExplorerStore>()),
    useExplorerDispatch: () => mocks.dispatch,
    explorerActions: {
        startChartTypeAuthoring: (payload: unknown) => ({
            type: 'startChartTypeAuthoring',
            payload,
        }),
    },
}));
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useParams: () => ({ projectUuid: 'project-uuid' }),
    useLocation: () => ({ search: '?tableName=orders' }),
    useNavigate: () => mocks.navigate,
}));

// The library modal renders router Links. Can-gated actions (the library's
// Install) see an empty ability unless a test passes one.
const renderMenu = (
    ability: Ability<PossibleAbilities> = new Ability<PossibleAbilities>(),
) =>
    renderWithProviders(
        <Provider store={createExplorerStore()}>
            <AbilityContext.Provider value={ability}>
                <MemoryRouter>
                    <AddChartTypeMenu />
                </MemoryRouter>
            </AbilityContext.Provider>
        </Provider>,
    );

const expectLibraryDialog = async () => {
    // The library opens in place; the explore context is never left.
    const dialog = await screen.findByRole('dialog');
    expect(
        within(dialog).getByText('Find new chart types'),
    ).toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
    return dialog;
};

describe('AddChartTypeMenu', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        featureFlags.current = {
            [FeatureFlags.EnableDataApps]: true,
            [FeatureFlags.ChartTypeRegistry]: true,
        };
        mocks.canCreateDataApp.mockReturnValue(true);
        registryState.current = { registryEnabled: true, charts: [] };
    });

    it('offers both destinations from one "Add" menu', async () => {
        renderMenu();

        const button = screen.getByRole('button', { name: 'Add chart type' });
        expect(button).toHaveTextContent('Add');
        expect(button).toHaveAttribute('aria-haspopup', 'menu');
        await userEvent.click(button);

        const items = await screen.findAllByRole('menuitem');
        expect(items.map((item) => item.textContent)).toEqual([
            'Browse the Lightdash libraryReady-made chart types, installed in one click',
            'Create your ownDescribe a chart type in Chart Studio',
        ]);
    });

    it('opens the library in a modal from the menu', async () => {
        renderMenu();

        await userEvent.click(
            screen.getByRole('button', { name: 'Add chart type' }),
        );
        await userEvent.click(
            await screen.findByRole('menuitem', {
                name: /Browse the Lightdash library/,
            }),
        );

        const dialog = await expectLibraryDialog();
        expect(
            within(dialog).getByRole('link', {
                name: 'Open Chart Studio',
            }),
        ).toHaveAttribute(
            'href',
            '/projects/project-uuid/chart-types?tab=chart-library',
        );
    });

    it('starts authoring in Chart Studio from the menu', async () => {
        renderMenu();

        await userEvent.click(
            screen.getByRole('button', { name: 'Add chart type' }),
        );
        await userEvent.click(
            await screen.findByRole('menuitem', { name: /Create your own/ }),
        );

        expect(mocks.dispatch).toHaveBeenCalledWith({
            type: 'startChartTypeAuthoring',
            payload: { dataAppVizUuid: null },
        });
        expect(mocks.navigate).not.toHaveBeenCalled();
    });

    it('opens the library directly without permission to author', async () => {
        mocks.canCreateDataApp.mockReturnValue(false);
        renderMenu();

        expect(
            screen.queryByRole('button', { name: 'Add chart type' }),
        ).not.toBeInTheDocument();
        const button = screen.getByRole('button', {
            name: 'Add chart type from the library',
        });
        expect(button).not.toHaveAttribute('aria-haspopup');

        await userEvent.click(button);
        await expectLibraryDialog();
    });

    it('starts authoring directly without the library flag', async () => {
        featureFlags.current = { [FeatureFlags.EnableDataApps]: true };
        renderMenu();

        const button = screen.getByRole('button', {
            name: 'Add chart type in Chart Studio',
        });
        expect(button).not.toHaveAttribute('aria-haspopup');

        await userEvent.click(button);
        expect(mocks.dispatch).toHaveBeenCalledWith({
            type: 'startChartTypeAuthoring',
            payload: { dataAppVizUuid: null },
        });
    });

    it('renders nothing when neither destination is open', () => {
        featureFlags.current = {};
        renderMenu();

        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('selects a chart type installed from the library modal', async () => {
        registryState.current = {
            registryEnabled: true,
            charts: [registryChart],
        };
        mocks.getDataAppVisualization.mockResolvedValue(installedChartType);
        mocks.installChartType.mockImplementation(
            (
                _variables: unknown,
                options?: { onSuccess?: (result: unknown) => void },
            ) =>
                options?.onSuccess?.({
                    appUuid: installedChartType.dataAppVizUuid,
                    slug: installedChartType.slug,
                    version: 1,
                    action: 'installed',
                    upgradedChartCount: 0,
                }),
        );
        renderMenu(
            new Ability<PossibleAbilities>([
                { action: 'create', subject: 'DataApp' },
            ]),
        );

        await userEvent.click(
            screen.getByRole('button', { name: 'Add chart type' }),
        );
        await userEvent.click(
            await screen.findByRole('menuitem', {
                name: /Browse the Lightdash library/,
            }),
        );
        const libraryDialog = await screen.findByRole('dialog');
        await userEvent.click(
            within(libraryDialog).getByText('Ranked bars from the library'),
        );
        await userEvent.click(
            await screen.findByRole('button', { name: 'Install' }),
        );

        // The install lands selected and both modals get out of its way.
        await waitFor(() =>
            expect(mocks.selectProjectChartType).toHaveBeenCalledWith(
                installedChartType,
                itemsMap,
            ),
        );
        expect(mocks.selectProjectChartType).toHaveBeenCalledOnce();
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
    });
});
