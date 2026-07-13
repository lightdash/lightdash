import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import FilterMultiStringInput from './FilterMultiStringInput';

describe('FilterMultiStringInput', () => {
    it('adds a custom value on Enter', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();

        renderWithProviders(
            <FilterMultiStringInput
                values={[]}
                onChange={onChange}
                placeholder="Filter values"
            />,
        );

        await user.type(screen.getByRole('textbox'), 'new value{Enter}');

        expect(onChange).toHaveBeenCalledWith(['new value']);
    });

    it('commits a custom value on blur', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();

        renderWithProviders(
            <FilterMultiStringInput
                values={['existing']}
                onChange={onChange}
            />,
        );

        const input = screen.getByRole('textbox');
        await user.type(input, 'blurred value');
        await user.tab();

        expect(onChange).toHaveBeenCalledWith(['existing', 'blurred value']);
    });
});
