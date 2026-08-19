import { ChartType } from '@lightdash/common';
import { act, waitFor } from '@testing-library/react';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { ConfigTabs } from './CustomVisConfig';

type CustomChartTypeSectionProps = {
    onCreateNew: (() => void) | null;
};

const { locationSearch, navigate, sectionProps } = vi.hoisted(() => ({
    locationSearch: { current: '' },
    navigate: vi.fn(),
    sectionProps: [] as CustomChartTypeSectionProps[],
}));

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
        data: { enabled: featureFlag === 'enable-data-apps' },
    }),
}));
vi.mock('../../../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: vi.fn(),
}));
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

        renderWithProviders(<ConfigTabs />);

        await waitFor(() => expect(sectionProps.length).toBeGreaterThan(0));
        act(() => sectionProps[sectionProps.length - 1].onCreateNew?.());

        expect(navigate).toHaveBeenCalledWith({
            pathname: '/projects/project-1/chart-types/new',
            search: locationSearch.current,
        });
    });
});
