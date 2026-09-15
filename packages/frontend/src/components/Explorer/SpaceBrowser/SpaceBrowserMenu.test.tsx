import { ActionIcon } from '@mantine/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../testing/testUtils';
import { SpaceBrowserMenu } from './SpaceBrowserMenu';

vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
}));

it('opens from the labeled keyboard target and invokes a space action', async () => {
    const user = userEvent.setup();
    const onShare = vi.fn();
    renderWithProviders(
        <SpaceBrowserMenu
            spaceUuid="space-uuid"
            isPinned={false}
            onShare={onShare}
            onRename={vi.fn()}
            onDelete={vi.fn()}
            onTogglePin={vi.fn()}
            onTransferToSpace={vi.fn()}
        >
            <ActionIcon aria-label="Space actions">⋯</ActionIcon>
        </SpaceBrowserMenu>,
    );

    const trigger = screen.getByRole('button', { name: 'Space actions' });
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.click(await screen.findByRole('menuitem', { name: 'Share' }));
    expect(onShare).toHaveBeenCalledOnce();
});
