import { type DataAppVizConfigOption } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { installFakeTimerBridge } from '../../../testing/fakeTimerBridge';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizOptionControl from './DataAppVizOptionControl';

const textOption: DataAppVizConfigOption = {
    name: 'title',
    label: 'Title',
    type: 'text',
    default: 'Untitled',
};

const paletteColorOption: DataAppVizConfigOption = {
    name: 'accent',
    label: 'Accent',
    type: 'paletteColor',
    default: 0,
};

describe('DataAppVizOptionControl', () => {
    let removeFakeTimerBridge: () => void;

    beforeAll(() => {
        removeFakeTimerBridge = installFakeTimerBridge();
    });

    afterAll(() => {
        removeFakeTimerBridge();
    });

    it('debounces text edits rather than pushing every keystroke', async () => {
        vi.useFakeTimers();
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onChange = vi.fn();

        renderWithProviders(
            <DataAppVizOptionControl
                option={textOption}
                value="Untitled"
                onChange={onChange}
            />,
        );

        await user.clear(screen.getByLabelText('Title'));
        await user.type(screen.getByLabelText('Title'), 'Revenue');

        expect(onChange).not.toHaveBeenCalledWith('Revenue');
        await vi.advanceTimersByTimeAsync(250);
        expect(onChange).toHaveBeenCalledWith('Revenue');

        vi.useRealTimers();
    });

    it('flushes a pending text edit when the control unmounts', async () => {
        vi.useFakeTimers();
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onChange = vi.fn();

        const { unmount } = renderWithProviders(
            <DataAppVizOptionControl
                option={textOption}
                value="Untitled"
                onChange={onChange}
            />,
        );

        await user.clear(screen.getByLabelText('Title'));
        await user.type(screen.getByLabelText('Title'), 'Revenue');
        expect(onChange).not.toHaveBeenCalledWith('Revenue');

        // Closing the config panel mid-edit must not silently drop the change.
        unmount();
        expect(onChange).toHaveBeenCalledWith('Revenue');

        vi.useRealTimers();
    });

    it('shows an externally changed value once the pending edit has landed', async () => {
        vi.useFakeTimers();
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onChange = vi.fn();

        const { rerender } = renderWithProviders(
            <DataAppVizOptionControl
                option={textOption}
                value="Untitled"
                onChange={onChange}
            />,
        );

        await user.clear(screen.getByLabelText('Title'));
        await user.type(screen.getByLabelText('Title'), 'Revenue');
        await vi.advanceTimersByTimeAsync(250);
        expect(onChange).toHaveBeenCalledWith('Revenue');

        // A landed draft must not go on masking what the caller stores next.
        rerender(
            <DataAppVizOptionControl
                option={textOption}
                value="Reset by the caller"
                onChange={onChange}
            />,
        );

        expect(screen.getByLabelText('Title')).toHaveValue(
            'Reset by the caller',
        );

        vi.useRealTimers();
    });

    it('falls back to the declared default when the stored value has the wrong shape', () => {
        const onChange = vi.fn();

        renderWithProviders(
            <DataAppVizOptionControl
                option={textOption}
                value={42}
                onChange={onChange}
            />,
        );

        expect(screen.getByLabelText('Title')).toHaveValue('Untitled');
    });

    it('shows wrapping accessible palette swatches and stores the selected position', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();

        renderWithProviders(
            <DataAppVizOptionControl
                option={paletteColorOption}
                value={0}
                colorPalette={['#111111', '#222222']}
                onChange={onChange}
            />,
        );

        await user.click(
            screen.getByRole('button', {
                name: 'Accent: palette colour 2, #222222',
            }),
        );

        expect(onChange).toHaveBeenCalledWith(1);
    });

    it('shows the first fallback swatch as selected when the stored position is outside the palette', () => {
        renderWithProviders(
            <DataAppVizOptionControl
                option={paletteColorOption}
                value={9}
                colorPalette={[]}
                onChange={vi.fn()}
            />,
        );

        expect(
            screen.getByRole('button', {
                name: 'Accent: palette colour 1, #5470c6, selected',
            }),
        ).toHaveAttribute('aria-pressed', 'true');
    });

    it('keeps the stored position when the palette changes and when the control reopens', () => {
        const { rerender, unmount } = renderWithProviders(
            <DataAppVizOptionControl
                option={paletteColorOption}
                value={1}
                colorPalette={['#111111', '#222222']}
                onChange={vi.fn()}
            />,
        );

        rerender(
            <DataAppVizOptionControl
                option={paletteColorOption}
                value={1}
                colorPalette={['#aaaaaa', '#bbbbbb']}
                onChange={vi.fn()}
            />,
        );
        expect(
            screen.getByRole('button', {
                name: 'Accent: palette colour 2, #bbbbbb, selected',
            }),
        ).toHaveAttribute('aria-pressed', 'true');

        unmount();
        renderWithProviders(
            <DataAppVizOptionControl
                option={paletteColorOption}
                value={1}
                colorPalette={['#aaaaaa', '#bbbbbb']}
                onChange={vi.fn()}
            />,
        );
        expect(
            screen.getByRole('button', {
                name: 'Accent: palette colour 2, #bbbbbb, selected',
            }),
        ).toHaveAttribute('aria-pressed', 'true');
    });
});
