import { rolePresets } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { RoleBuilder } from './RoleBuilder';

type OnSubmit = ComponentProps<typeof RoleBuilder>['onSubmit'];

const renderRoleBuilder = ({
    presets,
    onSubmit = vi.fn<OnSubmit>(),
}: {
    presets?: typeof rolePresets;
    onSubmit?: OnSubmit;
} = {}) => {
    render(
        <MemoryRouter>
            <MantineProvider env="test">
                <RoleBuilder
                    initialValues={{
                        name: '',
                        description: '',
                        level: 'project',
                        scopes: [],
                    }}
                    onSubmit={onSubmit}
                    isWorking={false}
                    mode="create"
                    presets={presets}
                />
            </MantineProvider>
        </MemoryRouter>,
    );

    return { onSubmit };
};

const selectPreset = async (title: string) => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('textbox', { name: 'Preset' }));
    await user.click(await screen.findByRole('option', { name: title }));
    return user;
};

describe('RoleBuilder presets', () => {
    it('does not render a preset picker unless presets are explicitly provided', () => {
        renderRoleBuilder();

        expect(
            screen.queryByRole('textbox', { name: 'Preset' }),
        ).not.toBeInTheDocument();
    });

    it('populates editable fields and submits the existing role payload', async () => {
        const onSubmit = vi.fn<OnSubmit>();
        renderRoleBuilder({ presets: rolePresets, onSubmit });

        const roleTypeLabel = screen.getByText('Role type');
        const presetInput = screen.getByRole('textbox', { name: 'Preset' });
        expect(
            roleTypeLabel.compareDocumentPosition(presetInput) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();

        const user = await selectPreset('SQL Runner user');

        expect(screen.getByRole('textbox', { name: /Role name/ })).toHaveValue(
            'SQL Runner user',
        );
        expect(
            screen.getByRole('textbox', { name: 'Description' }),
        ).toHaveValue(rolePresets[1].description);

        const roleName = screen.getByRole('textbox', { name: /Role name/ });
        await user.clear(roleName);
        await user.type(roleName, 'Warehouse analyst');

        await user.click(screen.getByRole('button', { name: 'Create role' }));

        await waitFor(() =>
            expect(onSubmit).toHaveBeenCalledWith({
                name: 'Warehouse analyst',
                description: rolePresets[1].description,
                level: 'project',
                scopes: [
                    'manage:SqlRunner',
                    'view:Project',
                    'create:Job',
                    'manage:CompileProject',
                ],
            }),
        );
    });

    it('clears seeded values when returning to Start from scratch', async () => {
        renderRoleBuilder({ presets: rolePresets });

        await selectPreset('SQL Runner user');
        await selectPreset('Start from scratch');

        expect(screen.getByRole('textbox', { name: /Role name/ })).toHaveValue(
            '',
        );
        expect(
            screen.getByRole('textbox', { name: 'Description' }),
        ).toHaveValue('');
    });

    it('only offers presets compatible with the selected role level', async () => {
        renderRoleBuilder({ presets: rolePresets });

        const user = userEvent.setup();
        await user.click(screen.getByRole('textbox', { name: 'Preset' }));
        expect(
            screen.queryByRole('option', { name: 'Roadmap viewer' }),
        ).not.toBeInTheDocument();
        await user.keyboard('{Escape}');

        await user.click(
            screen.getByRole('button', { name: /Organization role/ }),
        );
        await user.click(screen.getByRole('textbox', { name: 'Preset' }));

        expect(
            screen.queryByRole('option', { name: 'SQL Runner user' }),
        ).not.toBeInTheDocument();
        await user.click(
            await screen.findByRole('option', { name: 'Roadmap viewer' }),
        );
        await user.click(screen.getByRole('button', { name: /Project role/ }));

        expect(screen.getByRole('textbox', { name: 'Preset' })).toHaveValue(
            'Start from scratch',
        );
    });
});
