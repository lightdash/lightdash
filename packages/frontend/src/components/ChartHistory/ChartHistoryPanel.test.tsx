import { Ability } from '@casl/ability';
import { type PossibleAbilities } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { AbilityContext } from '../../providers/Ability/context';
import {
    manageChartRule,
    mockSavedChartResponse,
} from '../../testing/savedChartResponse.mock';
import { renderWithProviders } from '../../testing/testUtils';
import ChartHistoryPanel from './ChartHistoryPanel';

vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));

// The Explorer is out of scope here; a probe exposes what the preview session
// was built from, so the test can see the version's own palette and parameters.
vi.mock('../Explorer', async () => {
    const {
        selectParameterReferences,
        selectUnsavedColorPaletteUuid,
        useExplorerSelector,
    } = await import('../../features/explorer/store');
    const PreviewSessionProbe = () => {
        const colorPaletteUuid = useExplorerSelector(
            selectUnsavedColorPaletteUuid,
        );
        const parameterReferences = useExplorerSelector(
            selectParameterReferences,
        );
        return (
            <div data-testid="preview-session">
                {colorPaletteUuid}|{parameterReferences?.join(',')}
            </div>
        );
    };
    return { default: PreviewSessionProbe };
});

vi.mock('../../hooks/useExplorerQueryEffects', () => ({
    useExplorerQueryEffects: vi.fn(),
}));

vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: vi.fn(),
        showToastError: vi.fn(),
        showToastApiError: vi.fn(),
    }),
}));

const chart = mockSavedChartResponse();

// The version differs from the chart as it is now: its own palette and
// parameters are what the preview must render with.
const versionChart = mockSavedChartResponse({
    colorPaletteUuid: 'version-palette-uuid',
    parameters: { region: 'EU' },
});

const restoredChart = { ...chart, name: 'Revenue (restored)' };

const versionOf = (versionUuid: string, createdAt: string) => ({
    chartUuid: chart.uuid,
    versionUuid,
    createdAt: new Date(createdAt),
    createdBy: {
        userUuid: 'user-uuid',
        firstName: 'Ada',
        lastName: 'Lovelace',
    },
});

const manageChartAbility = new Ability<PossibleAbilities>([manageChartRule]);

describe('ChartHistoryPanel', () => {
    beforeEach(() => {
        vi.mocked(lightdashApi).mockImplementation((async ({ url, method }) => {
            if (method === 'GET' && url === '/saved/chart-uuid/history') {
                return {
                    history: [
                        versionOf('current-version', '2026-09-10T10:00:00Z'),
                        versionOf('older-version', '2026-09-01T10:00:00Z'),
                    ],
                };
            }
            if (
                method === 'GET' &&
                url.startsWith('/saved/chart-uuid/version/')
            ) {
                return {
                    ...versionOf('older-version', '2026-09-01T10:00:00Z'),
                    chart: versionChart,
                };
            }
            if (
                method === 'POST' &&
                url === '/saved/chart-uuid/rollback/older-version'
            ) {
                return null;
            }
            if (
                method === 'GET' &&
                url === '/projects/project-uuid/saved/chart-uuid'
            ) {
                return restoredChart;
            }
            return new Promise(() => {});
        }) as typeof lightdashApi);
    });

    it('restores an older version, warns about unsaved edits, and hands back the saved chart', async () => {
        const user = userEvent.setup();
        const onRestored = vi.fn();
        renderWithProviders(
            <MemoryRouter>
                <AbilityContext.Provider value={manageChartAbility}>
                    <ChartHistoryPanel
                        chart={chart}
                        projectUuid="project-uuid"
                        sidebarHeader={null}
                        hasUnsavedEdits
                        withContainerHeight={false}
                        onRestored={onRestored}
                    />
                </AbilityContext.Provider>
            </MemoryRouter>,
        );

        const versions = await screen.findAllByText(/Updated by:/);
        expect(versions).toHaveLength(2);
        await user.click(versions[1]);

        await user.click(
            await screen.findByRole('button', { name: 'Version actions' }),
        );
        await user.click(await screen.findByText('Restore this version'));

        expect(
            await screen.findByText(
                'Your unsaved edits in the chart editor will be discarded.',
            ),
        ).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Restore' }));

        await waitFor(() =>
            expect(onRestored).toHaveBeenCalledWith(restoredChart),
        );
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'POST',
                url: '/saved/chart-uuid/rollback/older-version',
            }),
        );
    });

    it('previews a version with its own colour palette and parameters', async () => {
        renderWithProviders(
            <MemoryRouter>
                <AbilityContext.Provider value={manageChartAbility}>
                    <ChartHistoryPanel
                        chart={chart}
                        projectUuid="project-uuid"
                        sidebarHeader={null}
                        hasUnsavedEdits={false}
                        withContainerHeight={false}
                        onRestored={vi.fn()}
                    />
                </AbilityContext.Provider>
            </MemoryRouter>,
        );

        await waitFor(() =>
            expect(screen.getByTestId('preview-session')).toHaveTextContent(
                'version-palette-uuid|region',
            ),
        );
    });
});
