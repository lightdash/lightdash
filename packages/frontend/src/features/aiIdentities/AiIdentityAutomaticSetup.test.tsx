import {
    AiIdentityCreationMode,
    AiIdentityProvisionerStatus,
    type AiIdentityProvisioningSettings,
    type AiIdentitySetupCheck,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AiIdentityAutomaticSetup } from './AiIdentityAutomaticSetup';
import { aiIdentityProvisioningApi } from './api';

vi.mock('./api', () => ({
    aiIdentityProvisioningApi: {
        update: vi.fn(),
        startWaiting: vi.fn(),
        check: vi.fn(),
    },
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
        setupCheck: null,
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
                excludedByPattern: [{ pattern: 'PII_*', count: 1 }],
                catalogLoaded: true,
            },
            {
                roleName: 'OTHER_ROLE',
                allowed: [],
                excluded: [],
                excludedByPattern: [],
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
    expect(screen.getByText('Change log')).toBeInTheDocument();
    expect(
        await screen.findByText('No changes to exclusions yet.'),
    ).toBeInTheDocument();
    expect(
        screen.getByText(/their own Snowflake role cannot read/),
    ).toBeInTheDocument();
});

const setupCheck: AiIdentitySetupCheck = {
    waitingSince: new Date().toISOString(),
    nextCheckAt: new Date(Date.now() + 10_000).toISOString(),
    signedInAt: null,
    checkedByName: null,
    automatic: true,
    checks: [],
};

it('shows an information banner while waiting and starts waiting on download', async () => {
    const waiting = {
        ...settings,
        setupSql: 'SELECT 1;',
        provisioner: {
            ...settings.provisioner!,
            status: AiIdentityProvisionerStatus.WAITING_FOR_SETUP,
            setupCheck,
        },
    };
    vi.mocked(aiIdentityProvisioningApi.check).mockResolvedValue(waiting);
    vi.mocked(aiIdentityProvisioningApi.startWaiting).mockResolvedValue(
        waiting,
    );
    renderSetup(waiting);
    expect(
        screen.getByText(
            'Waiting for the setup script. Run it in Snowflake. Lightdash checks every 10 seconds. You can leave this page.',
        ),
    ).toBeInTheDocument();
    const download = screen.getByRole('link', { name: 'Download .sql' });
    download.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(download);
    await waitFor(() =>
        expect(aiIdentityProvisioningApi.startWaiting).toHaveBeenCalledWith(
            'account',
        ),
    );
});

it('starts waiting when the setup script is copied', async () => {
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    vi.mocked(aiIdentityProvisioningApi.startWaiting).mockResolvedValue(
        settings,
    );
    renderSetup({ ...settings, setupSql: 'SELECT 1;' });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() =>
        expect(aiIdentityProvisioningApi.startWaiting).toHaveBeenCalledWith(
            'account',
        ),
    );
});

it('shows the passed checklist with Ready and Checked automatically without a setup success banner', () => {
    renderSetup({
        ...settings,
        mode: AiIdentityCreationMode.GUIDED,
        provisioner: {
            ...settings.provisioner!,
            checkedAt: new Date(),
            setupCheck: {
                ...setupCheck,
                nextCheckAt: null,
                checks: [
                    {
                        key: 'sign_in',
                        label: 'The setup user signs in with its key',
                        status: 'passed',
                        detail: null,
                    },
                ],
            },
        },
    });
    expect(
        screen.getByText('The setup user signs in with its key'),
    ).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Checked automatically')).toBeInTheDocument();
    expect(screen.queryByText(/Setup is ready/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check now' })).toHaveAttribute(
        'data-variant',
        'default',
    );
});

it('shows a failed item and the manual check name', () => {
    renderSetup({
        ...settings,
        provisioner: {
            ...settings.provisioner!,
            status: AiIdentityProvisionerStatus.FAILING,
            checkedAt: new Date(),
            setupCheck: {
                ...setupCheck,
                automatic: false,
                checkedByName: 'Test Admin',
                nextCheckAt: null,
                checks: [
                    {
                        key: 'create_identities',
                        label: 'The setup role can create AI identities',
                        status: 'failed',
                        detail: 'The setup role needs CREATE USER on ACCOUNT.',
                    },
                ],
            },
        },
    });
    expect(
        screen.getByText('The setup role needs CREATE USER on ACCOUNT.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Checked by Test Admin')).toBeInTheDocument();
    expect(screen.queryByText('Checked automatically')).not.toBeInTheDocument();
});

it('makes Check now the main action after two hours', () => {
    renderSetup({
        ...settings,
        setupSql: 'SELECT 1;',
        provisioner: {
            ...settings.provisioner!,
            status: AiIdentityProvisionerStatus.WAITING_FOR_SETUP,
            setupCheck: {
                ...setupCheck,
                waitingSince: new Date(
                    Date.now() - 2 * 60 * 60_000,
                ).toISOString(),
                nextCheckAt: null,
            },
        },
    });
    expect(screen.getByRole('button', { name: 'Check now' })).toHaveAttribute(
        'data-variant',
        'filled',
    );
    expect(
        screen.queryByText(/Waiting for the setup script/),
    ).not.toBeInTheDocument();
});
