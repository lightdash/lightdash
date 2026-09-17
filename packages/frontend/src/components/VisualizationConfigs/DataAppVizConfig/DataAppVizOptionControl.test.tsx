import {
    ECHARTS_DEFAULT_COLORS,
    type DataAppVizConfigOption,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    afterAll,
    afterEach,
    beforeAll,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { installFakeTimerBridge } from '../../../testing/fakeTimerBridge';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizOptionControl from './DataAppVizOptionControl';

const textOption: DataAppVizConfigOption = {
    name: 'title',
    label: 'Title',
    type: 'text',
    default: 'Untitled',
};

const colorOption: DataAppVizConfigOption = {
    name: 'accent',
    label: 'Accent',
    type: 'color',
    default: '#abcdef',
};

describe('DataAppVizOptionControl', () => {
    let removeFakeTimerBridge: () => void;

    beforeAll(() => {
        removeFakeTimerBridge = installFakeTimerBridge();
    });

    afterAll(() => {
        removeFakeTimerBridge();
    });

    afterEach(() => {
        vi.useRealTimers();
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

    it('offers the active palette as swatches and stores the selected hex colour', async () => {
        vi.useFakeTimers();
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onChange = vi.fn();

        renderWithProviders(
            <DataAppVizOptionControl
                option={colorOption}
                value="#abcdef"
                colorPalette={['#111111', '#222222']}
                onChange={onChange}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Accent' }));
        expect(screen.getByRole('button', { name: '#111111' })).toBeVisible();
        await user.click(screen.getByRole('button', { name: '#222222' }));

        expect(onChange).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(250);
        expect(onChange).toHaveBeenCalledWith('#222222');
    });

    it('offers Lightdash default swatches when no palette is supplied', async () => {
        const user = userEvent.setup();

        renderWithProviders(
            <DataAppVizOptionControl
                option={colorOption}
                value="#abcdef"
                onChange={vi.fn()}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Accent' }));
        expect(
            screen.getByRole('button', { name: ECHARTS_DEFAULT_COLORS[0] }),
        ).toBeVisible();
    });

    it('updates palette choices without changing the saved hex colour', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const { rerender } = renderWithProviders(
            <DataAppVizOptionControl
                option={colorOption}
                value="#abcdef"
                colorPalette={['#111111', '#222222']}
                onChange={onChange}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Accent' }));
        expect(screen.getByRole('button', { name: '#222222' })).toBeVisible();

        rerender(
            <DataAppVizOptionControl
                option={colorOption}
                value="#abcdef"
                colorPalette={['#aaaaaa', '#bbbbbb']}
                onChange={onChange}
            />,
        );
        expect(screen.queryByRole('button', { name: '#222222' })).toBeNull();
        expect(screen.getByRole('button', { name: '#bbbbbb' })).toBeVisible();
        expect(screen.getByPlaceholderText(/Type in a custom HEX/)).toHaveValue(
            'abcdef',
        );
        expect(onChange).not.toHaveBeenCalled();
    });

    it('still accepts a custom hex colour outside the palette', async () => {
        vi.useFakeTimers();
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onChange = vi.fn();

        renderWithProviders(
            <DataAppVizOptionControl
                option={colorOption}
                value="#abcdef"
                colorPalette={['#111111', '#222222']}
                onChange={onChange}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Accent' }));
        const hexInput = screen.getByPlaceholderText(/Type in a custom HEX/);
        await user.clear(hexInput);
        await user.type(hexInput, 'a1b2c3');
        await vi.advanceTimersByTimeAsync(250);

        expect(onChange).toHaveBeenCalledWith('#a1b2c3');
    });
});
