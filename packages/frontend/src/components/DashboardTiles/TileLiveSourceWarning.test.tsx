import {
    LIVE_SOURCE_SOURCE_CUT_MESSAGE,
    type LiveSourceResultCompleteness,
    type QueryResultsMetadata,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import TileLiveSourceWarning from './TileLiveSourceWarning';

const metadata = (
    liveSourceCompleteness: LiveSourceResultCompleteness | null,
): QueryResultsMetadata => ({
    performance: {
        initialQueryExecutionMs: null,
        resultsPageExecutionMs: 1,
        queueTimeMs: null,
    },
    preAggregate: null,
    liveSourceCompleteness,
});

describe('TileLiveSourceWarning', () => {
    it('warns when the live data source cut the results', async () => {
        renderWithProviders(
            <TileLiveSourceWarning metadata={metadata('source_cut')} />,
        );

        await userEvent.hover(
            screen.getByRole('img', { name: 'Incomplete results' }),
        );

        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            LIVE_SOURCE_SOURCE_CUT_MESSAGE,
        );
    });

    it.each(['complete', 'own_limit', null] as const)(
        'shows nothing for %s',
        (completeness) => {
            renderWithProviders(
                <TileLiveSourceWarning metadata={metadata(completeness)} />,
            );

            expect(
                screen.queryByRole('img', { name: 'Incomplete results' }),
            ).not.toBeInTheDocument();
        },
    );
});
