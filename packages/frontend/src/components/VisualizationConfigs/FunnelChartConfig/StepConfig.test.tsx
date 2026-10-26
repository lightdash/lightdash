import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { StepConfig } from './StepConfig';

describe('StepConfig label', () => {
    it('debounces typing and commits at once when focus leaves the input', () => {
        const onLabelChange = vi.fn();
        renderWithProviders(
            <StepConfig
                defaultColor="#111111"
                defaultLabel="Signed up"
                swatches={['#111111']}
                color={undefined}
                label={undefined}
                onColorChange={vi.fn()}
                onLabelChange={onLabelChange}
            />,
        );
        const input = screen.getByPlaceholderText('Signed up');

        fireEvent.change(input, { target: { value: 'Joined' } });
        expect(onLabelChange).not.toHaveBeenCalled();

        fireEvent.blur(input);
        expect(onLabelChange).toHaveBeenCalledTimes(1);
        expect(onLabelChange).toHaveBeenCalledWith('Signed up', 'Joined');
    });
});
