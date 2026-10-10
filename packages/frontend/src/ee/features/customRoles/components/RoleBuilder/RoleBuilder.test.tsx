import {
    AGENT_CAPABILITY_DEFAULTS,
    AGENT_CAPABILITY_SCOPES,
    rolePresets,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleBuilder } from './RoleBuilder';

const flags = vi.hoisted(() => ({ enabled: false }));
vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: flags.enabled } }),
}));
beforeEach(() => {
    flags.enabled = false;
});

type OnSubmit = ComponentProps<typeof RoleBuilder>['onSubmit'];

const renderRoleBuilder = ({
    presets,
    onSubmit = vi.fn<OnSubmit>(),
    mode = 'create',
    scopes = [],
}: {
    presets?: typeof rolePresets;
    onSubmit?: OnSubmit;
    mode?: 'create' | 'edit';
    scopes?: string[];
} = {}) => {
    render(
        <MemoryRouter>
            <MantineProvider env="test">
                <RoleBuilder
                    initialValues={{
                        name: '',
                        description: '',
                        level: 'project',
                        scopes,
                    }}
                    onSubmit={onSubmit}
                    isWorking={false}
                    mode={mode}
                    presets={presets}
                />
            </MantineProvider>
        </MemoryRouter>,
    );

    return { onSubmit };
};

const selectPreset = async (title: string) => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Preset' }));
    await user.click(await screen.findByRole('option', { name: title }));
    return user;
};

describe('RoleBuilder presets', () => {
    it('does not render a preset picker unless presets are explicitly provided', () => {
        renderRoleBuilder();

        expect(
            screen.queryByRole('combobox', { name: 'Preset' }),
        ).not.toBeInTheDocument();
    });

    it('populates editable fields and submits the existing role payload', async () => {
        const onSubmit = vi.fn<OnSubmit>();
        renderRoleBuilder({ presets: rolePresets, onSubmit });

        const roleTypeLabel = screen.getByText('Role type');
        const presetInput = screen.getByRole('combobox', { name: 'Preset' });
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
        await user.click(screen.getByRole('combobox', { name: 'Preset' }));
        expect(
            screen.queryByRole('option', { name: 'Roadmap viewer' }),
        ).not.toBeInTheDocument();
        await user.keyboard('{Escape}');

        await user.click(
            screen.getByRole('button', { name: /Organization role/ }),
        );
        await user.click(screen.getByRole('combobox', { name: 'Preset' }));

        expect(
            screen.queryByRole('option', { name: 'SQL Runner user' }),
        ).not.toBeInTheDocument();
        await user.click(
            await screen.findByRole('option', { name: 'Roadmap viewer' }),
        );
        await user.click(screen.getByRole('button', { name: /Project role/ }));

        expect(screen.getByRole('combobox', { name: 'Preset' })).toHaveValue(
            'Start from scratch',
        );
    });
});

describe('Agent capabilities', () => {
    it('shows grouped capabilities and seeds only the four read/query scopes for new roles', async () => {
        flags.enabled = true;
        const { onSubmit } = renderRoleBuilder();
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: /AI Features/ }));
        expect(screen.getByText('Agent capabilities')).toBeInTheDocument();
        expect(screen.getByText('Read and query')).toBeInTheDocument();
        expect(screen.getByText('Changes')).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: 'Raw SQL' })).toBeChecked();
        expect(
            screen.getByRole('checkbox', { name: 'Delete content' }),
        ).not.toBeChecked();
        await user.type(
            screen.getByRole('textbox', { name: /Role name/ }),
            'Agent reader',
        );
        await user.click(screen.getByRole('button', { name: 'Create role' }));
        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                scopes: AGENT_CAPABILITY_DEFAULTS.map(
                    (capability) => AGENT_CAPABILITY_SCOPES[capability],
                ),
            }),
        );
    });
    it('keeps the read/query defaults when choosing a preset or returning to scratch', async () => {
        flags.enabled = true;
        renderRoleBuilder({ presets: rolePresets });
        await selectPreset('SQL Runner user');
        const user = await selectPreset('Start from scratch');
        await user.click(screen.getByRole('button', { name: /AI Features/ }));
        expect(screen.getByRole('checkbox', { name: 'Raw SQL' })).toBeChecked();
    });
    it('preserves existing roles without adding read/query defaults', async () => {
        flags.enabled = true;
        const { onSubmit } = renderRoleBuilder({
            mode: 'edit',
            scopes: ['view:AgentDelete'],
        });
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: /AI Features/ }));
        expect(
            screen.getByRole('checkbox', { name: 'Read and discover' }),
        ).not.toBeChecked();
        expect(
            screen.getByRole('checkbox', { name: 'Delete content' }),
        ).toBeChecked();
        await user.type(
            screen.getByRole('textbox', { name: /Role name/ }),
            'Existing role',
        );
        await user.click(screen.getByRole('button', { name: 'Save changes' }));
        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({ scopes: ['view:AgentDelete'] }),
        );
    });
    it('hides the group when the flag is off', async () => {
        renderRoleBuilder();
        await userEvent
            .setup()
            .click(screen.getByRole('button', { name: /AI Features/ }));
        expect(
            screen.queryByText('Agent capabilities'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('checkbox', { name: 'Raw SQL' }),
        ).not.toBeInTheDocument();
    });
});
