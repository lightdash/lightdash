// AppTemplatePicker.test.tsx
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import AppTemplatePicker from './AppTemplatePicker';
import classes from './AppTemplatePicker.module.css';

const setup = (
    selected:
        | 'dashboard'
        | 'slideshow'
        | 'pdf'
        | 'custom'
        | 'data_app_viz'
        | null,
    onSelectedChange = vi.fn(),
) => {
    render(
        <MantineProvider env="test">
            <AppTemplatePicker
                selected={selected}
                onSelectedChange={onSelectedChange}
            />
        </MantineProvider>,
    );
    return { onSelectedChange };
};

describe('AppTemplatePicker', () => {
    it('renders the app starting points, no viz template, no Lets go button', () => {
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
        // Vizs (custom chart types) are created from Explorer, not here.
        expect(
            screen.queryByRole('button', { name: /Data app visualization/i }),
        ).not.toBeInTheDocument();
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

    it('selecting From scratch reports the custom template', () => {
        const { onSelectedChange } = setup(null);
        fireEvent.click(screen.getByRole('button', { name: /From scratch/i }));
        expect(onSelectedChange).toHaveBeenCalledWith('custom');
    });

    it('keeps the card layout class on each button', () => {
        setup(null);
        expect(screen.getByRole('button', { name: /Dashboard/i })).toHaveClass(
            classes.card,
        );
    });

    it('clicking the selected card deselects it', () => {
        const { onSelectedChange } = setup('dashboard');
        fireEvent.click(screen.getByRole('button', { name: /Dashboard/i }));
        expect(onSelectedChange).toHaveBeenCalledWith(null);
    });
});
