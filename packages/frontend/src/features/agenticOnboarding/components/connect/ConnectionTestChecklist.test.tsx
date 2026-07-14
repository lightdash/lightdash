import {
    type ConnectionCheck,
    type ConnectionDiagnosticResult,
} from '@lightdash/common';
import type * as Mantine8Hooks from '@mantine-8/hooks';
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import ConnectionTestChecklist from './ConnectionTestChecklist';

const { reducedMotionMock } = vi.hoisted(() => ({
    reducedMotionMock: vi.fn(() => true),
}));

vi.mock('@mantine-8/hooks', async () => {
    const actual =
        await vi.importActual<typeof Mantine8Hooks>('@mantine-8/hooks');
    return { ...actual, useReducedMotion: () => reducedMotionMock() };
});

beforeEach(() => {
    reducedMotionMock.mockReturnValue(true);
});

afterEach(() => {
    vi.useRealTimers();
});

const check = (
    id: ConnectionCheck['id'],
    label: string,
    status: ConnectionCheck['status'],
    durationMs: number | null = null,
    diagnosis: ConnectionCheck['diagnosis'] = null,
): ConnectionCheck => ({ id, label, status, durationMs, diagnosis });

const passedResult: ConnectionDiagnosticResult = {
    status: 'passed',
    checks: [
        check('resolve_host', 'Resolve host', 'passed', 12),
        check('open_connection', 'Open secure connection', 'passed', 40),
        check('authenticate', 'Authenticate', 'passed', 88),
        check('list_schemas', 'List schemas', 'passed', 55),
        check('select_1', 'Run select 1', 'passed', 9),
    ],
};

const failedResult: ConnectionDiagnosticResult = {
    status: 'failed',
    checks: [
        check('resolve_host', 'Resolve host', 'passed', 12),
        check('authenticate', 'Authenticate', 'failed', 30, {
            title: 'Authentication failed',
            detail: 'Bad credentials',
            remedySql: null,
            docsUrl: null,
        }),
        check('select_1', 'Run select 1', 'skipped', 100),
    ],
};

describe('ConnectionTestChecklist', () => {
    it('renders every check with a polite status region on success', () => {
        renderWithProviders(
            <ConnectionTestChecklist result={passedResult} isLoading={false} />,
        );
        expect(screen.getByText('Resolve host')).toBeInTheDocument();
        expect(screen.getByText('Run select 1')).toBeInTheDocument();
        const region = screen.getByRole('status');
        expect(region).toHaveAttribute('aria-live', 'polite');
    });

    it('announces failures assertively and stops at the failing check', () => {
        renderWithProviders(
            <ConnectionTestChecklist result={failedResult} isLoading={false} />,
        );
        const region = screen.getByRole('status');
        expect(region).toHaveAttribute('aria-live', 'assertive');
        expect(screen.getByText('Authenticate')).toBeInTheDocument();
        // The skipped check after the failure is rendered but not revealed,
        // so its duration is never shown.
        expect(screen.getByText('Run select 1')).toBeInTheDocument();
        expect(screen.queryByText('100ms')).not.toBeInTheDocument();
    });

    it('renders the default checks while loading', () => {
        renderWithProviders(
            <ConnectionTestChecklist result={null} isLoading={true} />,
        );
        expect(screen.getByText('Resolve host')).toBeInTheDocument();
        expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('holds only the first stage running while loading (no walking pointer)', () => {
        vi.useFakeTimers();
        const { container } = renderWithProviders(
            <ConnectionTestChecklist
                result={null}
                isLoading={true}
                expectedChecks={[
                    { id: 'open_connection', label: 'Open secure connection' },
                    { id: 'authenticate', label: 'Authenticate' },
                    { id: 'use_warehouse', label: 'Use warehouse' },
                ]}
            />,
        );
        const runningIndexes = () =>
            Array.from(
                container.querySelectorAll('[class*="Timeline-itemBullet"]'),
            )
                .map((bullet, index) =>
                    bullet.querySelector('[class*="Loader"]') ? index : -1,
                )
                .filter((index) => index >= 0);

        expect(runningIndexes()).toEqual([0]);
        // Time passing must NOT advance the running stage down the list.
        void act(() => vi.advanceTimersByTime(3000));
        expect(runningIndexes()).toEqual([0]);
    });

    it('renders the provided expectedChecks labels while loading', () => {
        renderWithProviders(
            <ConnectionTestChecklist
                result={null}
                isLoading={true}
                expectedChecks={[
                    { id: 'open_connection', label: 'Open secure connection' },
                    { id: 'use_warehouse', label: 'Use warehouse' },
                    { id: 'use_database', label: 'Use database' },
                ]}
            />,
        );
        expect(screen.getByText('Use warehouse')).toBeInTheDocument();
        expect(screen.getByText('Use database')).toBeInTheDocument();
        // The connection-test defaults must not leak into validation loading.
        expect(screen.queryByText('Resolve host')).not.toBeInTheDocument();
    });

    it('replays each check as running for a delay scaled to its duration', () => {
        reducedMotionMock.mockReturnValue(false);
        vi.useFakeTimers();
        const scaledResult: ConnectionDiagnosticResult = {
            status: 'passed',
            checks: [
                // 5000ms clamps to the 1200ms max reveal delay
                check(
                    'open_connection',
                    'Open secure connection',
                    'passed',
                    5000,
                ),
                // 30ms clamps up to the 250ms min reveal delay
                check('authenticate', 'Authenticate', 'passed', 30),
            ],
        };
        renderWithProviders(
            <ConnectionTestChecklist result={scaledResult} isLoading={false} />,
        );

        // Nothing revealed before the first (clamped-max) delay elapses.
        void act(() => vi.advanceTimersByTime(1000));
        expect(screen.queryByText('5.0s')).not.toBeInTheDocument();

        // First check flips to its real duration once its 1200ms passes.
        void act(() => vi.advanceTimersByTime(300));
        expect(screen.getByText('5.0s')).toBeInTheDocument();
        expect(screen.queryByText('30ms')).not.toBeInTheDocument();

        // Second check reveals after its own (clamped-min) 250ms delay.
        void act(() => vi.advanceTimersByTime(250));
        expect(screen.getByText('30ms')).toBeInTheDocument();
    });
});
