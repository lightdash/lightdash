import { ChartType, FeatureFlags, type DataAppViz } from '@lightdash/common';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createExplorerStore,
    explorerActions,
} from '../../../features/explorer/store';
import { renderWithProviders } from '../../../testing/testUtils';
import AddChartTypeMenu from './AddChartTypeMenu';

const { getVisualization } = vi.hoisted(() => ({
    getVisualization: vi.fn(),
}));

vi.mock('../../../features/chartTypes/hooks/useDataAppVisualization', () => ({
    getDataAppVisualization: getVisualization,
}));
vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (flag: FeatureFlags) => ({
        data: { enabled: flag === FeatureFlags.ChartTypeRegistry },
    }),
}));
vi.mock('../../../features/apps/hooks/useCanCreateDataApp', () => ({
    useCanCreateDataApp: () => false,
}));
vi.mock('../../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => ({ itemsMap: {} }),
}));
vi.mock(
    '../../../features/chartTypes/components/ChartTypeLibraryModal',
    () => ({
        default: ({ onInstalled }: { onInstalled: (uuid: string) => void }) => (
            <button onClick={() => onInstalled('installed-type')}>
                Install
            </button>
        ),
    }),
);

const installedType: DataAppViz = {
    dataAppVizUuid: 'installed-type',
    slug: 'installed-type',
    name: 'Installed type',
    description: '',
    projectUuid: 'project-uuid',
    spaceUuid: null,
    createdAt: new Date('2026-09-23'),
    createdByUserUuid: 'user-uuid',
    schema: {
        fields: [],
        configOptions: [],
        colorPalette: null,
    },
    icon: null,
    registrySlug: 'installed-type',
};

const startInstall = async () => {
    const response = Promise.withResolvers<DataAppViz>();
    getVisualization.mockReturnValue(response.promise);
    const store = createExplorerStore();
    const view = renderWithProviders(
        <Provider store={store}>
            <AddChartTypeMenu />
        </Provider>,
    );
    await userEvent.click(
        screen.getByRole('button', { name: 'Add chart type from the library' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Install' }));
    return {
        ...view,
        store,
        finish: () => act(async () => response.resolve(installedType)),
    };
};

describe('library install selection', () => {
    beforeEach(() => vi.clearAllMocks());

    it('selects the installed type when the chart is still unchanged', async () => {
        const { store, finish } = await startInstall();
        await finish();
        expect(
            store.getState().explorer.unsavedChartVersion.chartConfig,
        ).toEqual({
            type: ChartType.DATA_APP_VIZ,
            config: {
                dataAppVizUuid: installedType.dataAppVizUuid,
                fieldMapping: {},
                optionValues: {},
            },
        });
    });

    it('preserves the chart after leaving the picker before the response', async () => {
        const { store, finish, unmount } = await startInstall();
        const before = store.getState().explorer.unsavedChartVersion;
        unmount();
        await finish();
        expect(store.getState().explorer.unsavedChartVersion).toEqual(before);
    });

    it('preserves a newer selection and its configured options', async () => {
        const { store, finish } = await startInstall();
        act(() => {
            store.dispatch(
                explorerActions.setChartType({
                    chartType: ChartType.DATA_APP_VIZ,
                }),
            );
            store.dispatch(
                explorerActions.setChartConfig({
                    chartConfig: {
                        type: ChartType.DATA_APP_VIZ,
                        config: {
                            dataAppVizUuid: 'newer-choice',
                            fieldMapping: { value: 'orders_total' },
                            optionValues: { title: 'Keep me' },
                        },
                    },
                }),
            );
        });
        const before = store.getState().explorer.unsavedChartVersion;
        await finish();
        expect(store.getState().explorer.unsavedChartVersion).toEqual(before);
    });

    it('does not apply bindings captured before a query edit', async () => {
        const { store, finish } = await startInstall();
        act(() => {
            store.dispatch(explorerActions.setDimensions(['orders_status']));
        });
        const before = store.getState().explorer.unsavedChartVersion;
        await finish();
        expect(store.getState().explorer.unsavedChartVersion).toEqual(before);
    });
});
