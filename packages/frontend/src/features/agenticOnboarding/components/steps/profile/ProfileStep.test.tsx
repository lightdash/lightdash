import { DimensionType, type ProfileResult } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { type OnboardingJobRunner } from '../../../hooks/useOnboardingJobRunner';
import ProfileStep from './ProfileStep';

const goToProjectStep = vi.fn();
const clearWarehouse = vi.fn();
const retry = vi.fn();

let runnerValue: OnboardingJobRunner<ProfileResult>;

vi.mock('../../../context/wizardContext', () => ({
    useOnboardingWizard: () => ({
        projectUuid: 'project-1',
        goToProjectStep,
        clearWarehouse,
    }),
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

vi.mock('../../DemoHatch', () => ({
    __esModule: true,
    default: () => null,
}));

const profileResult: ProfileResult = {
    tables: [
        {
            database: 'DB',
            schema: 'JAFFLE',
            name: 'ORDERS',
            tableType: 'table',
            rowCount: 10,
            columns: [{ name: 'id', type: DimensionType.NUMBER }],
        },
    ],
    entities: [],
    relationships: [],
    truncated: false,
    profiledAt: '2026-07-14T00:00:00.000Z',
};

const makeRunner = (
    overrides: Partial<OnboardingJobRunner<ProfileResult>>,
): OnboardingJobRunner<ProfileResult> => ({
    phase: 'polling',
    steps: [],
    checklistItems: [],
    result: null,
    errorMessage: null,
    retry,
    ...overrides,
});

describe('ProfileStep', () => {
    beforeEach(() => {
        goToProjectStep.mockReset();
        retry.mockReset();
    });

    it('renders the live progress checklist while polling', () => {
        runnerValue = makeRunner({ phase: 'polling' });
        renderWithProviders(<ProfileStep />);
        expect(screen.getByText('Profiling your data')).toBeInTheDocument();
        expect(screen.getByText('Connecting')).toBeInTheDocument();
    });

    it('renders the result view when ready', () => {
        runnerValue = makeRunner({ phase: 'ready', result: profileResult });
        renderWithProviders(<ProfileStep />);
        expect(
            screen.getByText('Connected — profiling schema JAFFLE'),
        ).toBeInTheDocument();
    });

    it('renders the empty state when there are no tables', () => {
        runnerValue = makeRunner({
            phase: 'ready',
            result: { ...profileResult, tables: [] },
        });
        renderWithProviders(<ProfileStep />);
        expect(screen.getByText('No tables found')).toBeInTheDocument();
    });

    it('renders an error state that retries', () => {
        runnerValue = makeRunner({ phase: 'error', errorMessage: 'boom' });
        renderWithProviders(<ProfileStep />);
        expect(screen.getByText('boom')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(retry).toHaveBeenCalledTimes(1);
    });
});
