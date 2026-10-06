import {
    AiIdentityCreationMode,
    expandAiIdentitySchemaRule,
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
        mutate: async (
            action: () => Promise<AiIdentityProvisioningSettings>,
            options: {
                onSuccess: (saved: AiIdentityProvisioningSettings) => void;
            },
        ) => {
            const saved = await action();
            options.onSuccess(saved);
        },
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
    vi.mocked(aiIdentityProvisioningApi.aiRoles).mockImplementation(
        async (_, roles) => ({
            ...settings,
            aiRoles: roles.map((role) => ({
                ...role,
                schemaRule: role.schemaRule!,
                aiIdentityAiRoleUuid: 'saved',
            })),
            aiRoleExpansions: roles.map((role) => ({
                roleName: role.roleName,
                ...expandAiIdentitySchemaRule(role.schemaRule!, [
                    'DB.PUBLIC',
                    'DB.PII_PEOPLE',
                ]),
                catalogLoaded: true,
            })),
        }),
    );
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
        screen.queryByRole('textbox', { name: 'Schema pattern' }),
    ).not.toBeInTheDocument();
    expect(
        screen.getByText('AI can read all schemas in DB, except:'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/locked|all.roles/i)).not.toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save AI roles' });
    expect(save).toBeEnabled();
    expect(screen.getByText('schemas that AI can read')).toBeInTheDocument();
    expect(screen.getByText('excluded: none')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Warehouse'), {
        target: { value: '' },
    });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Warehouse'), {
        target: { value: 'WH' },
    });
    await userEvent.click(
        screen.getByRole('button', { name: '+ Exclude schemas' }),
    );
    await userEvent.type(
        screen.getByRole('textbox', { name: 'Schema pattern' }),
        'PII_*{enter}',
    );
    expect(
        screen.getByRole('button', { name: 'Remove PII_*' }),
    ).toBeInTheDocument();
    expect(screen.getByText('excluded: 1 match PII_*')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Show excluded schemas'));
    expect(screen.getByText('DB.PII_PEOPLE')).toBeVisible();
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
    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Saved. 1 schema matches PII_*.',
    );
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

it('removes chips, rejects invalid input and keeps roles separate', async () => {
    render(
        <MantineProvider env="test">
            <AiIdentityRoleDefinitions
                settings={{
                    ...settings,
                    aiRoles: ['ONE', 'TWO'].map((roleName) => ({
                        aiIdentityAiRoleUuid: roleName,
                        roleName,
                        warehouse: 'WH',
                        schemas: [],
                        schemaRule: {
                            database: 'DB',
                            excludePatterns: ['PII_*'],
                        },
                    })),
                }}
            />
        </MantineProvider>,
    );
    await userEvent.click(
        screen.getAllByRole('button', { name: 'Remove PII_*' })[0],
    );
    expect(
        screen.getAllByRole('button', { name: 'Remove PII_*' }),
    ).toHaveLength(1);
    expect(screen.getByText('excluded: none')).toBeInTheDocument();
    await userEvent.click(
        screen.getAllByRole('button', { name: '+ Exclude schemas' })[0],
    );
    await userEvent.type(
        screen.getByRole('textbox', { name: 'Schema pattern' }),
        'bad.pattern{enter}',
    );
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(
        screen.getByText('Use letters, digits, _, $, * and ?.'),
    ).toBeInTheDocument();
    await userEvent.clear(
        screen.getByRole('textbox', { name: 'Schema pattern' }),
    );
    await userEvent.type(
        screen.getByRole('textbox', { name: 'Schema pattern' }),
        'PUBLIC',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(
        screen.getByRole('button', { name: 'Remove PUBLIC' }),
    ).toBeInTheDocument();
});

it('reports only newly added patterns from the saved expansion', async () => {
    const role = {
        aiIdentityAiRoleUuid: 'saved',
        roleName: 'FINANCE_AI',
        warehouse: 'WH',
        schemas: [],
        schemaRule: { database: 'DB', excludePatterns: ['*_CLEAR'] },
    };
    vi.mocked(aiIdentityProvisioningApi.aiRoles).mockResolvedValue({
        ...settings,
        aiRoles: [
            {
                ...role,
                schemaRule: {
                    ...role.schemaRule,
                    excludePatterns: ['*_CLEAR', '*_PII'],
                },
            },
        ],
        aiRoleExpansions: [
            {
                roleName: 'FINANCE_AI',
                allowed: ['DB.PUBLIC'],
                excluded: ['DB.PEOPLE_PII', 'DB.ADDRESS_PII'],
                excludedByPattern: [
                    { pattern: '*_CLEAR', count: 0 },
                    { pattern: '*_PII', count: 2 },
                ],
                catalogLoaded: true,
            },
        ],
    });
    render(
        <MantineProvider env="test">
            <AiIdentityRoleDefinitions
                settings={{ ...settings, aiRoles: [role] }}
            />
        </MantineProvider>,
    );
    await userEvent.click(
        screen.getByRole('button', { name: '+ Exclude schemas' }),
    );
    expect(
        screen.getByRole('textbox', { name: 'Schema pattern' }),
    ).toHaveFocus();
    await userEvent.keyboard('*_PII{enter}');
    await userEvent.click(
        screen.getByRole('button', { name: 'Save AI roles' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Saved. 2 schemas match *_PII.',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('*_CLEAR');
    expect(screen.getByRole('alert')).not.toHaveTextContent(/minutes|sync/);
    await userEvent.click(screen.getByRole('button', { name: 'Add AI role' }));
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument();
});

it('shows two count tiles and assigns overlapping matches to the first pattern', () => {
    render(
        <MantineProvider env="test">
            <AiIdentityRoleDefinitions
                settings={{
                    ...settings,
                    aiRoles: [
                        {
                            aiIdentityAiRoleUuid: 'one',
                            roleName: 'ONE',
                            warehouse: 'WH',
                            schemas: [],
                            schemaRule: {
                                database: 'DB',
                                excludePatterns: ['PII_*', '*'],
                            },
                        },
                    ],
                }}
            />
        </MantineProvider>,
    );
    expect(
        screen.getByText('schemas that AI can read').parentElement,
    ).toHaveTextContent(/^0schemas that AI can read$/);
    expect(
        screen.getByText('excluded: 1 match PII_*, 1 match *').parentElement,
    ).toHaveTextContent(/^2excluded: 1 match PII_\*, 1 match \*$/);
});
