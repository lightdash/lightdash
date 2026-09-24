import {
    ECHARTS_DEFAULT_COLORS,
    type DataAppVizConfigOption,
    type DataAppVizOptionValue,
} from '@lightdash/common';
import { screen, within } from '@testing-library/react';
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

const gradientOption: DataAppVizConfigOption = {
    name: 'scale',
    label: 'Scale',
    type: 'gradient',
    default: { colors: ['#000000', '#ffffff'], min: 'auto', max: 'auto' },
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

    describe('gradient', () => {
        const renderGradient = (
            value: DataAppVizOptionValue,
            onChange: (value: DataAppVizOptionValue) => void,
        ) =>
            renderWithProviders(
                <DataAppVizOptionControl
                    option={gradientOption}
                    value={value}
                    colorPalette={['#111111']}
                    onChange={onChange}
                />,
            );

        it('adds a fixed hex middle stop before the high colour', async () => {
            vi.useFakeTimers();
            const user = userEvent.setup({
                advanceTimers: vi.advanceTimersByTime,
            });
            const onChange = vi.fn();
            renderGradient(gradientOption.default, onChange);

            await user.click(
                screen.getByRole('button', { name: 'Add colour' }),
            );
            await vi.advanceTimersByTimeAsync(250);

            const [[saved]] = onChange.mock.calls;
            expect(saved.colors).toHaveLength(3);
            expect(saved.colors[0]).toBe('#000000');
            expect(saved.colors[1]).toMatch(/^#[0-9a-f]{6}$/);
            expect(saved.colors[2]).toBe('#ffffff');
        });

        it('removes a middle stop and stops adding at five', async () => {
            vi.useFakeTimers();
            const user = userEvent.setup({
                advanceTimers: vi.advanceTimersByTime,
            });
            const onChange = vi.fn();
            const colors = [
                '#000000',
                '#111111',
                '#222222',
                '#333333',
                '#ffffff',
            ];
            renderGradient({ colors, min: 'auto', max: 'auto' }, onChange);

            expect(
                screen.queryByRole('button', { name: 'Add colour' }),
            ).toBeNull();
            const stops = screen.getAllByRole('button', {
                name: 'Select color',
            });
            await user.hover(stops[2]);
            await user.click(
                screen.getByRole('button', { name: 'Remove colour' }),
            );
            await vi.advanceTimersByTimeAsync(250);

            expect(onChange).toHaveBeenCalledWith({
                colors: ['#000000', '#111111', '#333333', '#ffffff'],
                min: 'auto',
                max: 'auto',
            });
        });

        it('switches a bound between auto and a fixed number', async () => {
            vi.useFakeTimers();
            const user = userEvent.setup({
                advanceTimers: vi.advanceTimersByTime,
            });
            const onChange = vi.fn();
            const { rerender } = renderGradient(
                gradientOption.default,
                onChange,
            );

            expect(screen.getByLabelText('Max value')).toBeDisabled();
            const maxType = screen.getByLabelText('Max value type', {
                selector: 'input',
            });
            await user.click(maxType);
            const listbox = document.getElementById(
                maxType.getAttribute('aria-controls') ?? '',
            );
            if (!listbox) throw new Error('Max value type list not found');
            await user.click(
                within(listbox).getByRole('option', {
                    name: 'Custom',
                    hidden: true,
                }),
            );
            await vi.advanceTimersByTimeAsync(250);
            expect(onChange).toHaveBeenLastCalledWith({
                colors: ['#000000', '#ffffff'],
                min: 'auto',
                max: 0,
            });

            rerender(
                <DataAppVizOptionControl
                    option={gradientOption}
                    value={{ ...gradientOption.default, max: 0 }}
                    colorPalette={['#111111']}
                    onChange={onChange}
                />,
            );
            const maxInput = screen.getByLabelText('Max value');
            await user.clear(maxInput);
            await user.type(maxInput, '250');
            await vi.advanceTimersByTimeAsync(600);
            expect(onChange).toHaveBeenLastCalledWith({
                colors: ['#000000', '#ffffff'],
                min: 'auto',
                max: 250,
            });
        });

        it('flags a fixed min above the fixed max and keeps it unsaved', async () => {
            vi.useFakeTimers();
            const user = userEvent.setup({
                advanceTimers: vi.advanceTimersByTime,
            });
            const onChange = vi.fn();
            renderGradient(
                { colors: ['#000000', '#ffffff'], min: 0, max: 10 },
                onChange,
            );

            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            const minInput = screen.getByLabelText('Min value');
            await user.clear(minInput);
            await user.type(minInput, '20');
            await vi.advanceTimersByTimeAsync(600);

            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Min value must not be above max value',
            );
            expect(onChange).not.toHaveBeenCalledWith(
                expect.objectContaining({ min: 20 }),
            );
        });
    });
});
