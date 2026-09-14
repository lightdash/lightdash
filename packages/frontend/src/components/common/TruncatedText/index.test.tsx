import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TruncatedText from '.';
import { renderWithProviders } from '../../../testing/testUtils';

// jsdom has no layout, so the truncation detection never fires on its own.
vi.mock('../../../hooks/useIsTruncated', () => ({
    useIsTruncated: () => ({ ref: { current: null }, isTruncated: true }),
}));

const LONG_TEXT = 'a'.repeat(50);

describe('TruncatedText', () => {
    it('shows the full text in the tooltip by default', async () => {
        renderWithProviders(
            <TruncatedText maxWidth={100}>{LONG_TEXT}</TruncatedText>,
        );

        await userEvent.hover(screen.getByText(LONG_TEXT));

        expect(await screen.findByRole('tooltip')).toHaveTextContent(LONG_TEXT);
    });

    it('caps the tooltip label at tooltipMaxLength', async () => {
        renderWithProviders(
            <TruncatedText maxWidth={100} tooltipMaxLength={10}>
                {LONG_TEXT}
            </TruncatedText>,
        );

        await userEvent.hover(screen.getByText(LONG_TEXT));

        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            `${'a'.repeat(10)}…`,
        );
    });
});
