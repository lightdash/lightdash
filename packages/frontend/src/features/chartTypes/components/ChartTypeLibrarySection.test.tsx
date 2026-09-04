import {
    FeatureFlags,
    type RegistryChartTypeListItem,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { defaultAbility } from '../../../providers/Ability/constants';
import { renderWithProviders } from '../../../testing/testUtils';
import { useCanEditDataApp } from '../../apps/hooks/useCanEditDataApp';
import { useDeleteApp } from '../../apps/hooks/useDeleteApp';
import { useRegistryChartTypes } from '../hooks/useRegistryChartTypes';
import ChartTypeLibrarySection from './ChartTypeLibrarySection';

vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));

vi.mock('../hooks/useRegistryChartTypes', () => ({
    useRegistryChartTypes: vi.fn(),
}));

vi.mock('../../apps/hooks/useCanEditDataApp', () => ({
    useCanEditDataApp: vi.fn(),
}));

vi.mock('../../apps/hooks/useDeleteApp', () => ({
    useDeleteApp: vi.fn(),
}));

// Matches AppProviderMock's default user fixture (mockUserResponse) —
// hardcoded rather than imported to avoid pulling in a __mocks__ file.
const DEFAULT_ORG_UUID = '172a2270-000f-42be-9c68-c4752c23ae51';
const PROJECT_UUID = 'project-1';

const mockedUseServerFeatureFlag = vi.mocked(useServerFeatureFlag);
const mockedUseRegistryChartTypes = vi.mocked(useRegistryChartTypes);
const mockedUseCanEditDataApp = vi.mocked(useCanEditDataApp);
const mockedUseDeleteApp = vi.mocked(useDeleteApp);
const mockedDeleteAppMutateAsync = vi.fn();

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
    installedCreatedByUserUuid: null,
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
        mockedUseCanEditDataApp.mockReturnValue(false);
        mockedDeleteAppMutateAsync.mockResolvedValue(undefined);
        mockedUseDeleteApp.mockReturnValue({
            mutateAsync: mockedDeleteAppMutateAsync,
            isLoading: false,
        } as unknown as ReturnType<typeof useDeleteApp>);
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

    it('explains how library chart types become available to the organization', () => {
        setFlag(true);
        setRegistryData([makeItem({})]);

        renderWithProviders(
            <ChartTypeLibrarySection
                projectUuid={PROJECT_UUID}
                withHeader={false}
            />,
        );

        expect(
            screen.getByText(
                'These chart types are available to add to your instance. Once installed, they can be used by anyone building charts in your organization.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Chart type library'),
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
        // The installed chart is hidden from the library — installed tab only.
        expect(screen.getByText('(3)')).toBeInTheDocument();
        expect(screen.getAllByText('Official')).toHaveLength(3);

        expect(screen.getByText('Not installed chart')).toBeInTheDocument();
        expect(screen.queryByText('Installed chart')).not.toBeInTheDocument();
        expect(screen.getByText('Update chart')).toBeInTheDocument();
        expect(screen.getByText('Update available')).toBeInTheDocument();
        expect(screen.getByText('Incompatible chart')).toBeInTheDocument();
        expect(
            screen.getByText('Requires newer Lightdash'),
        ).toBeInTheDocument();
    });

    it('shows a beta badge only on beta-channel charts', () => {
        setFlag(true);
        setRegistryData([
            makeItem({ slug: 'a', name: 'Stable chart', channel: 'stable' }),
            makeItem({ slug: 'b', name: 'Untagged chart' }),
            makeItem({ slug: 'c', name: 'Beta chart', channel: 'beta' }),
        ]);
        renderSection();

        expect(screen.getByText('Beta chart')).toBeInTheDocument();
        expect(screen.getAllByText('Beta')).toHaveLength(1);
    });

    it('renders each card as a keyboard-focusable button', () => {
        setFlag(true);
        setRegistryData([makeItem({ slug: 'radial-gauge' })]);
        renderSection();

        expect(
            screen.getByRole('button', { name: /Radial gauge/ }),
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

    it('shows the incompatible explanation and disabled Install without gating on permission', async () => {
        // No defaultAbility grant — the informational incompatible footer
        // must still render for viewers who cannot create data apps.
        setFlag(true);
        setRegistryData([
            makeItem({
                slug: 'radial-gauge',
                state: 'incompatible',
                minLightdashVersion: '99.0.0',
            }),
        ]);
        renderSection();

        fireEvent.click(screen.getByText('Radial gauge'));

        // findBy (rather than getBy) still gives the async user query a
        // chance to resolve, to prove this isn't just a race that beat the
        // (now-absent) permission gate.
        expect(
            await screen.findByText('Requires Lightdash v99.0.0 or later'),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
    });

    it('hides installed chart types from the library list', () => {
        setFlag(true);
        setRegistryData([
            makeItem({ slug: 'a', name: 'Available chart' }),
            makeItem({
                slug: 'b',
                name: 'Installed chart',
                state: 'installed',
                installedAppUuid: 'app-1',
                installedRegistryVersion: '1.0.0',
            }),
        ]);
        renderSection();

        expect(screen.getByText('Available chart')).toBeInTheDocument();
        expect(screen.queryByText('Installed chart')).not.toBeInTheDocument();
        expect(screen.getByText('(1)')).toBeInTheDocument();
    });

    it('shows the all-installed empty state when every registry chart is installed', () => {
        setFlag(true);
        setRegistryData([
            makeItem({
                slug: 'radial-gauge',
                state: 'installed',
                installedAppUuid: 'app-1',
                installedRegistryVersion: '1.0.0',
            }),
        ]);
        renderSection();

        expect(
            screen.getByText(
                'Every chart type from the library is installed — find them in your installed charts.',
            ),
        ).toBeInTheDocument();
        expect(screen.getByText('(0)')).toBeInTheDocument();
    });

    it('hides Uninstall for the update_available state without manage permission', async () => {
        mockedUseCanEditDataApp.mockReturnValue(false);
        setFlag(true);
        setRegistryData([
            makeItem({
                slug: 'radial-gauge',
                state: 'update_available',
                installedAppUuid: 'app-1',
                installedRegistryVersion: '0.9.0',
            }),
        ]);
        renderSection();

        fireEvent.click(screen.getByText('Radial gauge'));

        // The modal meta panel proves the detail modal opened before
        // asserting on the absent button.
        expect(await screen.findByText('Published')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Uninstall' }),
        ).not.toBeInTheDocument();
    });

    it('shows Uninstall alongside Upgrade for the update_available state', async () => {
        mockedUseCanEditDataApp.mockReturnValue(true);
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
        setRegistryData([
            makeItem({
                slug: 'radial-gauge',
                state: 'update_available',
                installedAppUuid: 'app-1',
                installedRegistryVersion: '0.9.0',
            }),
        ]);
        renderSection();

        fireEvent.click(screen.getByText('Radial gauge'));

        expect(
            await screen.findByRole('button', { name: /Upgrade to v/ }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Uninstall' }),
        ).toBeInTheDocument();
    });

    it('confirms the uninstall modal and deletes the installed app', async () => {
        mockedUseCanEditDataApp.mockReturnValue(true);
        setFlag(true);
        setRegistryData([
            makeItem({
                slug: 'radial-gauge',
                state: 'update_available',
                installedAppUuid: 'app-1',
                installedRegistryVersion: '0.9.0',
            }),
        ]);
        renderSection();

        fireEvent.click(screen.getByText('Radial gauge'));
        fireEvent.click(
            await screen.findByRole('button', { name: 'Uninstall' }),
        );
        fireEvent.click(
            await screen.findByRole('button', { name: 'Uninstall chart type' }),
        );

        expect(mockedDeleteAppMutateAsync).toHaveBeenCalledWith({
            projectUuid: PROJECT_UUID,
            appUuid: 'app-1',
            successTitle: 'Chart type uninstalled',
        });
    });

    // useCanEditDataApp is mocked wholesale in this file (see the module mock
    // above), so the CASL self-rule itself isn't exercised here — this pins
    // that the real installing user is threaded through instead of a
    // hardcoded null, which is what the self-rule needs to key off of.
    it('threads the installed app creator through to the manage-permission check', async () => {
        mockedUseCanEditDataApp.mockReturnValue(true);
        setFlag(true);
        setRegistryData([
            makeItem({
                slug: 'radial-gauge',
                state: 'update_available',
                installedAppUuid: 'app-1',
                installedRegistryVersion: '0.9.0',
                installedCreatedByUserUuid: 'installer-user-uuid',
            }),
        ]);
        renderSection();

        fireEvent.click(screen.getByText('Radial gauge'));

        await screen.findByRole('button', { name: 'Uninstall' });
        expect(mockedUseCanEditDataApp).toHaveBeenCalledWith(PROJECT_UUID, {
            spaceUuid: null,
            createdByUserUuid: 'installer-user-uuid',
        });
    });
});
