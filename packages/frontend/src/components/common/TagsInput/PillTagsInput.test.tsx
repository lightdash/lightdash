import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { PillTagsInput } from './PillTagsInput';

const ControlledInput = ({
    initialValue = [],
    ...props
}: { initialValue?: string[] } & Partial<
    React.ComponentProps<typeof PillTagsInput>
>) => {
    const [value, setValue] = useState<string[]>(initialValue);
    return (
        <PillTagsInput
            placeholder="add tags"
            {...props}
            value={value}
            onChange={(next) => {
                setValue(next);
                props.onChange?.(next);
            }}
        />
    );
};

const getField = () => screen.getByPlaceholderText('add tags');

describe('PillTagsInput', () => {
    it('adds a trimmed tag on Enter and clears the input', async () => {
        renderWithProviders(<ControlledInput />);
        await userEvent.type(getField(), '  hello  {Enter}');
        expect(screen.getByText('hello')).toBeInTheDocument();
        expect(getField()).toHaveValue('');
    });

    it('splits on splitChars as soon as the text contains one', async () => {
        renderWithProviders(<ControlledInput />);
        await userEvent.type(getField(), 'one,two,');
        expect(screen.getByText('one')).toBeInTheDocument();
        expect(screen.getByText('two')).toBeInTheDocument();
        expect(getField()).toHaveValue('');
    });

    it('rejects the whole batch and keeps the text when any tag is invalid', async () => {
        const onChange = vi.fn();
        renderWithProviders(
            <ControlledInput
                onChange={onChange}
                validate={(tag) => /^\d+$/.test(tag)}
            />,
        );
        await userEvent.type(getField(), '12abc{Enter}');
        expect(onChange).not.toHaveBeenCalled();
        expect(getField()).toHaveValue('12abc');
    });

    it('drops duplicates by default', async () => {
        renderWithProviders(<ControlledInput initialValue={['dup']} />);
        await userEvent.type(getField(), 'dup{Enter}');
        expect(screen.getAllByText('dup')).toHaveLength(1);
        expect(getField()).toHaveValue('');
    });

    it('removes the last tag on Backspace when the input is empty', async () => {
        renderWithProviders(<ControlledInput initialValue={['a', 'b']} />);
        await userEvent.type(getField(), '{Backspace}');
        expect(screen.queryByText('b')).not.toBeInTheDocument();
        expect(screen.getByText('a')).toBeInTheDocument();
    });

    it('adds pending text on blur by default', async () => {
        renderWithProviders(<ControlledInput />);
        await userEvent.type(getField(), 'pending');
        await userEvent.tab();
        expect(screen.getByText('pending')).toBeInTheDocument();
    });

    it('does not add pending text on blur when acceptValueOnBlur is false', async () => {
        renderWithProviders(<ControlledInput acceptValueOnBlur={false} />);
        await userEvent.type(getField(), 'pending');
        await userEvent.tab();
        expect(screen.queryByText('pending')).not.toBeInTheDocument();
    });

    it('clears everything via the clear button when clearable', async () => {
        const onChange = vi.fn();
        renderWithProviders(
            <ControlledInput
                initialValue={['a', 'b']}
                clearable
                onChange={onChange}
            />,
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Clear all' }),
        );
        expect(onChange).toHaveBeenCalledWith([]);
    });

    it('uses renderPill for custom pill rendering', () => {
        renderWithProviders(
            <ControlledInput
                initialValue={['x']}
                renderPill={({ value }) => (
                    <span data-testid="custom-pill">custom-{value}</span>
                )}
            />,
        );
        expect(screen.getByTestId('custom-pill')).toHaveTextContent('custom-x');
    });
});
