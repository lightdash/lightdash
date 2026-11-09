import { ChartType, FeatureFlags, LightdashMode } from '@lightdash/common';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChartStudioAvailable } from '../../../../features/chartTypes/hooks/useChartStudioAvailable';
import { renderWithProviders } from '../../../../testing/testUtils';
import { withVisualizationStore } from '../../../../testing/visualizationStore';
import { ChartGalleryContext } from '../../../common/ChartGallery/ChartGalleryContext';
import { ConfigTabs } from './CustomVisConfig';

const StoredConfigTabs = () => {
    const [Store] = useState(() =>
        withVisualizationStore(
            { type: ChartType.CUSTOM, config: { spec: {} } },
            { itemsMap: {} },
        ),
    );
    return (
        <Store>
            <ConfigTabs />
        </Store>
    );
};

const licensedAppMocks = {
    health: { license: { hasLicenseKey: true, valid: true } },
};

type CustomChartTypeSectionProps = {
    onCreateNew: (() => void) | null;
    onClear: (() => void) | null;
};

const {
    locationSearch,
    navigate,
    sectionProps,
    enabledFlags,
    savedChart,
    ambientAi,
} = vi.hoisted(() => ({
    locationSearch: { current: '' },
    navigate: vi.fn(),
    sectionProps: [] as CustomChartTypeSectionProps[],
    enabledFlags: new Set<string>(),
    ambientAi: { enabled: false },
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
vi.mock('../../../../ee/features/ambientAi/hooks/useAmbientAiEnabled', () => ({
    useAmbientAiEnabled: () => ambientAi.enabled,
}));
vi.mock('./components/CustomVisAi', () => ({
    GenerateVizWithAi: () => <div>Generate with AI</div>,
}));

describe('CustomVisConfig', () => {
    beforeEach(() => {
        locationSearch.current = '';
        navigate.mockClear();
        sectionProps.length = 0;
        enabledFlags.clear();
        ambientAi.enabled = false;
        savedChart.current = undefined;
        window.localStorage.clear();
        vi.mocked(useChartStudioAvailable).mockReturnValue(true);
    });

    it('keeps the Explorer query when opening the chart type builder', async () => {
        locationSearch.current =
            '?create_saved_chart_version=serialized-query&fromSpace=space-1';

        renderWithProviders(<StoredConfigTabs />, licensedAppMocks);

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
                <StoredConfigTabs />
            </ChartGalleryContext.Provider>,
            licensedAppMocks,
        );

        await waitFor(() =>
            expect(screen.queryByText('Vega-Lite JSON')).toBeInTheDocument(),
        );
        expect(sectionProps).toHaveLength(0);
    });

    it('shows the chart type section outside the gallery with data apps off when Chart Studio is available', async () => {
        renderWithProviders(<StoredConfigTabs />, licensedAppMocks);

        await waitFor(() => expect(sectionProps.length).toBeGreaterThan(0));
        expect(
            sectionProps[sectionProps.length - 1].onCreateNew,
        ).not.toBeNull();
    });

    it('offers no chart type creation without Chart Studio, even with data apps on', async () => {
        enabledFlags.add(FeatureFlags.EnableDataApps);
        vi.mocked(useChartStudioAvailable).mockReturnValue(false);
        renderWithProviders(<StoredConfigTabs />, licensedAppMocks);

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
            renderWithProviders(<StoredConfigTabs />, cloudMocks);

            expect(
                await screen.findByText('Try Chart Studio for custom charts'),
            ).toBeInTheDocument();
        });

        it('does not show the card when editing a saved chart', async () => {
            savedChart.current = { uuid: 'chart-1' };
            renderWithProviders(<StoredConfigTabs />, cloudMocks);

            await screen.findByText('Vega-Lite JSON');
            expect(
                screen.queryByText('Try Chart Studio for custom charts'),
            ).not.toBeInTheDocument();
        });

        it('does not show the card on self-hosted instances', async () => {
            renderWithProviders(<StoredConfigTabs />, selfHostedMocks);

            await screen.findByText('Vega-Lite JSON');
            expect(
                screen.queryByText('Try Chart Studio for custom charts'),
            ).not.toBeInTheDocument();
        });

        it('shows the card inside the Explorer chart sidebar', async () => {
            renderWithProviders(
                <ChartGalleryContext.Provider value={true}>
                    <StoredConfigTabs />
                </ChartGalleryContext.Provider>,
                cloudMocks,
            );

            expect(
                await screen.findByText('Try Chart Studio for custom charts'),
            ).toBeInTheDocument();
        });

        const dismissedKey =
            'chart-studio-vega-nudge-dismissed-b264d83a-9000-426a-85ec-3f9c20f368ce';

        it('remembers the dismissal for the user after closing the card', async () => {
            renderWithProviders(<StoredConfigTabs />, cloudMocks);
            await screen.findByText('Try Chart Studio for custom charts');

            fireEvent.click(screen.getByLabelText('Dismiss'));

            expect(
                screen.queryByText('Try Chart Studio for custom charts'),
            ).not.toBeInTheDocument();
            expect(window.localStorage.getItem(dismissedKey)).toBe('true');
        });

        it('does not show the card again once dismissed', async () => {
            window.localStorage.setItem(dismissedKey, 'true');
            renderWithProviders(<StoredConfigTabs />, cloudMocks);

            await screen.findByText('Vega-Lite JSON');
            await waitFor(() => expect(sectionProps.length).toBeGreaterThan(0));
            expect(
                screen.queryByText('Try Chart Studio for custom charts'),
            ).not.toBeInTheDocument();
        });

        it('opens the chart type builder with the Explorer query', async () => {
            locationSearch.current = '?create_saved_chart_version=serialized';
            renderWithProviders(<StoredConfigTabs />, cloudMocks);
            await screen.findByText('Try Chart Studio for custom charts');

            fireEvent.click(screen.getByText('Open Chart Studio'));

            expect(navigate).toHaveBeenCalledWith({
                pathname: '/projects/project-1/chart-studio/new',
                search: locationSearch.current,
            });
        });

        it('opens the gallery when the user cannot author chart types', async () => {
            vi.mocked(useChartStudioAvailable).mockReturnValue(false);
            renderWithProviders(<StoredConfigTabs />, cloudMocks);
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
            renderWithProviders(<StoredConfigTabs />, selfHostedMocks);

            expect(await screen.findByText(infoText)).toBeInTheDocument();
            fireEvent.click(screen.getByText('Open Chart Studio'));
            expect(navigate).toHaveBeenCalledWith(
                '/projects/project-1/chart-studio',
            );
            expect(
                screen.queryByText('Read the docs on Chart Studio here'),
            ).not.toBeInTheDocument();
        });

        it('links to the docs when Chart Studio cannot run here', async () => {
            vi.mocked(useChartStudioAvailable).mockReturnValue(false);
            renderWithProviders(<StoredConfigTabs />, {
                health: { mode: LightdashMode.DEFAULT },
            });

            expect(
                await screen.findByText(
                    /Want to build more complete custom charts/,
                ),
            ).toBeInTheDocument();
            expect(screen.queryByText(infoText)).not.toBeInTheDocument();
            expect(
                screen.getByText('Read the docs on Chart Studio here'),
            ).toHaveAttribute(
                'href',
                'https://docs.lightdash.com/guides/data-apps/visualizations',
            );
            expect(
                screen.queryByText('Open Chart Studio'),
            ).not.toBeInTheDocument();
        });

        it('yields to the dismissable card while that is showing', async () => {
            renderWithProviders(<StoredConfigTabs />, {
                health: {
                    mode: LightdashMode.CLOUD_BETA,
                    license: { hasLicenseKey: true, valid: true },
                },
            });

            await screen.findByText('Try Chart Studio for custom charts');
            expect(screen.queryByText(infoText)).not.toBeInTheDocument();

            fireEvent.click(screen.getByLabelText('Dismiss'));
            expect(screen.getByText(infoText)).toBeInTheDocument();
        });

        it('shows inside the Explorer chart sidebar', async () => {
            renderWithProviders(
                <ChartGalleryContext.Provider value={true}>
                    <StoredConfigTabs />
                </ChartGalleryContext.Provider>,
                selfHostedMocks,
            );

            expect(await screen.findByText(infoText)).toBeInTheDocument();
        });
    });

    it('offers AI generation when ambient AI is available', async () => {
        ambientAi.enabled = true;
        renderWithProviders(<StoredConfigTabs />, licensedAppMocks);

        await waitFor(() =>
            expect(screen.getByText('Generate with AI')).toBeInTheDocument(),
        );
    });

    it('hides AI generation when ambient AI is unavailable', async () => {
        renderWithProviders(<StoredConfigTabs />, licensedAppMocks);

        await waitFor(() =>
            expect(screen.queryByText('Vega-Lite JSON')).toBeInTheDocument(),
        );
        expect(screen.queryByText('Generate with AI')).not.toBeInTheDocument();
    });
});
