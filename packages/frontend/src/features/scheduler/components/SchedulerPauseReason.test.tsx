import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { SchedulerPauseReason } from './SchedulerPauseReason';

describe('SchedulerPauseReason', () => {
    const reason = 'The destination spreadsheet could not be found.';

    it('explains why an automatic pause occurred and how to resume', () => {
        renderWithProviders(
            <SchedulerPauseReason
                scheduler={{
                    enabled: false,
                    automaticallyDisabledReason: reason,
                }}
            />,
        );
        const warning = screen.getByRole('alert', {
            name: 'Automatically paused',
        });
        expect(warning).toHaveTextContent(reason);
        expect(warning).toHaveTextContent('turn the schedule back on');
    });

    it('omits the warning for a manual pause and clears it when the schedule resumes', () => {
        const { rerender } = renderWithProviders(
            <SchedulerPauseReason scheduler={{ enabled: false }} />,
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        rerender(
            <SchedulerPauseReason
                scheduler={{
                    enabled: false,
                    automaticallyDisabledReason: reason,
                }}
            />,
        );
        expect(screen.getByRole('alert')).toBeInTheDocument();
        rerender(
            <SchedulerPauseReason
                scheduler={{
                    enabled: true,
                    automaticallyDisabledReason: reason,
                }}
            />,
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
