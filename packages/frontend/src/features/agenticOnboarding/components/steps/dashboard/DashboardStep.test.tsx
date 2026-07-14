import { type DashboardBuildResult } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import type * as ReactRouter from 'react-router';
import { vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { type OnboardingJobRunner } from '../../../hooks/useOnboardingJobRunner';
import DashboardStep from './DashboardStep';

const navigate = vi.fn();
const retry = vi.fn();

let runnerValue: OnboardingJobRunner<DashboardBuildResult>;

vi.mock('react-router', async () => {
    const actual = await vi.importActual<typeof ReactRouter>('react-router');
    return { ...actual, useNavigate: () => navigate };
});

vi.mock('../../../context/wizardContext', () => ({
    useOnboardingWizard: () => ({ projectUuid: 'project-1' }),
}));

vi.mock('../../../hooks/useOnboardingJobRunner', () => ({
    useOnboardingJobRunner: () => runnerValue,
}));

vi.mock('../../../hooks/useOnboardingAnalytics', () => ({
    useOnboardingAnalytics: () => ({
        trackCompleted: vi.fn(),
        trackFailed: vi.fn(),
    }),
}));

vi.mock('../../../hooks/useOnboardingState', () => ({
    patchOnboardingState: vi.fn().mockResolvedValue(undefined),
}));

const dashboardResult: DashboardBuildResult = {
    dashboardUuid: 'dash-1',
    dashboardSlug: 'starter',
    spaceUuid: 'space-1',
    chartCount: 4,
    warnings: [],
    builtAt: '2026-07-14T00:00:00.000Z',
};

const makeRunner = (
    overrides: Partial<OnboardingJobRunner<DashboardBuildResult>>,
): OnboardingJobRunner<DashboardBuildResult> => ({
    phase: 'polling',
    steps: [],
    checklistItems: [],
    result: null,
    errorMessage: null,
    retry,
    ...overrides,
});

describe('DashboardStep', () => {
    beforeEach(() => {
        navigate.mockReset();
        retry.mockReset();
    });

    it('navigates to the dashboard on open', () => {
        runnerValue = makeRunner({ phase: 'ready', result: dashboardResult });
        renderWithProviders(<DashboardStep />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Open my dashboard' }),
        );
        expect(navigate).toHaveBeenCalledWith(
            '/projects/project-1/dashboards/dash-1/view',
        );
    });

    it('renders an error state that retries', () => {
        runnerValue = makeRunner({
            phase: 'error',
            errorMessage: 'build failed',
        });
        renderWithProviders(<DashboardStep />);
        expect(screen.getByText('build failed')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(retry).toHaveBeenCalledTimes(1);
    });
});
