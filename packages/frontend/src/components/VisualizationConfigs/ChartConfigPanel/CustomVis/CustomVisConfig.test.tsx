import { ChartType, FeatureFlags, LightdashMode } from '@lightdash/common';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
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

const { locationSearch, navigate, sectionProps, enabledFlags, savedChart } =
    vi.hoisted(() => ({
        locationSearch: { current: '' },
        navigate: vi.fn(),
        sectionProps: [] as CustomChartTypeSectionProps[],
        enabledFlags: new Set<string>(),
        savedChart: { current: undefined as { uuid: string } | undefined },
    }));

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
vi.mock('../../../../features/explorer/store', () => ({
    selectSavedChart: () => undefined,
    useExplorerSelector: () => savedChart.current,
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
        enabledFlags.clear();
        savedChart.current = undefined;
        window.localStorage.clear();
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

    describe('Chart Studio nudge', () => {
        const cloudMocks = {
            health: {
                mode: LightdashMode.CLOUD_BETA,
                license: { hasLicenseKey: true, valid: true },
            },
        };
        const selfHostedMocks = {
            health: {
                mode: LightdashMode.DEFAULT,
                license: { hasLicenseKey: true, valid: true },
            },
        };

        it('shows the card on Cloud while creating a new chart', async () => {
            renderWithProviders(<ConfigTabs />, cloudMocks);

            expect(
                await screen.findByText('Try Chart Studio for custom charts'),
            ).toBeInTheDocument();
        });

        it('does not show the card when editing a saved chart', async () => {
            savedChart.current = { uuid: 'chart-1' };
            renderWithProviders(<ConfigTabs />, cloudMocks);

            await screen.findByText('Vega-Lite JSON');
            expect(
                screen.queryByText('Try Chart Studio for custom charts'),
            ).not.toBeInTheDocument();
        });

        it('does not show the card on self-hosted instances', async () => {
            renderWithProviders(<ConfigTabs />, selfHostedMocks);

            await screen.findByText('Vega-Lite JSON');
            expect(
                screen.queryByText('Try Chart Studio for custom charts'),
            ).not.toBeInTheDocument();
        });

        it('shows the card inside the Explorer chart sidebar', async () => {
            renderWithProviders(
                <ChartGalleryContext.Provider value={true}>
                    <ConfigTabs />
                </ChartGalleryContext.Provider>,
                cloudMocks,
            );

            expect(
                await screen.findByText('Try Chart Studio for custom charts'),
            ).toBeInTheDocument();
        });

        const dismissedKey =
            'chart-studio-vega-nudge-dismissed-b264d83a-9000-426a-85ec-3f9c20f368ce';

        it('remembers the dismissal for the user after continuing with Vega', async () => {
            renderWithProviders(<ConfigTabs />, cloudMocks);
            await screen.findByText('Try Chart Studio for custom charts');

            fireEvent.click(screen.getByText('Continue with Vega'));

            expect(
                screen.queryByText('Try Chart Studio for custom charts'),
            ).not.toBeInTheDocument();
            expect(window.localStorage.getItem(dismissedKey)).toBe('true');
        });

        it('does not show the card again once dismissed', async () => {
            window.localStorage.setItem(dismissedKey, 'true');
            renderWithProviders(<ConfigTabs />, cloudMocks);

            await screen.findByText('Vega-Lite JSON');
            await waitFor(() => expect(sectionProps.length).toBeGreaterThan(0));
            expect(
                screen.queryByText('Try Chart Studio for custom charts'),
            ).not.toBeInTheDocument();
        });

        it('opens the chart type builder with the Explorer query', async () => {
            locationSearch.current = '?create_saved_chart_version=serialized';
            renderWithProviders(<ConfigTabs />, cloudMocks);
            await screen.findByText('Try Chart Studio for custom charts');

            fireEvent.click(screen.getByText('Open Chart Studio'));

            expect(navigate).toHaveBeenCalledWith({
                pathname: '/projects/project-1/chart-studio/new',
                search: locationSearch.current,
            });
        });

        it('opens the gallery when the user cannot author chart types', async () => {
            vi.mocked(useChartStudioAvailable).mockReturnValue(false);
            renderWithProviders(<ConfigTabs />, cloudMocks);
            await screen.findByText('Try Chart Studio for custom charts');

            fireEvent.click(screen.getByText('Open Chart Studio'));

            expect(navigate).toHaveBeenCalledWith(
                '/projects/project-1/chart-studio',
            );
        });
    });

    describe('Chart Studio info callout', () => {
        const selfHostedMocks = {
            health: {
                mode: LightdashMode.DEFAULT,
                license: { hasLicenseKey: true, valid: true },
            },
        };
        const infoText = /Looking for more flexible custom charts/;

        it('links to Chart Studio when it is available', async () => {
            renderWithProviders(<ConfigTabs />, selfHostedMocks);

            expect(await screen.findByText(infoText)).toBeInTheDocument();
            fireEvent.click(screen.getByText('Open Chart Studio'));
            expect(navigate).toHaveBeenCalledWith(
                '/projects/project-1/chart-studio',
            );
            expect(screen.queryByText('Setup guide')).not.toBeInTheDocument();
        });

        it('links to the setup guide when Chart Studio cannot run here', async () => {
            vi.mocked(useChartStudioAvailable).mockReturnValue(false);
            renderWithProviders(<ConfigTabs />, {
                health: { mode: LightdashMode.DEFAULT },
            });

            expect(await screen.findByText(infoText)).toBeInTheDocument();
            expect(screen.getByText('Setup guide')).toHaveAttribute(
                'href',
                'https://docs.lightdash.com/guides/data-apps/self-hosting',
            );
            expect(
                screen.queryByText('Open Chart Studio'),
            ).not.toBeInTheDocument();
        });

        it('yields to the dismissable card while that is showing', async () => {
            renderWithProviders(<ConfigTabs />, {
                health: {
                    mode: LightdashMode.CLOUD_BETA,
                    license: { hasLicenseKey: true, valid: true },
                },
            });

            await screen.findByText('Try Chart Studio for custom charts');
            expect(screen.queryByText(infoText)).not.toBeInTheDocument();

            fireEvent.click(screen.getByText('Continue with Vega'));
            expect(screen.getByText(infoText)).toBeInTheDocument();
        });

        it('shows inside the Explorer chart sidebar', async () => {
            renderWithProviders(
                <ChartGalleryContext.Provider value={true}>
                    <ConfigTabs />
                </ChartGalleryContext.Provider>,
                selfHostedMocks,
            );

            expect(await screen.findByText(infoText)).toBeInTheDocument();
        });
    });
});
