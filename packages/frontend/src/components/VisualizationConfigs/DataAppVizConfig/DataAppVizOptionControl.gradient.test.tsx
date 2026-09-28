import {
    type DataAppVizConfigOption,
    type DataAppVizOptionValue,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizOptionControl from './DataAppVizOptionControl';

const option: DataAppVizConfigOption = {
    name: 'scale',
    label: 'Colour scale',
    type: 'gradient',
    default: { colors: ['#000000', '#ffffff'], min: 'auto', max: 'auto' },
};

describe('gradient option', () => {
    it('edits stops and bounds independently and retains saved colours on palette changes', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const Control = ({ palette }: { palette: string[] }) => {
            const [value, setValue] = useState<DataAppVizOptionValue>(
                option.default,
            );
            return (
                <DataAppVizOptionControl
                    option={option}
                    value={value}
                    colorPalette={palette}
                    onChange={(next) => {
                        setValue(next);
                        onChange(next);
                    }}
                />
            );
        };
        const { rerender } = renderWithProviders(
            <Control palette={['#ff0000']} />,
        );
        await user.click(screen.getByRole('button', { name: 'Add color' }));
        expect(onChange).toHaveBeenLastCalledWith({
            colors: ['#000000', '#fab005', '#ffffff'],
            min: 'auto',
            max: 'auto',
        });
        await user.click(
            screen.getByRole('combobox', { name: 'Minimum type' }),
        );
        await user.click(screen.getByRole('option', { name: 'Custom' }));
        const input = screen.getByLabelText('Minimum');
        await user.clear(input);
        await user.type(input, '-12.5');
        expect(onChange).toHaveBeenLastCalledWith({
            colors: ['#000000', '#fab005', '#ffffff'],
            min: -12.5,
            max: 'auto',
        });
        expect(screen.getByLabelText('Maximum')).toBeDisabled();
        const count = onChange.mock.calls.length;
        rerender(<Control palette={['#00ff00']} />);
        expect(onChange).toHaveBeenCalledTimes(count);
        expect(input).toHaveValue('-12.5');
    });
    it('preserves every stop and custom bound while typing a custom hex colour', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const Control = () => {
            const [value, setValue] = useState<DataAppVizOptionValue>(
                option.default,
            );
            return (
                <DataAppVizOptionControl
                    option={option}
                    value={value}
                    colorPalette={['#ff0000']}
                    onChange={(next) => {
                        setValue(next);
                        onChange(next);
                    }}
                />
            );
        };
        renderWithProviders(<Control />);
        for (const [bound, value] of [
            ['Minimum', '-12.5'],
            ['Maximum', '87.5'],
        ]) {
            await user.click(
                screen.getByRole('combobox', {
                    name: `${bound} type`,
                }),
            );
            await user.click(screen.getByRole('option', { name: 'Custom' }));
            const input = screen.getByLabelText(bound);
            await user.clear(input);
            await user.type(input, value);
        }
        await user.click(screen.getByRole('button', { name: 'Add color' }));
        await user.click(screen.getByRole('button', { name: 'Low color' }));
        const hexInput = screen.getByPlaceholderText(
            /Type in a custom HEX\s+color/,
        );
        await user.clear(hexInput);
        await user.type(hexInput, '123');
        expect(onChange).toHaveBeenLastCalledWith({
            colors: ['#123', '#fab005', '#ffffff'],
            min: -12.5,
            max: 87.5,
        });
        expect(
            screen.getByRole('button', { name: 'Intermediate color' }),
        ).toBeInTheDocument();
        expect(screen.getByLabelText('Minimum')).toHaveValue('-12.5');
        expect(screen.getByLabelText('Maximum')).toHaveValue('87.5');
        await user.type(hexInput, 'abc');
        expect(onChange).toHaveBeenLastCalledWith({
            colors: ['#123abc', '#fab005', '#ffffff'],
            min: -12.5,
            max: 87.5,
        });
        expect(
            screen.getByRole('button', { name: 'Intermediate color' }),
        ).toBeInTheDocument();
        expect(screen.getByLabelText('Minimum')).toHaveValue('-12.5');
        expect(screen.getByLabelText('Maximum')).toHaveValue('87.5');
    });
});
