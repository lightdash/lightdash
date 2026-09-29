import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import FilterMultiStringInput from './FilterMultiStringInput';

describe('FilterMultiStringInput', () => {
    it('does not add a clear-all control', () => {
        const { container } = renderWithProviders(
            <FilterMultiStringInput
                values={['one', 'two']}
                onChange={vi.fn()}
            />,
        );

        expect(container.querySelectorAll('button')).toHaveLength(2);
    });

    it.each([
        {
            preserveWhitespace: false,
            input: ' new value ',
            expected: 'new value',
        },
        { preserveWhitespace: true, input: ' Pending ', expected: ' Pending ' },
        { preserveWhitespace: true, input: '  ', expected: '  ' },
    ])(
        'adds a custom value on Enter (preserve whitespace: $preserveWhitespace, value: "$input")',
        async ({ preserveWhitespace, input, expected }) => {
            const user = userEvent.setup();
            const onChange = vi.fn();

            renderWithProviders(
                <FilterMultiStringInput
                    values={[]}
                    onChange={onChange}
                    placeholder="Filter values"
                    preserveWhitespace={preserveWhitespace}
                />,
            );

            await user.type(screen.getByRole('textbox'), `${input}{Enter}`);

            expect(onChange).toHaveBeenCalledWith([expected]);
        },
    );

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
    it('preserves whitespace and empty pasted tokens for bounded filters', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        renderWithProviders(
            <FilterMultiStringInput
                values={[]}
                onChange={onChange}
                preserveWhitespace
            />,
        );
        fireEvent.paste(screen.getByRole('textbox'), {
            clipboardData: { getData: () => ' Pending ,Active,, ' },
        });
        await user.click(
            await screen.findByRole('button', { name: /multiple values/i }),
        );
        expect(onChange).toHaveBeenCalledWith([' Pending ', 'Active', '', ' ']);
    });
    it.each([true, false])(
        'respects single value mode when selecting suggestions (%s)',
        async (singleValue) => {
            const user = userEvent.setup();
            const onChange = vi.fn();
            renderWithProviders(
                <FilterMultiStringInput
                    values={['Pending']}
                    suggestions={['Pending', 'Active']}
                    singleValue={singleValue}
                    onChange={onChange}
                    preserveWhitespace
                />,
            );
            await user.click(screen.getByRole('textbox'));
            await user.click(screen.getByRole('option', { name: 'Active' }));
            expect(onChange).toHaveBeenCalledWith(
                singleValue ? ['Active'] : ['Pending', 'Active'],
            );
        },
    );

    it('replaces a single value with a typed value without trimming it', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        renderWithProviders(
            <FilterMultiStringInput
                values={['Pending']}
                singleValue
                preserveWhitespace
                onChange={onChange}
            />,
        );
        await user.type(screen.getByRole('textbox'), ' Other {Enter}');
        expect(onChange).toHaveBeenCalledWith([' Other ']);
    });

    it('retains only the last pasted value in single value mode', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        renderWithProviders(
            <FilterMultiStringInput
                values={['Pending']}
                singleValue
                preserveWhitespace
                onChange={onChange}
            />,
        );
        fireEvent.paste(screen.getByRole('textbox'), {
            clipboardData: { getData: () => 'Active, Other ' },
        });
        expect(onChange).not.toHaveBeenCalled();
        await user.click(
            await screen.findByRole('button', { name: /multiple values/i }),
        );
        expect(onChange).toHaveBeenCalledWith([' Other ']);
    });
});
