import { ChartType, FeatureFlags } from '@lightdash/common';
import { act, screen, waitFor } from '@testing-library/react';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChartStudioAvailable } from '../../../../features/chartTypes/hooks/useChartStudioAvailable';
import { renderWithProviders } from '../../../../testing/testUtils';
import { ChartGalleryContext } from '../../../common/ChartGallery/ChartGalleryContext';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { ConfigTabs } from './CustomVisConfig';

const licensedAppMocks = {
    health: { license: { hasLicenseKey: true, valid: true } },
};

type CustomChartTypeSectionProps = {
    onCreateNew: (() => void) | null;
    onClear: (() => void) | null;
};

const { locationSearch, navigate, sectionProps, enabledFlags } = vi.hoisted(
    () => ({
        locationSearch: { current: '' },
        navigate: vi.fn(),
        sectionProps: [] as CustomChartTypeSectionProps[],
        enabledFlags: new Set<string>(),
    }),
);

vi.mock('../../../../features/chartTypes/hooks/useChartStudioAvailable');
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useParams: () => ({ projectUuid: 'project-1' }),
    useLocation: () => ({ search: locationSearch.current }),
    useNavigate: () => navigate,
}));
vi.mock('../../../../features/apps/hooks/useCanCreateDataApp', () => ({
    useCanCreateDataApp: () => true,
}));
vi.mock('../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (featureFlag: string) => ({
        data: { enabled: enabledFlags.has(featureFlag) },
    }),
}));
vi.mock('../../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));
vi.mock('../../../LightdashVisualization/useVisualizationContext', () => {
    const useVisualizationContext = vi.fn();
    return {
        useVisualizationContext,
        useVisualizationServices: useVisualizationContext,
        useVisualizationLayout: useVisualizationContext,
        useVisualizationState: useVisualizationContext,
    };
});
vi.mock('../../CustomChartType/CustomChartTypeSection', () => ({
    default: (props: CustomChartTypeSectionProps) => {
        sectionProps.push(props);
        return null;
    },
}));
vi.mock('../../CustomChartType/useSelectProjectChartType', () => ({
    useCreateProjectChartType: () => vi.fn(),
    useSelectProjectChartType: () => vi.fn(),
}));
vi.mock('../../../MonacoEditor', () => ({
    default: () => null,
}));
vi.mock('./components/CustomVisTemplate', () => ({
    SelectTemplate: () => null,
}));

describe('CustomVisConfig', () => {
    beforeEach(() => {
        locationSearch.current = '';
        navigate.mockClear();
        sectionProps.length = 0;
        enabledFlags.clear();
        vi.mocked(useChartStudioAvailable).mockReturnValue(true);
        vi.mocked(useVisualizationContext).mockReturnValue({
            itemsMap: {},
            visualizationConfig: {
                chartType: ChartType.CUSTOM,
                chartConfig: {
                    validConfig: { spec: {} },
                    visSpec: '{}',
                    setVisSpec: vi.fn(),
                    series: [],
                    fields: [],
                },
            },
        } as unknown as ReturnType<typeof useVisualizationContext>);
    });

    it('keeps the Explorer query when opening the chart type builder', async () => {
        locationSearch.current =
            '?create_saved_chart_version=serialized-query&fromSpace=space-1';

        renderWithProviders(<ConfigTabs />, licensedAppMocks);

        await waitFor(() => expect(sectionProps.length).toBeGreaterThan(0));
        act(() => sectionProps[sectionProps.length - 1].onCreateNew?.());

        expect(navigate).toHaveBeenCalledWith({
            pathname: '/projects/project-1/chart-studio/new',
            search: locationSearch.current,
        });
    });

    it('hides the chart type section inside the chart gallery', async () => {
        renderWithProviders(
            <ChartGalleryContext.Provider value={true}>
                <ConfigTabs />
            </ChartGalleryContext.Provider>,
            licensedAppMocks,
        );

        await waitFor(() =>
            expect(screen.queryByText('Vega-Lite JSON')).toBeInTheDocument(),
        );
        expect(sectionProps).toHaveLength(0);
    });

    it('shows the chart type section outside the gallery with data apps off when Chart Studio is available', async () => {
        renderWithProviders(<ConfigTabs />, licensedAppMocks);

        await waitFor(() => expect(sectionProps.length).toBeGreaterThan(0));
        expect(
            sectionProps[sectionProps.length - 1].onCreateNew,
        ).not.toBeNull();
    });

    it('offers no chart type creation without Chart Studio, even with data apps on', async () => {
        enabledFlags.add(FeatureFlags.EnableDataApps);
        vi.mocked(useChartStudioAvailable).mockReturnValue(false);
        renderWithProviders(<ConfigTabs />, licensedAppMocks);

        await waitFor(() => expect(sectionProps.length).toBeGreaterThan(0));
        const props = sectionProps[sectionProps.length - 1];
        expect(props.onCreateNew).toBeNull();
        expect(props.onClear).toBeNull();
    });
});
