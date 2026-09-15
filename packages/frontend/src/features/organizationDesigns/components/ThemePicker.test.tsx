import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ThemePicker } from './ThemePicker';

vi.mock('../hooks/useOrganizationDesigns', () => ({
    useOrganizationDesigns: () => ({ data: [] }),
}));

const renderPicker = (
    props: Partial<React.ComponentProps<typeof ThemePicker>> = {},
) =>
    render(
        <MemoryRouter>
            <MantineProvider env="test">
                <ThemePicker value={null} onChange={vi.fn()} {...props} />
            </MantineProvider>
        </MemoryRouter>,
    );

describe('ThemePicker compact', () => {
    it('keeps the saved theme accessible in the mobile icon-only trigger', async () => {
        const onOpenedChange = vi.fn();
        renderPicker({
            compact: true,
            iconOnly: true,
            value: 'deleted-theme',
            fallbackLabel: 'Saved theme',
            opened: false,
            onOpenedChange,
        });
        const trigger = screen.getByRole('button', {
            name: 'Theme: Saved theme',
        });
        expect(trigger).toHaveTextContent('');
        expect(trigger).toHaveAttribute('data-selected', 'true');
        await userEvent.click(trigger);
        expect(onOpenedChange).toHaveBeenCalledWith(true);
    });

    it('opens the mobile icon-only picker without controlled state', async () => {
        renderPicker({ compact: true, iconOnly: true });
        await userEvent.click(
            screen.getByRole('button', { name: 'Apply theme' }),
        );
        expect(
            screen.getByRole('menuitem', { name: /^No theme/ }),
        ).toBeVisible();
    });

    it('shows the saved theme name when it is missing from the list', () => {
        renderPicker({
            compact: true,
            value: 'deleted-theme',
            fallbackLabel: 'Saved theme',
        });
        expect(
            screen.getByRole('button', { name: 'Theme: Saved theme' }),
        ).toBeInTheDocument();
    });

    it('allows an external control to open the standard theme menu', async () => {
        const onChange = vi.fn();
        const onOpenedChange = vi.fn();
        renderPicker({ compact: true, opened: true, onChange, onOpenedChange });
        await userEvent.click(
            screen.getByRole('menuitem', { name: /^No theme/ }),
        );
        expect(onChange).toHaveBeenCalledWith(null);
        expect(onOpenedChange).toHaveBeenCalledWith(false);
    });

    it('prevents selection when an open picker becomes disabled', async () => {
        const onChange = vi.fn();
        renderPicker({ compact: true, opened: true, disabled: true, onChange });
        const option = screen.getByRole('menuitem', { name: /^No theme/ });
        expect(option).toBeDisabled();
        await userEvent.click(option);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('collapses to an "Apply theme" call to action when none is selected', () => {
        renderPicker({ compact: true });
        const trigger = screen.getByRole('button', {
            name: /Apply theme/i,
        });
        expect(trigger).toBeInTheDocument();
        // Description line is suppressed in compact mode.
        expect(
            screen.queryByText(
                'No shared design assets - prompt any style you want',
            ),
        ).not.toBeInTheDocument();
    });
});
