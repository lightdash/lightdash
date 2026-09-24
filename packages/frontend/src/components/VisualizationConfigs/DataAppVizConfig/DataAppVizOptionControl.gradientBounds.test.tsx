import {
    type DataAppVizConfigOption,
    type DataAppVizOptionValue,
} from '@lightdash/common';
import { TextInput } from '@mantine/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
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

// Report each keystroke at once, so bound edits reach the control back to back.
vi.mock('../../common/Filters/FilterInputs/FilterNumberInput', () => ({
    default: ({
        label,
        value,
        disabled,
        onChange,
    }: {
        label: ReactNode;
        value: unknown;
        disabled?: boolean;
        onChange: (value: number | null) => void;
    }) => (
        <TextInput
            label={label}
            value={typeof value === 'number' ? String(value) : ''}
            disabled={disabled}
            onChange={(event) => {
                const text = event.currentTarget.value;
                onChange(text === '' ? null : Number(text));
            }}
        />
    ),
}));

const gradientOption: DataAppVizConfigOption = {
    name: 'scale',
    label: 'Scale',
    type: 'gradient',
    default: { colors: ['#000000', '#ffffff'], min: 'auto', max: 'auto' },
};

const saved = { colors: ['#000000', '#ffffff'], min: 0, max: 5 };

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

describe('gradient bounds', () => {
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

    it('drops a pending valid min once a later edit inverts the range', async () => {
        vi.useFakeTimers();
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onChange = vi.fn();
        renderGradient(saved, onChange);

        const minInput = screen.getByLabelText('Min value');
        await user.clear(minInput);
        await user.type(minInput, '10');
        await vi.advanceTimersByTimeAsync(250);

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Min value must not be above max value',
        );
        expect(screen.getByLabelText('Min value')).toHaveValue('10');
        expect(onChange).not.toHaveBeenCalled();
    });

    it('shows an externally changed value instead of the unsaved inverted edit', async () => {
        vi.useFakeTimers();
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onChange = vi.fn();
        const { rerender } = renderGradient(saved, onChange);

        const minInput = screen.getByLabelText('Min value');
        await user.clear(minInput);
        await user.type(minInput, '10');
        expect(await screen.findByRole('alert')).toBeInTheDocument();

        rerender(
            <DataAppVizOptionControl
                option={gradientOption}
                value={{ ...saved, min: 2 }}
                colorPalette={['#111111']}
                onChange={onChange}
            />,
        );

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Min value')).toHaveValue('2');
    });
});
