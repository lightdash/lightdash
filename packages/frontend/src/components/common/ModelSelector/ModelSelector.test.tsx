import { type AiModelOption } from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { ModelSelector } from './ModelSelector';

const modelOption = (name: string, displayName: string): AiModelOption => ({
    name,
    modelId: name,
    displayName,
    description: '',
    provider: 'anthropic',
    default: false,
    supportsReasoning: false,
    deprecated: false,
});

const agentModel = modelOption('agent-model', 'Agent Model');
const otherModel = modelOption('other-model', 'Other Model');
const models = [agentModel, otherModel];

const openMenu = async () => {
    await userEvent.click(screen.getByRole('button'));
    return within(await screen.findByRole('menu'));
};

describe('ModelSelector', () => {
    it('offers no way back to the agent default unless the composer opts in', async () => {
        renderWithProviders(
            <ModelSelector
                models={models}
                value="anthropic:agent-model"
                onChange={vi.fn()}
            />,
        );

        const menu = await openMenu();

        expect(
            menu.queryByRole('menuitem', { name: /Agent default/ }),
        ).not.toBeInTheDocument();
    });

    it('lists the agent default first with the model the agent resolves to', async () => {
        const onSelect = vi.fn();
        renderWithProviders(
            <ModelSelector
                models={models}
                value="anthropic:other-model"
                onChange={vi.fn()}
                agentDefault={{
                    model: agentModel,
                    isSelected: false,
                    onSelect,
                }}
            />,
        );

        const menu = await openMenu();
        const [first] = menu.getAllByRole('menuitem');

        expect(first).toHaveTextContent('Agent default · Agent Model');

        await userEvent.click(first);

        expect(onSelect).toHaveBeenCalledTimes(1);
    });
});
