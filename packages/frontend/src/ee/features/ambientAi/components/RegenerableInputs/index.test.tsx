import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RegenerableDescriptionInput, RegenerableNameInput } from '.';
import { renderWithProviders } from '../../../../../testing/testUtils';

const action = (overrides = {}) => ({
    label: 'Regenerate chart name',
    onClick: vi.fn(),
    loading: false,
    disabled: false,
    ...overrides,
});

describe('RegenerableNameInput', () => {
    it('is a plain labelled input without a regenerate action', () => {
        renderWithProviders(
            <RegenerableNameInput
                label="Chart name"
                value="Revenue"
                readOnly
            />,
        );
        expect(screen.getByRole('textbox', { name: 'Chart name' })).toHaveValue(
            'Revenue',
        );
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('regenerates from the button inside the input', () => {
        const regenerate = action();
        renderWithProviders(
            <RegenerableNameInput
                label="Chart name"
                value="Revenue"
                readOnly
                regenerate={regenerate}
            />,
        );
        // The button does not change the input's accessible name
        expect(
            screen.getByRole('textbox', { name: 'Chart name' }),
        ).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Regenerate chart name' }),
        );
        expect(regenerate.onClick).toHaveBeenCalledOnce();
    });

    it('lets the pointer reach the button inside the input', () => {
        renderWithProviders(
            <RegenerableNameInput
                label="Chart name"
                value="Revenue"
                readOnly
                regenerate={action()}
            />,
        );
        // Mantine's right section ignores the pointer unless told otherwise
        const wrapper = screen
            .getByRole('textbox', { name: 'Chart name' })
            .closest<HTMLElement>('.mantine-Input-wrapper');
        expect(
            wrapper?.style.getPropertyValue(
                '--input-right-section-pointer-events',
            ),
        ).toBe('all');
    });

    it('keeps the button visible while it is generating', () => {
        renderWithProviders(
            <RegenerableNameInput
                label="Chart name"
                value="Revenue"
                readOnly
                regenerate={action({ loading: true })}
            />,
        );
        expect(
            screen
                .getByRole('button', { name: 'Regenerate chart name' })
                .closest('[data-visible]'),
        ).not.toBeNull();
    });

    it('passes focus and blur through to the form', () => {
        const onFocus = vi.fn();
        const onBlur = vi.fn();
        renderWithProviders(
            <RegenerableNameInput
                label="Chart name"
                value="Revenue"
                readOnly
                onFocus={onFocus}
                onBlur={onBlur}
                regenerate={action()}
            />,
        );
        const input = screen.getByRole('textbox', { name: 'Chart name' });
        fireEvent.focus(input);
        fireEvent.blur(input);
        expect(onFocus).toHaveBeenCalledOnce();
        expect(onBlur).toHaveBeenCalledOnce();
    });
});

describe('RegenerableDescriptionInput', () => {
    it('is a plain textarea without a regenerate action', () => {
        renderWithProviders(
            <RegenerableDescriptionInput label="Chart description" />,
        );
        expect(
            screen.getByRole('textbox', { name: 'Chart description' }),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('regenerates from the button inside the textarea', () => {
        const regenerate = action({ label: 'Regenerate chart description' });
        renderWithProviders(
            <RegenerableDescriptionInput
                label="Chart description"
                regenerate={regenerate}
            />,
        );
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Regenerate chart description',
            }),
        );
        expect(regenerate.onClick).toHaveBeenCalledOnce();
    });
});
