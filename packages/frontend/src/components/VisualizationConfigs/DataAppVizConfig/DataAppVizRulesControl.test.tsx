import { type DataAppVizColorRule } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizRulesControl from './DataAppVizRulesControl';

describe('DataAppVizRulesControl', () => {
    it('adds and edits a rule, validates its range, then removes it', async () => {
        const user = userEvent.setup();
        const onRules = vi.fn();
        const StatefulRules = () => {
            const [rules, setRules] = useState<DataAppVizColorRule[]>([]);
            return (
                <DataAppVizRulesControl
                    value={rules}
                    colorPalette={['#222222', '#dddddd']}
                    onChange={(update) =>
                        setRules((current) => {
                            const next = update(current);
                            onRules(next);
                            return next;
                        })
                    }
                />
            );
        };
        renderWithProviders(<StatefulRules />);

        expect(screen.getByText(/Last matching rule wins/)).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Add rule' }));
        expect(onRules).toHaveBeenLastCalledWith([
            { enabled: true, color: '#222222', operator: 'gt', value: 0 },
        ]);

        await user.click(screen.getByRole('combobox', { name: 'Condition' }));
        await user.click(screen.getByRole('option', { name: 'Between' }));
        await user.clear(screen.getByRole('textbox', { name: 'Minimum' }));
        await user.type(screen.getByRole('textbox', { name: 'Minimum' }), '5');
        await user.clear(screen.getByRole('textbox', { name: 'Maximum' }));
        await user.type(screen.getByRole('textbox', { name: 'Maximum' }), '2');
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Minimum must be less than or equal to maximum.',
        );

        await user.click(screen.getByRole('switch', { name: 'Enabled' }));
        expect(onRules.mock.lastCall?.[0][0].enabled).toBe(false);
        await user.click(screen.getByRole('button', { name: 'Remove rule 1' }));
        expect(onRules).toHaveBeenLastCalledWith([]);
    });

    it('edits a fixed hex color independently of the palette', async () => {
        const user = userEvent.setup();
        const onRules = vi.fn();
        const StatefulRules = () => {
            const [rules, setRules] = useState<DataAppVizColorRule[]>([
                { enabled: true, color: '#ff0000', operator: 'eq', value: 10 },
            ]);
            return (
                <DataAppVizRulesControl
                    value={rules}
                    colorPalette={['#222222']}
                    onChange={(update) =>
                        setRules((current) => {
                            const next = update(current);
                            onRules(next);
                            return next;
                        })
                    }
                />
            );
        };
        renderWithProviders(<StatefulRules />);

        await user.click(screen.getByRole('button', { name: 'Rule color' }));
        expect(screen.getByPlaceholderText(/Type in a custom HEX/)).toHaveValue(
            'ff0000',
        );
        await user.click(screen.getByRole('button', { name: '#222222' }));
        expect(onRules.mock.lastCall?.[0][0].color).toBe('#222222');
    });

    it('does not carry an unfinished color edit to the next rule after removal', async () => {
        const user = userEvent.setup();
        const StatefulRules = () => {
            const [rules, setRules] = useState<DataAppVizColorRule[]>([
                { enabled: true, color: '#ff0000', operator: 'eq', value: 1 },
                { enabled: true, color: '#00ff00', operator: 'eq', value: 2 },
            ]);
            return (
                <DataAppVizRulesControl
                    value={rules}
                    colorPalette={['#222222']}
                    onChange={(update) => setRules(update)}
                />
            );
        };
        renderWithProviders(<StatefulRules />);

        await user.click(
            screen.getAllByRole('button', { name: 'Rule color' })[0],
        );
        const colorInput = screen.getByPlaceholderText(/Type in a custom HEX/);
        await user.clear(colorInput);
        await user.type(colorInput, 'bad');
        await user.click(screen.getByRole('button', { name: 'Remove rule 1' }));
        await user.click(screen.getByRole('button', { name: 'Rule color' }));
        expect(screen.getByPlaceholderText(/Type in a custom HEX/)).toHaveValue(
            '00ff00',
        );
    });
});
