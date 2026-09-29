import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { GradientStopsEditor } from './GradientStopsEditor';

const ControlledEditor = () => {
    const [colors, setColors] = useState(['#000000', '#ffffff']);
    return (
        <GradientStopsEditor
            colors={colors}
            onAddColor={() =>
                setColors((current) => [
                    ...current.slice(0, -1),
                    '#fab005',
                    current[current.length - 1],
                ])
            }
            onRemoveColor={(index) =>
                setColors((current) => current.filter((_, i) => i !== index))
            }
            onColorChange={(index, color) =>
                setColors((current) =>
                    current.map((value, i) => (i === index ? color : value)),
                )
            }
        />
    );
};

describe('GradientStopsEditor', () => {
    it('adds up to five stops and removes only intermediate stops', async () => {
        const user = userEvent.setup();
        renderWithProviders(<ControlledEditor />);

        await user.hover(screen.getByRole('button', { name: 'Low color' }));
        expect(
            screen.queryByRole('button', { name: 'Remove color' }),
        ).toBeNull();
        await user.hover(screen.getByRole('button', { name: 'High color' }));
        expect(
            screen.queryByRole('button', { name: 'Remove color' }),
        ).toBeNull();

        for (let i = 0; i < 3; i += 1) {
            await user.click(screen.getByRole('button', { name: 'Add color' }));
        }
        expect(screen.queryByRole('button', { name: 'Add color' })).toBeNull();
        expect(
            screen.getAllByRole('button', { name: 'Intermediate color' }),
        ).toHaveLength(3);

        for (let i = 0; i < 3; i += 1) {
            await user.hover(
                screen.getAllByRole('button', {
                    name: 'Intermediate color',
                })[0],
            );
            await user.click(
                screen.getAllByRole('button', { name: 'Remove color' })[0],
            );
        }
        expect(
            screen.queryByRole('button', { name: 'Intermediate color' }),
        ).toBeNull();
        expect(
            screen.getByRole('button', { name: 'Low color' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'High color' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Add color' }),
        ).toBeInTheDocument();
    });

    it('supports adding and removing intermediate stops with the keyboard', async () => {
        const user = userEvent.setup();
        renderWithProviders(<ControlledEditor />);
        screen.getByRole('button', { name: 'Add color' }).focus();
        await user.keyboard('{Enter}');
        const intermediate = screen.getByRole('button', {
            name: 'Intermediate color',
        });
        intermediate.focus();
        await user.tab();
        expect(
            screen.getByRole('button', { name: 'Remove color' }),
        ).toHaveFocus();
        await user.keyboard('{Enter}');
        expect(
            screen.queryByRole('button', { name: 'Intermediate color' }),
        ).toBeNull();
    });

    it('retains custom hex editing through the existing color selector', async () => {
        const user = userEvent.setup();
        renderWithProviders(<ControlledEditor />);
        await user.click(screen.getByRole('button', { name: 'Low color' }));
        const input = screen.getByPlaceholderText(
            /Type in a custom HEX\s+color/,
        );
        await user.clear(input);
        await user.type(input, '123abc');
        expect(input).toHaveValue('123abc');
        await user.keyboard('{Escape}');
        await user.click(screen.getByRole('button', { name: 'Low color' }));
        expect(
            screen.getByPlaceholderText(/Type in a custom HEX\s+color/),
        ).toHaveValue('123abc');
    });
});
