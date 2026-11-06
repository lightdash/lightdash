import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtifactPanelHeading } from './ArtifactPanelHeading';

const DESCRIPTION = 'Bars show new customers; the line shows the average.';

const renderHeading = (
    descriptionDisplay: 'expandable' | 'tooltip',
): ReturnType<typeof render> =>
    render(
        <MantineProvider env="test">
            <ArtifactPanelHeading
                title="Revenue per new customer"
                description={DESCRIPTION}
                marker={null}
                descriptionDisplay={descriptionDisplay}
            />
        </MantineProvider>,
    );

describe('ArtifactPanelHeading', () => {
    afterEach(() => vi.restoreAllMocks());

    it('expands a clamped description on click or Enter, without a visible toggle', () => {
        vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(
            80,
        );
        vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(
            40,
        );
        renderHeading('expandable');

        expect(screen.queryByText('Show more')).toBeNull();
        const description = screen.getByRole('button', { name: DESCRIPTION });
        expect(description).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(description);
        expect(description).toHaveAttribute('aria-expanded', 'true');
        fireEvent.keyDown(description, { key: 'Enter' });
        expect(description).toHaveAttribute('aria-expanded', 'false');
    });

    it('keeps a description that fits as plain text', () => {
        renderHeading('expandable');
        expect(screen.getByText(DESCRIPTION)).not.toHaveAttribute('role');
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('moves the description behind an info button in tooltip mode', () => {
        renderHeading('tooltip');
        expect(
            screen.getByRole('button', { name: 'Description' }),
        ).toBeInTheDocument();
        expect(screen.queryByText(DESCRIPTION)).toBeNull();
    });
});
