import {
    AiIdentityJobKind,
    AiIdentityJobStatus,
    AiIdentityCreationMode,
    AiIdentityProvisionerStatus,
    AiIdentityProvisionerFindingReason,
    type AiIdentityProvisioningSettings,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiIdentityCreationSetup } from './AiIdentityCreationSetup';
import { AiIdentityProvisioningReview } from './AiIdentityProvisioningReview';
import { AiIdentityProvisioningTriage } from './AiIdentityProvisioningTriage';
import { aiIdentityProvisioningApi } from './api';
import { actionLabel } from './eventLabels';
import {
    canRunProvisioning,
    findingLabels,
    isProvisioningFallback,
    needsProvisioningApproval,
    orderMappings,
} from './provisioning';

vi.mock('./api', () => ({
    aiIdentityProvisioningApi: {
        settings: vi.fn(),
        update: vi.fn(),
        plan: vi.fn(),
        run: vi.fn(),
    },
}));
vi.mock('./AiIdentitySetup', () => ({
    AiIdentitySetup: () => <div>Guided export</div>,
}));
vi.mock('./AiIdentityAutomaticSetup', () => ({
    AiIdentityAutomaticSetup: () => <div>Automatic setup</div>,
}));

const readyPlan = {
    mappingsDirty: false,
    hasPlan: true,
    fetchingPlan: false,
    planError: false,
    running: false,
};

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
    aiRoles: [],
    catalogProjectUuid: 'project',
    defaultWarehouse: 'COMPUTE_WH',
    mappings: [],
    findings: [],
    worstCaseNotice: '',
    showUsersNotice: '',
};
const renderWithClient = (component: React.ReactNode) =>
    render(
        <MantineProvider>
            <QueryClientProvider
                client={
                    new QueryClient({
                        defaultOptions: {
                            queries: { retry: false },
                            mutations: { retry: false },
                        },
                    })
                }
            >
                {component}
            </QueryClientProvider>
        </MantineProvider>,
    );
beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiIdentityProvisioningApi.run).mockResolvedValue({
        jobUuid: 'job',
        kind: AiIdentityJobKind.SYNC,
        status: AiIdentityJobStatus.QUEUED,
        total: 1,
        done: 0,
        fileUrl: null,
        skipped: [],
        error: null,
        createdAt: new Date(),
    });
    vi.mocked(aiIdentityProvisioningApi.settings).mockResolvedValue(settings);
    vi.mocked(aiIdentityProvisioningApi.plan).mockResolvedValue({
        items: [
            {
                aiIdentityUuid: 'identity',
                email: 'person@example.com',
                operation: { kind: 'drop_user', userName: 'PERSON_AI' },
                sql: 'DROP USER PERSON_AI;',
            },
        ],
        skipped: [
            { email: 'skipped@example.com', reason: 'No matching group' },
        ],
    });
});

describe('provisioning helpers', () => {
    it('requires requested automatic mode and effective guided mode for fallback', () => {
        expect(isProvisioningFallback(settings)).toBe(false);
        expect(
            isProvisioningFallback({
                ...settings,
                effectiveMode: AiIdentityCreationMode.GUIDED,
            }),
        ).toBe(true);
        expect(
            isProvisioningFallback({
                ...settings,
                mode: AiIdentityCreationMode.GUIDED,
                effectiveMode: AiIdentityCreationMode.GUIDED,
            }),
        ).toBe(false);
    });
    it('requires approval until the server records it', () => {
        expect(
            needsProvisioningApproval({ ...settings, provisioner: null }),
        ).toBe(true);
        expect(needsProvisioningApproval(settings)).toBe(true);
        expect(
            needsProvisioningApproval({
                ...settings,
                provisioner: {
                    ...settings.provisioner!,
                    firstRunApprovedAt: new Date(),
                },
            }),
        ).toBe(false);
    });
    it('saves visual priority order and trims roles', () => {
        expect(
            orderMappings([
                { groupUuid: 'second', aiRole: ' ROLE_B ', priority: 5 },
                { groupUuid: 'first', aiRole: 'ROLE_A', priority: 0 },
            ]),
        ).toEqual([
            { groupUuid: 'second', aiRole: 'ROLE_B', priority: 0 },
            { groupUuid: 'first', aiRole: 'ROLE_A', priority: 1 },
        ]);
    });
    it('labels SQL runs and both finding reasons', () => {
        expect(actionLabel('provision_statement')).toBe('Ran in Snowflake');
        expect(
            findingLabels[AiIdentityProvisionerFindingReason.NOT_SERVICE_AGENT],
        ).toBe('Not an AI user (TYPE is not SERVICE_AGENT)');
        expect(
            findingLabels[
                AiIdentityProvisionerFindingReason.NOT_CREATED_BY_LIGHTDASH
            ],
        ).toBe('Not created by Lightdash');
    });
});
it('shows fallback and navigates to setup', async () => {
    vi.mocked(aiIdentityProvisioningApi.settings).mockResolvedValue({
        ...settings,
        effectiveMode: AiIdentityCreationMode.GUIDED,
        fallbackReason: 'Provisioner access was revoked.',
    });
    const onSetup = vi.fn();
    renderWithClient(
        <AiIdentityProvisioningTriage
            accountUuid="account"
            onSetup={onSetup}
        />,
    );
    expect(
        await screen.findByText('Provisioner access was revoked.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Setup' }));
    expect(onSetup).toHaveBeenCalledOnce();
});
it('shows all plan statements and skipped people, and waits for explicit approval', async () => {
    renderWithClient(
        <AiIdentityProvisioningReview
            settings={settings}
            mappingsDirty={false}
            onJob={vi.fn()}
        />,
    );
    expect(await screen.findByText('DROP USER PERSON_AI;')).toBeInTheDocument();
    expect(screen.getByText(/skipped@example.com: Skipped/)).toHaveTextContent(
        'No matching group',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Approve and run' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent(
        'Run 1 statements in Snowflake',
    );
    expect(aiIdentityProvisioningApi.run).not.toHaveBeenCalled();
    fireEvent.click(
        screen.getAllByRole('button', { name: 'Approve and run' }).at(-1)!,
    );
    await waitFor(() =>
        expect(aiIdentityProvisioningApi.run).toHaveBeenCalledWith('account', {
            approveStatements: true,
        }),
    );
});
it('runs directly after approval has been recorded', async () => {
    renderWithClient(
        <AiIdentityProvisioningReview
            settings={{
                ...settings,
                provisioner: {
                    ...settings.provisioner!,
                    firstRunApprovedAt: new Date(),
                },
            }}
            mappingsDirty={false}
            onJob={vi.fn()}
        />,
    );
    await screen.findByText('DROP USER PERSON_AI;');
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
    await waitFor(() =>
        expect(aiIdentityProvisioningApi.run).toHaveBeenCalledOnce(),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('blocks runs while mappings are unsaved', () => {
    renderWithClient(
        <AiIdentityProvisioningReview
            settings={settings}
            mappingsDirty
            onJob={vi.fn()}
        />,
    );
    expect(
        screen.getByRole('button', { name: 'Approve and run' }),
    ).toBeDisabled();
    expect(aiIdentityProvisioningApi.plan).not.toHaveBeenCalled();
});
it('opens automatic setup and shows a rejected mode change inline', async () => {
    vi.mocked(aiIdentityProvisioningApi.settings).mockResolvedValue({
        ...settings,
        mode: AiIdentityCreationMode.GUIDED,
        effectiveMode: AiIdentityCreationMode.GUIDED,
        provisioner: null,
    });
    vi.mocked(aiIdentityProvisioningApi.update).mockRejectedValue({
        error: { message: 'Check the provisioner first.' },
    });
    renderWithClient(
        <AiIdentityCreationSetup
            account={
                { aiIdentityAccountUuid: 'account' } as Parameters<
                    typeof AiIdentityCreationSetup
                >[0]['account']
            }
            onJob={vi.fn()}
            onProvisioningJob={vi.fn()}
        />,
    );
    await waitFor(() =>
        expect(
            screen.getByRole('radio', { name: 'Lightdash creates them' }),
        ).toBeEnabled(),
    );
    fireEvent.click(
        screen.getByRole('radio', { name: 'Lightdash creates them' }),
    );
    expect(
        await screen.findByText('Check the provisioner first.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Automatic setup')).toBeInTheDocument();
    expect(screen.queryByText('Guided export')).not.toBeInTheDocument();
    expect(aiIdentityProvisioningApi.update).toHaveBeenCalledWith('account', {
        mode: AiIdentityCreationMode.AUTOMATIC,
    });
});

it('shows each owned-user finding and its fix SQL', async () => {
    vi.mocked(aiIdentityProvisioningApi.settings).mockResolvedValue({
        ...settings,
        findings: [
            {
                userName: 'UNEXPECTED_USER',
                userType: 'PERSON',
                reason: AiIdentityProvisionerFindingReason.NOT_SERVICE_AGENT,
                fixSql: 'DROP USER UNEXPECTED_USER;',
            },
        ],
    });
    renderWithClient(
        <AiIdentityProvisioningTriage
            accountUuid="account"
            onSetup={vi.fn()}
        />,
    );
    expect(
        await screen.findByText(
            'Users owned by the provisioner that need attention',
        ),
    ).toBeInTheDocument();
    expect(
        screen.getByText(/UNEXPECTED_USER: Not an AI user/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show fix SQL' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent(
        'DROP USER UNEXPECTED_USER;',
    );
});

it.each([
    { mappingsDirty: true },
    { hasPlan: false },
    { fetchingPlan: true },
    { planError: true },
    { running: true },
])('blocks approval when the plan cannot be used: %j', (override) => {
    expect(canRunProvisioning(settings, { ...readyPlan, ...override })).toBe(
        false,
    );
});

it('only permits runs when automatic creation is effective and the provisioner is ready', () => {
    expect(canRunProvisioning(settings, readyPlan)).toBe(true);
    expect(
        canRunProvisioning(
            { ...settings, effectiveMode: AiIdentityCreationMode.GUIDED },
            readyPlan,
        ),
    ).toBe(false);
    expect(
        canRunProvisioning({ ...settings, provisioner: null }, readyPlan),
    ).toBe(false);
    expect(
        canRunProvisioning(
            {
                ...settings,
                provisioner: {
                    ...settings.provisioner!,
                    status: AiIdentityProvisionerStatus.REVOKED,
                },
            },
            readyPlan,
        ),
    ).toBe(false);
});
