import { Group } from '@mantine/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { RangeBoundInput } from './RangeBoundInput';

describe('RangeBoundInput', () => {
    it('switches between automatic bounds and custom decimal values', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const ControlledInput = () => {
            const [value, setValue] = useState<number | 'auto'>('auto');
            return (
                <Group>
                    <RangeBoundInput
                        label="Min value"
                        autoLabel="Min value in table"
                        value={value}
                        onChange={(nextValue) => {
                            setValue(nextValue);
                            onChange(nextValue);
                        }}
                    />
                </Group>
            );
        };
        renderWithProviders(<ControlledInput />);

        const input = screen.getByLabelText('Min value');
        expect(input).toBeDisabled();
        expect(input).toHaveAttribute('placeholder', 'Auto');
        await user.click(
            screen.getByRole('combobox', { name: 'Min value type' }),
        );
        await user.click(screen.getByRole('option', { name: 'Custom' }));
        expect(onChange).toHaveBeenLastCalledWith(0);
        expect(input).toBeEnabled();
        await user.clear(input);
        await user.type(input, '-12.5');
        expect(onChange).toHaveBeenLastCalledWith(-12.5);

        await user.click(
            screen.getByRole('combobox', { name: 'Min value type' }),
        );
        await user.click(
            screen.getByRole('option', { name: 'Min value in table' }),
        );
        expect(onChange).toHaveBeenLastCalledWith('auto');
        expect(input).toBeDisabled();
    });
});
