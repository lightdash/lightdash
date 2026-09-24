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
                isWinner={false}
                tokens={null}
            />,
        );

        expect(screen.getByText('1.3s · 12.0s')).toBeVisible();
    });

    it('shows the battle medal and token counts', () => {
        renderWithProviders(
            <MessageTimingIndicator
                responseTiming={{
                    startedAt: '2026-09-22T10:00:00.000Z',
                    firstTokenAt: '2026-09-22T10:00:00.500Z',
                    finishedAt: '2026-09-22T10:00:00.900Z',
                }}
                isWinner
                tokens={{ agent: 0, jev: 9402 }}
            />,
        );

        expect(
            screen.getByText('🥇 500ms · 900ms · 0 agent · 9,402 JEV'),
        ).toBeVisible();
    });

    it('renders nothing without response timing', () => {
        renderWithProviders(
            <MessageTimingIndicator
                responseTiming={null}
                isWinner={false}
                tokens={null}
            />,
        );

        expect(screen.queryByText(/ · /)).not.toBeInTheDocument();
    });
});
