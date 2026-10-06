import {
    AI_IDENTITY_EXPOSURE_MESSAGE,
    AI_IDENTITY_EXPOSURE_CHECK_FAILED_MESSAGE,
    AiIdentityCreationMode,
    AiIdentityProvisionerStatus,
    AiIdentitySyncStatus,
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
    AiIdentityRoleDefinitions: () => <div>1. AI roles</div>,
}));
vi.mock('./AiIdentityRoleMappings', () => ({
    AiIdentityRoleMappings: ({ hint }: { hint: string | null }) => (
        <div>4. Connect groups to AI roles {hint}</div>
    ),
}));
vi.mock('./AiIdentityProvisioningReview', () => ({
    AiIdentityProvisioningReview: ({ hint }: { hint: string | null }) => (
        <div>5. Review and run {hint}</div>
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
    automaticSync: {
        pending: false,
        status: null,
        lastRunAt: null,
        managedScope: [],
        issues: [],
        progress: 0,
    },
    beyondOwnAccessWarnings: [],
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

it('shows the setup steps in order with no guided option', () => {
    renderSetup(settings);
    const titles = [
        '1. AI roles',
        '2. Setup script',
        '3. Check the setup',
        '4. Connect groups to AI roles',
        '5. Review and run',
    ];
    const steps = titles.map((title) =>
        screen.getByText(title, { exact: false }),
    );
    steps.slice(1).forEach((step, index) => {
        expect(
            steps[index].compareDocumentPosition(step) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });
    expect(
        screen.queryByText('Your team creates them'),
    ).not.toBeInTheDocument();
});

it('shows an unsafe sync warning', () => {
    renderSetup({
        ...settings,
        automaticSync: {
            ...settings.automaticSync,
            status: AiIdentitySyncStatus.UNSAFE,
            lastRunAt: new Date(),
        },
    });
    expect(screen.getByText(/AI queries are paused/)).toBeInTheDocument();
});

it('shows admin scope, first-sync progress and typed warnings', () => {
    renderSetup({
        ...settings,
        automaticSync: {
            ...settings.automaticSync,
            status: AiIdentitySyncStatus.RUNNING,
            lastRunAt: new Date(),
            managedScope: [{ roleName: 'ANALYST_AI', database: 'DATA' }],
            progress: 12,
            issues: [
                {
                    code: 'view_dependency',
                    message:
                        'Allowed view DATA.PUBLIC.SUMMARY references an excluded schema.',
                    roleName: 'ANALYST_AI',
                    database: 'DATA',
                    schema: 'PUBLIC',
                },
            ],
        },
    });
    expect(screen.getByText('ANALYST_AI: DATA')).toBeInTheDocument();
    expect(screen.getByText(/12 schemas processed/)).toBeInTheDocument();
    expect(screen.getByText(/view_dependency:/)).toBeInTheDocument();
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

it('has no success callout or turn-off action in step 3', () => {
    renderSetup({
        ...settings,
        mode: AiIdentityCreationMode.GUIDED,
        effectiveMode: AiIdentityCreationMode.GUIDED,
    });
    expect(
        screen.queryByRole('button', { name: 'Turn off' }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Enable automatic creation' }),
    ).not.toBeInTheDocument();
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
        screen.getByText(
            '4. Connect groups to AI roles Check the setup first.',
        ),
    ).toBeInTheDocument();
    expect(
        screen.getByText('5. Review and run Check the setup first.'),
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
            },
        ],
    });
    expect(
        screen.getByText('AI_ROLE: 1 schema allowed, 1 excluded.'),
    ).toBeInTheDocument();
    expect(
        screen.getByText(
            'OTHER_ROLE: the schema catalog is not loaded yet, so the sync grants schemas after the catalog loads.',
        ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText('Show excluded schemas'));
    expect(screen.getByText('DB.PII_PEOPLE')).toBeInTheDocument();
    expect(
        screen.getByText('1 new schema waits for the next grant sync'),
    ).toBeInTheDocument();
});

it('shows the exclusion history next to the roles and warns about broader access', async () => {
    renderSetup(settings);
    expect(screen.getByText('1. AI roles')).toBeInTheDocument();
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

it('keeps Check now secondary after two hours', () => {
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
        'default',
    );
    expect(
        screen.queryByText(/Waiting for the setup script/),
    ).not.toBeInTheDocument();
});

it('hides the grant sync card before a provisioner exists', () => {
    renderSetup({ ...settings, provisioner: null });
    expect(
        screen.queryByText('Keep AI role grants in sync'),
    ).not.toBeInTheDocument();
});

it('shows Not set up before the first grant sync run', () => {
    renderSetup(settings);
    expect(screen.getByText('Keep AI role grants in sync')).toBeInTheDocument();
    expect(screen.getByText('Not set up')).toBeInTheDocument();
    expect(screen.queryByText('UNSAFE')).not.toBeInTheDocument();
});

it('does not show automatic creation as paused before a setup exists', () => {
    renderSetup({
        ...settings,
        provisioner: null,
        mode: AiIdentityCreationMode.AUTOMATIC,
        effectiveMode: AiIdentityCreationMode.GUIDED,
    });
    expect(
        screen.queryByText('Automatic creation is paused'),
    ).not.toBeInTheDocument();
});

it.each([
    ['exposure', AI_IDENTITY_EXPOSURE_MESSAGE],
    ['exposure_check_failed', AI_IDENTITY_EXPOSURE_CHECK_FAILED_MESSAGE],
] as const)('shows the %s refusal message', (unsafeReason, message) => {
    renderSetup({
        ...settings,
        automaticSync: {
            ...settings.automaticSync,
            status: AiIdentitySyncStatus.UNSAFE,
            lastRunAt: new Date(),
            unsafeReason,
        },
    });
    expect(screen.getByText(message)).toBeInTheDocument();
});
