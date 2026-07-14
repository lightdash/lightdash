import { fireEvent, screen } from '@testing-library/react';
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
            <FilterMultiStringInput values={['existing']} onChange={onChange} />,
        );

        const input = screen.getByRole('textbox');
        await user.type(input, 'blurred value');
        await user.tab();

        expect(onChange).toHaveBeenCalledWith(['existing', 'blurred value']);
    });

    it('keeps case-distinct values (US and us)', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();

        renderWithProviders(
            <FilterMultiStringInput values={['US']} onChange={onChange} />,
        );

        await user.type(screen.getByRole('textbox'), 'us{Enter}');

        expect(onChange).toHaveBeenCalledWith(['US', 'us']);
    });

    it('does not commit a pasted CSV until the user chooses, then adds split values only', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();

        renderWithProviders(
            <FilterMultiStringInput values={[]} onChange={onChange} />,
        );

        const input = screen.getByRole('textbox');
        input.focus();
        fireEvent.paste(input, {
            clipboardData: { getData: () => 'US, us, GB' },
        });

        // The chooser is open and nothing is committed yet.
        expect(onChange).not.toHaveBeenCalled();

        await user.click(
            await screen.findByRole('button', { name: /multiple values/i }),
        );

        expect(onChange).toHaveBeenCalledWith(['US', 'us', 'GB']);
        // The raw CSV must never be committed as a single value.
        expect(onChange).not.toHaveBeenCalledWith(['US, us, GB']);
    });
});
