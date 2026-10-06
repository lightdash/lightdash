import {
    AiIdentityCreationMode,
    AiIdentityProvisionerStatus,
    type AiIdentityProvisioningSettings,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { aiIdentityProvisioningApi } from './api';
import { useSetupCheck } from './useProvisioning';

vi.mock('./api', () => ({ aiIdentityProvisioningApi: { check: vi.fn() } }));

const start = '2026-10-06T10:00:00.000Z';
const settings: AiIdentityProvisioningSettings = {
    aiIdentityAccountUuid: 'account',
    mode: AiIdentityCreationMode.GUIDED,
    effectiveMode: AiIdentityCreationMode.GUIDED,
    fallbackReason: null,
    provisioner: {
        aiIdentityAccountUuid: 'account',
        userName: 'PROVISIONER',
        roleName: 'PROVISIONER_ROLE',
        publicKey: 'key',
        publicKeyFingerprint: 'fingerprint',
        status: AiIdentityProvisionerStatus.WAITING_FOR_SETUP,
        statusMessage: null,
        checkedAt: null,
        firstRunApprovedAt: null,
        firstRunApprovedByName: null,
        setupCheck: {
            waitingSince: start,
            nextCheckAt: start,
            signedInAt: null,
            automatic: true,
            checkedByName: null,
            checks: [],
        },
    },
    setupSql: null,
    cleanupSql: null,
    aiRoles: [],
    catalogProjectUuid: 'project',
    defaultWarehouse: '',
    mappings: [],
    findings: [],
    aiRoleExpansions: [],
    ungrantedSchemas: [],
    worstCaseNotice: '',
    showUsersNotice: '',
};

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(start));
    vi.mocked(aiIdentityProvisioningApi.check).mockResolvedValue(settings);
});
afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
});

const mount = () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(() => useSetupCheck(settings), { wrapper });
};
const advance = (ms: number) =>
    act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });

it('polls every ten seconds and stops when the Setup page closes', async () => {
    const hook = mount();
    await advance(1);
    expect(aiIdentityProvisioningApi.check).toHaveBeenCalledTimes(1);
    await advance(10_000);
    expect(aiIdentityProvisioningApi.check).toHaveBeenCalledTimes(2);
    hook.unmount();
    await advance(60_000);
    expect(aiIdentityProvisioningApi.check).toHaveBeenCalledTimes(2);
});

it('switches to sixty seconds after fifteen minutes', async () => {
    vi.setSystemTime(new Date(new Date(start).getTime() + 15 * 60_000));
    mount();
    await advance(1);
    await advance(10_000);
    expect(aiIdentityProvisioningApi.check).toHaveBeenCalledTimes(1);
    await advance(50_000);
    expect(aiIdentityProvisioningApi.check).toHaveBeenCalledTimes(2);
});

it('stops polling at two hours even if the response still says waiting', async () => {
    vi.setSystemTime(new Date(new Date(start).getTime() + 119 * 60_000));
    mount();
    await advance(1);
    await advance(60_000);
    const count = vi.mocked(aiIdentityProvisioningApi.check).mock.calls.length;
    await advance(120_000);
    expect(aiIdentityProvisioningApi.check).toHaveBeenCalledTimes(count);
});
