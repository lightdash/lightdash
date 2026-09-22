import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { MessageTimingIndicator } from './MessageTimingIndicator';

describe('MessageTimingIndicator', () => {
    it('shows response timing by default', () => {
        renderWithProviders(
            <MessageTimingIndicator
                responseTiming={{
                    startedAt: '2026-09-22T10:00:00.000Z',
                    firstTokenAt: '2026-09-22T10:00:01.250Z',
                    finishedAt: '2026-09-22T10:00:12.000Z',
                }}
            />,
        );

        expect(screen.getByText('1.3s · 12.0s')).toBeVisible();
    });

    it('renders nothing without response timing', () => {
        renderWithProviders(<MessageTimingIndicator responseTiming={null} />);

        expect(screen.queryByText(/ · /)).not.toBeInTheDocument();
    });
});
