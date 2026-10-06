import {
    AiIdentityCreationMode,
    AiIdentityProvisionerStatus,
    type AiIdentityProvisioningSettings,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AiIdentityAutomaticSetup } from './AiIdentityAutomaticSetup';
import { aiIdentityProvisioningApi } from './api';

vi.mock('./api', () => ({
    aiIdentityProvisioningApi: { update: vi.fn() },
    aiIdentityApi: {
        requestLog: vi.fn().mockResolvedValue({
            data: [],
            pagination: {
                page: 1,
                pageSize: 50,
                totalResults: 0,
                totalPageCount: 0,
            },
        }),
    },
}));
vi.mock('./AiIdentityRoleDefinitions', () => ({
    AiIdentityRoleDefinitions: () => <div>Role definitions</div>,
}));
vi.mock('./AiIdentityRoleMappings', () => ({
    AiIdentityRoleMappings: ({ hint }: { hint: string | null }) => (
        <div>Mappings {hint}</div>
    ),
}));
vi.mock('./AiIdentityProvisioningReview', () => ({
    AiIdentityProvisioningReview: ({ hint }: { hint: string | null }) => (
        <div>Review {hint}</div>
    ),
}));

const settings: AiIdentityProvisioningSettings = {
    aiIdentityAccountUuid: 'account',
    mode: AiIdentityCreationMode.AUTOMATIC,
    effectiveMode: AiIdentityCreationMode.AUTOMATIC,
    fallbackReason: null,
    provisioner: {
        aiIdentityAccountUuid: 'account',
        userName: 'PROVISIONER',
        roleName: 'PROVISIONER_ROLE',
        publicKey: 'key',
        publicKeyFingerprint: 'fingerprint',
        status: AiIdentityProvisionerStatus.READY,
        statusMessage: null,
        checkedAt: null,
        firstRunApprovedAt: null,
        firstRunApprovedByName: null,
    },
    setupSql: null,
    cleanupSql: null,
    aiRoles: [],
    catalogProjectUuid: 'project',
    defaultWarehouse: 'COMPUTE_WH',
    mappings: [],
    findings: [],
    aiRoleExpansions: [],
    ungrantedSchemas: [],
    worstCaseNotice: '',
    showUsersNotice: '',
};

const renderSetup = (value: AiIdentityProvisioningSettings) =>
    render(
        <MantineProvider>
            <QueryClientProvider client={new QueryClient()}>
                <AiIdentityAutomaticSetup settings={value} onJob={vi.fn()} />
            </QueryClientProvider>
        </MantineProvider>,
    );

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiIdentityProvisioningApi.update).mockResolvedValue({
        ...settings,
        mode: AiIdentityCreationMode.GUIDED,
        effectiveMode: AiIdentityCreationMode.GUIDED,
    });
});

it('shows that automatic creation is on and lets an admin turn it off', async () => {
    renderSetup(settings);
    expect(screen.getByText('Automatic creation is on')).toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Enable automatic creation' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
        Array.from(dialog.querySelectorAll('button')).find(
            (button) => button.textContent === 'Turn off',
        )!,
    );
    await waitFor(() =>
        expect(aiIdentityProvisioningApi.update).toHaveBeenCalledWith(
            'account',
            { mode: AiIdentityCreationMode.GUIDED },
        ),
    );
});

it('shows why automatic creation is paused', () => {
    renderSetup({
        ...settings,
        effectiveMode: AiIdentityCreationMode.GUIDED,
        fallbackReason: 'The provisioner key was rejected.',
    });
    expect(
        screen.getByText('Automatic creation is paused'),
    ).toBeInTheDocument();
    expect(
        screen.getByText('The provisioner key was rejected.'),
    ).toBeInTheDocument();
});

it('offers to enable automatic creation once the provisioner is ready', () => {
    renderSetup({
        ...settings,
        mode: AiIdentityCreationMode.GUIDED,
        effectiveMode: AiIdentityCreationMode.GUIDED,
    });
    expect(
        screen.getByRole('button', { name: 'Enable automatic creation' }),
    ).toBeEnabled();
    expect(
        screen.queryByText('Automatic creation is on'),
    ).not.toBeInTheDocument();
});

it('puts each step hint inside its own step', () => {
    renderSetup({
        ...settings,
        provisioner: {
            ...settings.provisioner!,
            status: AiIdentityProvisionerStatus.WAITING_FOR_SETUP,
        },
    });
    expect(
        screen.getByText('Mappings Check the provisioner first.'),
    ).toBeInTheDocument();
    expect(
        screen.getByText('Review Check the provisioner first.'),
    ).toBeInTheDocument();
});

it('shows saved role expansions and ungranted schemas in setup', () => {
    renderSetup({
        ...settings,
        aiRoleExpansions: [
            {
                roleName: 'AI_ROLE',
                allowed: ['DB.PUBLIC'],
                excluded: ['DB.PII_PEOPLE'],
                catalogLoaded: true,
            },
            {
                roleName: 'OTHER_ROLE',
                allowed: [],
                excluded: [],
                catalogLoaded: false,
            },
        ],
        ungrantedSchemas: [
            {
                roleName: 'AI_ROLE',
                schemas: ['DB.NEW'],
                fixSql: 'GRANT USAGE ON SCHEMA DB.NEW TO ROLE AI_ROLE;',
            },
        ],
    });
    expect(
        screen.getByText('AI_ROLE: 1 schema allowed, 1 excluded.'),
    ).toBeInTheDocument();
    expect(
        screen.getByText(
            'OTHER_ROLE: the schema catalog is not loaded yet, so the script grants no schemas.',
        ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText('Show excluded schemas'));
    expect(screen.getByText('DB.PII_PEOPLE')).toBeInTheDocument();
    expect(
        screen.getByText('1 new schema is not granted to AI_ROLE'),
    ).toBeInTheDocument();
});

it('shows the exclusion history next to the roles and warns about broader access', async () => {
    renderSetup(settings);
    expect(screen.getByText('Role definitions')).toBeInTheDocument();
    expect(screen.getByText('Changes to exclusions')).toBeInTheDocument();
    expect(
        await screen.findByText('No changes to exclusions yet.'),
    ).toBeInTheDocument();
    expect(
        screen.getByText(/their own Snowflake role cannot read/),
    ).toBeInTheDocument();
});
