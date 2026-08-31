import {
    FeatureFlags,
    type RegistryChartTypeListItem,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { defaultAbility } from '../../../providers/Ability/constants';
import { renderWithProviders } from '../../../testing/testUtils';
import { useRegistryChartTypes } from '../hooks/useRegistryChartTypes';
import ChartTypeLibrarySection from './ChartTypeLibrarySection';

vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));

vi.mock('../hooks/useRegistryChartTypes', () => ({
    useRegistryChartTypes: vi.fn(),
}));

// Matches AppProviderMock's default user fixture (mockUserResponse) —
// hardcoded rather than imported to avoid pulling in a __mocks__ file.
const DEFAULT_ORG_UUID = '172a2270-000f-42be-9c68-c4752c23ae51';
const PROJECT_UUID = 'project-1';

const mockedUseServerFeatureFlag = vi.mocked(useServerFeatureFlag);
const mockedUseRegistryChartTypes = vi.mocked(useRegistryChartTypes);

const setFlag = (enabled: boolean, isLoading = false) => {
    mockedUseServerFeatureFlag.mockReturnValue({
        data: isLoading
            ? undefined
            : { id: FeatureFlags.ChartTypeRegistry, enabled },
        isLoading,
    } as ReturnType<typeof useServerFeatureFlag>);
};

const makeItem = (
    overrides: Partial<RegistryChartTypeListItem>,
): RegistryChartTypeListItem => ({
    slug: 'radial-gauge',
    name: 'Radial gauge',
    description: 'A gauge for KPI progress',
    version: '1.0.0',
    publishedAt: '2026-06-30T00:00:00.000Z',
    tags: [],
    changelog: '',
    minLightdashVersion: null,
    vizSchema: {
        fields: [
            { name: 'value', label: 'Value', type: 'metric', required: true },
        ],
        configOptions: [],
        colorPalette: null,
    },
    thumbnail: null,
    screenshots: [],
    artifacts: {
        source: { path: 'source.zip', sha256: 'a'.repeat(64) },
        dist: { path: 'dist.zip', sha256: 'b'.repeat(64) },
    },
    state: 'not_installed',
    installedAppUuid: null,
    installedRegistryVersion: null,
    ...overrides,
});

const setRegistryData = (
    charts: RegistryChartTypeListItem[],
    overrides?: Record<string, unknown>,
) => {
    mockedUseRegistryChartTypes.mockReturnValue({
        data: { registryEnabled: true, charts },
        isInitialLoading: false,
        error: null,
        ...overrides,
    } as unknown as ReturnType<typeof useRegistryChartTypes>);
};

const renderSection = () =>
    renderWithProviders(<ChartTypeLibrarySection projectUuid={PROJECT_UUID} />);

describe('ChartTypeLibrarySection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        defaultAbility.update([]);
    });

    afterEach(() => {
        defaultAbility.update([]);
    });

    it('renders nothing when the feature flag is off', () => {
        setFlag(false);
        setRegistryData([makeItem({})]);
        renderSection();

        expect(
            screen.queryByText('Chart type library'),
        ).not.toBeInTheDocument();
    });

    it('renders nothing while the feature flag is still resolving', () => {
        setFlag(false, true);
        setRegistryData([makeItem({})]);
        renderSection();

        expect(
            screen.queryByText('Chart type library'),
        ).not.toBeInTheDocument();
    });

    it('renders nothing when the registry is not enabled for the org', () => {
        setFlag(true);
        setRegistryData([makeItem({})], {
            data: { registryEnabled: false, charts: [] },
        });
        renderSection();

        expect(
            screen.queryByText('Chart type library'),
        ).not.toBeInTheDocument();
    });

    it('shows the quiet offline state when the fetch fails with no cached data', () => {
        setFlag(true);
        mockedUseRegistryChartTypes.mockReturnValue({
            data: undefined,
            isInitialLoading: false,
            error: { name: 'Error', message: 'boom' },
        } as unknown as ReturnType<typeof useRegistryChartTypes>);
        renderSection();

        expect(screen.getByText('Chart type library')).toBeInTheDocument();
        expect(
            screen.getByText(
                'The chart type library is unavailable right now.',
            ),
        ).toBeInTheDocument();
    });

    it('keeps showing cached data through a background fetch error', () => {
        setFlag(true);
        setRegistryData([makeItem({})], {
            error: { name: 'Error', message: 'boom' },
        });
        renderSection();

        expect(screen.getByText('Radial gauge')).toBeInTheDocument();
        expect(
            screen.queryByText(
                'The chart type library is unavailable right now.',
            ),
        ).not.toBeInTheDocument();
    });

    it('renders cards with state badges for the happy path', () => {
        setFlag(true);
        setRegistryData([
            makeItem({ slug: 'a', name: 'Not installed chart' }),
            makeItem({
                slug: 'b',
                name: 'Installed chart',
                state: 'installed',
                installedAppUuid: 'app-1',
                installedRegistryVersion: '1.0.0',
            }),
            makeItem({
                slug: 'c',
                name: 'Update chart',
                state: 'update_available',
                installedAppUuid: 'app-2',
                installedRegistryVersion: '0.9.0',
            }),
            makeItem({
                slug: 'd',
                name: 'Incompatible chart',
                state: 'incompatible',
                minLightdashVersion: '99.0.0',
            }),
        ]);
        renderSection();

        expect(screen.getByText('Chart type library')).toBeInTheDocument();
        expect(screen.getByText('(4)')).toBeInTheDocument();
        expect(screen.getAllByText('Official')).toHaveLength(4);

        expect(screen.getByText('Not installed chart')).toBeInTheDocument();
        expect(screen.getByText('Installed chart')).toBeInTheDocument();
        expect(screen.getByText('Installed v1.0.0')).toBeInTheDocument();
        expect(screen.getByText('Update chart')).toBeInTheDocument();
        expect(screen.getByText('Update available')).toBeInTheDocument();
        expect(screen.getByText('Incompatible chart')).toBeInTheDocument();
        expect(
            screen.getByText('Requires newer Lightdash'),
        ).toBeInTheDocument();
    });

    it('opens the detail modal but hides Install without permission', async () => {
        setFlag(true);
        setRegistryData([makeItem({ slug: 'radial-gauge' })]);
        renderSection();

        fireEvent.click(screen.getByText('Radial gauge'));

        expect(screen.getAllByText('A gauge for KPI progress')).toHaveLength(2);
        // The Can check reads the async user query — findBy polls until it
        // resolves instead of racing the first render.
        expect(await screen.findByText('Cancel')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Install' }),
        ).not.toBeInTheDocument();
    });

    it('shows Install in the detail modal when the user can create data apps', async () => {
        defaultAbility.update([
            {
                action: 'create',
                subject: 'DataApp',
                conditions: {
                    organizationUuid: DEFAULT_ORG_UUID,
                    projectUuid: PROJECT_UUID,
                },
            },
        ]);
        setFlag(true);
        setRegistryData([makeItem({ slug: 'radial-gauge' })]);
        renderSection();

        fireEvent.click(screen.getByText('Radial gauge'));

        expect(
            await screen.findByRole('button', { name: 'Install' }),
        ).toBeInTheDocument();
    });
});
