import {
    type ConnectionCheck,
    type ConnectionDiagnosticResult,
} from '@lightdash/common';
import type * as Mantine8Hooks from '@mantine-8/hooks';
import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import ConnectionTestChecklist from './ConnectionTestChecklist';

vi.mock('@mantine-8/hooks', async () => {
    const actual =
        await vi.importActual<typeof Mantine8Hooks>('@mantine-8/hooks');
    return { ...actual, useReducedMotion: () => true };
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

    it('shows a running placeholder progression while loading', () => {
        renderWithProviders(
            <ConnectionTestChecklist result={null} isLoading={true} />,
        );
        expect(screen.getByText('Resolve host')).toBeInTheDocument();
        expect(screen.getByRole('status')).toBeInTheDocument();
    });
});
