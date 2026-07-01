// AppTemplatePicker.test.tsx
import { MantineProvider } from '@mantine-8/core';
import { fireEvent, render, screen } from '@testing-library/react';
import AppTemplatePicker from './AppTemplatePicker';

const setup = (
    selected: 'dashboard' | 'slideshow' | 'pdf' | 'custom' | null,
    onSelectedChange = vi.fn(),
) => {
    render(
        <MantineProvider>
            <AppTemplatePicker
                selected={selected}
                onSelectedChange={onSelectedChange}
            />
        </MantineProvider>,
    );
    return { onSelectedChange };
};

describe('AppTemplatePicker', () => {
    it('renders all four starting points and no Lets go button', () => {
        setup(null);
        expect(
            screen.getByRole('button', { name: /Dashboard/i }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /Slide Show/i }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /PDF Report/i }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /From scratch/i }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /Let's go/i }),
        ).not.toBeInTheDocument();
    });

    it('nothing is selected by default', () => {
        setup(null);
        expect(
            screen.queryByRole('button', { pressed: true }),
        ).not.toBeInTheDocument();
    });

    it('selecting a card reports the template', () => {
        const { onSelectedChange } = setup(null);
        fireEvent.click(screen.getByRole('button', { name: /Slide Show/i }));
        expect(onSelectedChange).toHaveBeenCalledWith('slideshow');
    });

    it('clicking the selected card deselects it', () => {
        const { onSelectedChange } = setup('dashboard');
        fireEvent.click(screen.getByRole('button', { name: /Dashboard/i }));
        expect(onSelectedChange).toHaveBeenCalledWith(null);
    });
});
