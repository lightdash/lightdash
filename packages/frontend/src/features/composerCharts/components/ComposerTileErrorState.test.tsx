import { DEFAULT_UI_STRINGS } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../testing/testUtils';
import { ComposerTileErrorState } from './ComposerTileErrorState';

const TRACEBACK = [
    'run() raised: Traceback (most recent call last):',
    '  File "/work/runner.py", line 42, in run',
    '  File "/work/main.py", line 8, in <module>',
    'ValueError: Daily history is incomplete.',
    '',
].join('\n');

describe('ComposerTileErrorState', () => {
    it('shows the last line and keeps the traceback behind show details', async () => {
        renderWithProviders(
            <ComposerTileErrorState message={TRACEBACK} minimal={false} />,
        );

        expect(
            screen.getByText('ValueError: Daily history is incomplete.'),
        ).toBeInTheDocument();
        expect(screen.queryByText(/\/work\/main\.py/)).not.toBeInTheDocument();

        fireEvent.click(
            screen.getByRole('button', {
                name: DEFAULT_UI_STRINGS['tile.error.showDetails'],
            }),
        );

        expect(await screen.findByText(/\/work\/main\.py/)).toBeInTheDocument();
    });

    it('shows only the last line in the screenshot view', () => {
        renderWithProviders(
            <ComposerTileErrorState message={TRACEBACK} minimal />,
        );

        expect(
            screen.getByText('ValueError: Daily history is incomplete.'),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.queryByText(/\/work\//)).not.toBeInTheDocument();
    });

    it('offers no details for a one-line error', () => {
        renderWithProviders(
            <ComposerTileErrorState
                message="This chart has been deleted."
                minimal={false}
            />,
        );

        expect(
            screen.getByText('This chart has been deleted.'),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('falls back to a neutral message when the error is blank', () => {
        renderWithProviders(
            <ComposerTileErrorState message={'  \n '} minimal={false} />,
        );

        expect(
            screen.getByText(DEFAULT_UI_STRINGS['tile.error.couldNotLoad']),
        ).toBeInTheDocument();
    });
});
