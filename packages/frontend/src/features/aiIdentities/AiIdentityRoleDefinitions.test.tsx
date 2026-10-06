import {
    AiIdentityCreationMode,
    type AiIdentityProvisioningSettings,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AiIdentityRoleDefinitions } from './AiIdentityRoleDefinitions';
import { aiIdentityProvisioningApi } from './api';

vi.mock('../sqlRunner/hooks/useTables', () => ({
    useTables: () => ({ data: { DB: { PUBLIC: {}, PII_PEOPLE: {} } } }),
}));
vi.mock('./useProvisioning', () => ({
    useProvisioningChange: () => ({
        mutate: (action: () => void) => action(),
        isLoading: false,
        error: null,
    }),
}));
vi.mock('./api', () => ({ aiIdentityProvisioningApi: { aiRoles: vi.fn() } }));
const settings: AiIdentityProvisioningSettings = {
    aiIdentityAccountUuid: 'account',
    mode: AiIdentityCreationMode.GUIDED,
    effectiveMode: AiIdentityCreationMode.GUIDED,
    fallbackReason: null,
    provisioner: null,
    setupSql: null,
    cleanupSql: null,
    aiRoles: [],
    catalogProjectUuid: 'project',
    defaultWarehouse: 'WH',
    mappings: [],
    findings: [],
    aiRoleExpansions: [],
    ungrantedSchemas: [],
    worstCaseNotice: '',
    showUsersNotice: '',
};
it('requires a name, warehouse and valid rule before saving a new role', async () => {
    render(
        <MantineProvider env="test">
            <AiIdentityRoleDefinitions settings={settings} />
        </MantineProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add AI role' }));
    fireEvent.change(screen.getByLabelText('AI role name'), {
        target: { value: 'AI_ROLE' },
    });
    expect(
        screen.getByLabelText('Database', { selector: 'input' }),
    ).toHaveValue('DB');
    expect(
        screen.getByLabelText('Exclude schemas that match', {
            selector: 'input',
        }),
    ).toHaveValue('');
    expect(
        screen.getByText('AI can read all schemas in DB, except:'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/locked|all.roles/i)).not.toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save AI roles' });
    expect(save).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
        'This AI role can read all schemas in the database.',
    );
    await userEvent.type(
        screen.getByLabelText('Exclude schemas that match', {
            selector: 'input',
        }),
        'PII_*{enter}',
    );
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(aiIdentityProvisioningApi.aiRoles).toHaveBeenCalledWith('account', [
        {
            roleName: 'AI_ROLE',
            warehouse: 'WH',
            schemas: [],
            schemaRule: {
                database: 'DB',
                excludePatterns: ['PII_*'],
            },
        },
    ]);
    fireEvent.change(screen.getByLabelText('Warehouse'), {
        target: { value: '' },
    });
    expect(save).toBeDisabled();
});

it('blocks saving when another role has an invalid pattern or no database', () => {
    render(
        <MantineProvider env="test">
            <AiIdentityRoleDefinitions
                settings={{
                    ...settings,
                    aiRoles: [
                        {
                            aiIdentityAiRoleUuid: 'one',
                            schemas: [],
                            roleName: 'ONE',
                            warehouse: 'WH',
                            schemaRule: {
                                database: 'DB',
                                excludePatterns: [],
                            },
                        },
                        {
                            aiIdentityAiRoleUuid: 'two',
                            schemas: [],
                            roleName: 'TWO',
                            warehouse: 'WH',
                            schemaRule: {
                                database: '',
                                excludePatterns: ['bad.pattern'],
                            },
                        },
                    ],
                }}
            />
        </MantineProvider>,
    );
    fireEvent.change(screen.getAllByLabelText('AI role name')[0], {
        target: { value: 'RENAMED' },
    });
    expect(
        screen.getByRole('button', { name: 'Save AI roles' }),
    ).toBeDisabled();
    expect(
        screen.getByText('Use letters, digits, _, $, * and ?.'),
    ).toBeInTheDocument();
});
