import { type ConnectionDiagnosticResult } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import ConnectionTestDiagnosis from './ConnectionTestDiagnosis';

const failedResult: ConnectionDiagnosticResult = {
    status: 'failed',
    checks: [
        {
            id: 'list_schemas',
            label: 'List schemas',
            status: 'failed',
            durationMs: 40,
            diagnosis: {
                title: "Role can't see any schemas",
                detail: 'Grant USAGE on the database.',
                remedySql: 'GRANT USAGE ON DATABASE ANALYTICS TO ROLE X;',
                docsUrl: 'https://docs.lightdash.com/grants',
            },
        },
    ],
};

describe('ConnectionTestDiagnosis', () => {
    it('renders the diagnosis, remedy and docs link', () => {
        renderWithProviders(
            <ConnectionTestDiagnosis
                result={failedResult}
                isRetrying={false}
                onRetry={vi.fn()}
            />,
        );
        expect(
            screen.getByText("Role can't see any schemas"),
        ).toBeInTheDocument();
        expect(
            screen.getByText('GRANT USAGE ON DATABASE ANALYTICS TO ROLE X;'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'View documentation' }),
        ).toHaveAttribute('href', 'https://docs.lightdash.com/grants');
    });

    it('calls onRetry when the retry button is clicked', () => {
        const onRetry = vi.fn();
        renderWithProviders(
            <ConnectionTestDiagnosis
                result={failedResult}
                isRetrying={false}
                onRetry={onRetry}
            />,
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'I ran it — retry' }),
        );
        expect(onRetry).toHaveBeenCalledTimes(1);
    });
});
