import { ChartType } from '@lightdash/common';
import { act, screen, waitFor } from '@testing-library/react';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { ChartGalleryContext } from '../../../common/ChartGallery/ChartGalleryContext';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { ConfigTabs } from './CustomVisConfig';

type CustomChartTypeSectionProps = {
    onCreateNew: (() => void) | null;
};

const { locationSearch, navigate, sectionProps, enabledFlags } = vi.hoisted(
    () => ({
        locationSearch: { current: '' },
        navigate: vi.fn(),
        sectionProps: [] as CustomChartTypeSectionProps[],
        enabledFlags: new Set<string>(['enable-data-apps']),
    }),
);
const aiAccessRestrictions = vi.hoisted(() => ({ enabled: false }));

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
vi.mock('../../../../hooks/useProject', () => ({
    useAiAccessRestrictions: () => ({ data: aiAccessRestrictions }),
}));
vi.mock('./components/CustomVisAi', () => ({
    GenerateVizWithAi: () => <button type="button">Generate with AI</button>,
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
        aiAccessRestrictions.enabled = false;
        locationSearch.current = '';
        navigate.mockClear();
        sectionProps.length = 0;
        enabledFlags.clear();
        enabledFlags.add('enable-data-apps');
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

    it('shows AI generation when restrictions are off', async () => {
        enabledFlags.add('ai-custom-viz');
        renderWithProviders(<ConfigTabs />);
        expect(
            await screen.findByRole('button', { name: 'Generate with AI' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(
                'AI chart generation is off under AI access restrictions.',
            ),
        ).not.toBeInTheDocument();
    });

    it('hides AI generation when restrictions are enabled', async () => {
        enabledFlags.add('ai-custom-viz');
        aiAccessRestrictions.enabled = true;
        renderWithProviders(<ConfigTabs />);
        expect(
            screen.queryByRole('button', { name: 'Generate with AI' }),
        ).not.toBeInTheDocument();
        expect(
            await screen.findByText(
                'AI chart generation is off under AI access restrictions.',
            ),
        ).toBeInTheDocument();
    });

    it('keeps the Explorer query when opening the chart type builder', async () => {
        locationSearch.current =
            '?create_saved_chart_version=serialized-query&fromSpace=space-1';

        renderWithProviders(<ConfigTabs />);

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
        );

        await waitFor(() =>
            expect(screen.queryByText('Vega-Lite JSON')).toBeInTheDocument(),
        );
        expect(sectionProps).toHaveLength(0);
    });

    it('shows the chart type section outside the gallery when data apps are enabled', async () => {
        renderWithProviders(<ConfigTabs />);

        await waitFor(() => expect(sectionProps.length).toBeGreaterThan(0));
    });
});
