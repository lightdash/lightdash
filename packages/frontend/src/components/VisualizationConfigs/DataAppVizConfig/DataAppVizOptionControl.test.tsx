import { type DataAppVizConfigOption } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizOptionControl from './DataAppVizOptionControl';

const textOption: DataAppVizConfigOption = {
    name: 'title',
    label: 'Title',
    type: 'text',
    default: 'Untitled',
};

describe('DataAppVizOptionControl', () => {
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
});
