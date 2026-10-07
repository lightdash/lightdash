import {
    AiAgentMarkerLevel,
    AiCredentialMethod,
    AiPrincipalKind,
    AiSetupScriptFormat,
    AiTransportKind,
    WarehouseTypes,
    UserWarehouseCredentialPurpose,
    type UserWarehouseCredentials,
    type AiAccessPolicy,
    type AiWarehouseCapabilities,
} from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import {
    renderHookWithProviders,
    renderWithProviders,
} from '../../testing/testUtils';
import { AiIdentitySettings } from './AiIdentitySettings';
import { useAiMarkerCheck } from './api';
import type * as AiAccessApi from './api';
const mutate = vi.fn();
const login = vi.fn();
const remove = vi.fn();
const toast = vi.fn();
let configured = false;
let credentials: UserWarehouseCredentials[] = [];
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({
        user: {},
        health: {
            data: {
                rudder: {},
                siteUrl: 'https://app.example/',
                auth: { snowflakeAi: { enabled: configured } },
            },
            isLoading: false,
            isError: false,
        },
    }),
}));
vi.mock('../../hooks/useSnowflake', () => ({
    useSnowflakeAiLoginPopup: () => ({ mutate: login, isLoading: false }),
}));
vi.mock(
    '../../hooks/userWarehouseCredentials/useUserWarehouseCredentials',
    () => ({
        useUserWarehouseCredentials: () => ({
            data: credentials,
            isLoading: false,
            isError: false,
        }),
        useUserWarehouseCredentialsDeleteMutation: () => ({
            mutate: remove,
            isLoading: false,
        }),
    }),
);
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastSuccess: toast }),
}));
vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('./api', async (importOriginal) => ({
    ...(await importOriginal<typeof AiAccessApi>()),
    useUpsertAiAccessPolicy: () => ({ mutate, isLoading: false }),
}));
const capabilities: AiWarehouseCapabilities = {
    warehouseType: WarehouseTypes.POSTGRES,
    marker: {
        level: AiAgentMarkerLevel.IDENTIFY_ONLY,
        signals: [],
        note: null,
        enforce: null,
    },
    setupFormat: AiSetupScriptFormat.SQL,
    principals: {
        person: { available: true, method: AiCredentialMethod.MARKER },
        group: { available: true, method: AiCredentialMethod.KEY },
        twin: { available: true, method: AiCredentialMethod.KEY },
        shared: { available: true, method: AiCredentialMethod.KEY },
    },
    transports: {
        direct: { available: true },
        procedure: { available: false, reason: 'Unavailable' },
    },
};
const policy: AiAccessPolicy = {
    aiAccessPolicyUuid: 'policy',
    projectUuid: 'project',
    warehouseConnectionUuid: null,
    enabled: true,
    principalKind: AiPrincipalKind.GROUP,
    transport: { kind: AiTransportKind.DIRECT },
    sharedRef: null,
    twinNameTemplate: null,
    policySource: null,
    groupMappings: [
        {
            groupUuid: 'group',
            groupName: 'Group',
            ref: 'ai_group',
            priority: 0,
        },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
};
const renderSettings = (
    saved: AiAccessPolicy | null,
    available = capabilities,
) =>
    renderWithProviders(
        <AiIdentitySettings
            projectUuid="project"
            connection={null}
            connectionSelector={null}
            policy={saved}
            capabilities={available}
        />,
    );
const snowflakeCapabilities: AiWarehouseCapabilities = {
    ...capabilities,
    warehouseType: WarehouseTypes.SNOWFLAKE,
    marker: {
        ...capabilities.marker,
        level: AiAgentMarkerLevel.VERIFIED_SESSION,
    },
};
const snowflakeCredential: UserWarehouseCredentials = {
    uuid: 'agent-credential',
    userUuid: 'user',
    name: 'Agent sessions',
    purpose: UserWarehouseCredentialPurpose.AI,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    updatedAt: new Date('2026-10-01T12:00:00Z'),
    credentials: { type: WarehouseTypes.SNOWFLAKE, user: 'person' },
    project: null,
};
describe('Snowflake agent sign-in', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        configured = false;
        credentials = [];
        vi.mocked(lightdashApi).mockResolvedValue({
            ok: true,
            message: 'The warehouse session carries the agent marker.',
        });
    });
    it('shows setup SQL and disables enforcement before instance setup', async () => {
        renderSettings(null, snowflakeCapabilities);
        expect(
            screen.getByText('Agents run as the marked person.'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'The agent sign-in integration is not configured on this instance.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('switch', {
                name: /^Require verified agent sessions/,
            }),
        ).toBeDisabled();
        const sql = await screen.findByText(
            (_, element) =>
                element?.tagName === 'CODE' &&
                !!element.textContent?.includes('CREATE SECURITY INTEGRATION'),
        );
        expect(sql).toHaveTextContent(
            "OAUTH_REDIRECT_URI = 'https://app.example/api/v1/oauth/redirect/snowflake-ai'",
        );
        expect(sql).toHaveTextContent('IS_AGENTIC = TRUE');
        expect(
            screen.getByRole('button', { name: 'Copy integration SQL' }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Your sign-in')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Save' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(lightdashApi).not.toHaveBeenCalled();
    });
    it('offers personal sign-in and saves the person policy immediately', () => {
        configured = true;
        credentials = [
            {
                ...snowflakeCredential,
                purpose: UserWarehouseCredentialPurpose.DEFAULT,
            },
            {
                ...snowflakeCredential,
                credentials: { type: WarehouseTypes.BIGQUERY },
            },
        ];
        renderSettings(null, snowflakeCapabilities);
        expect(
            screen.getByText('Agent sign-in integration configured.'),
        ).toBeInTheDocument();
        const toggle = screen.getByRole('switch', {
            name: /^Require verified agent sessions/,
        });
        expect(toggle).not.toBeChecked();
        expect(toggle).toBeEnabled();
        expect(
            screen.getByText('You are not signed in for agent sessions.'),
        ).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Sign in for agent sessions' }),
        );
        expect(login).toHaveBeenCalledOnce();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(lightdashApi).not.toHaveBeenCalled();
        fireEvent.click(toggle);
        expect(mutate).toHaveBeenCalledWith(
            {
                enabled: true,
                principalKind: AiPrincipalKind.PERSON,
                transport: { kind: AiTransportKind.DIRECT },
                sharedRef: null,
                twinNameTemplate: null,
                groupMappings: [],
                policySource: null,
            },
            expect.any(Object),
        );
        mutate.mock.calls[0][1].onSuccess();
        expect(toast).toHaveBeenCalledWith({
            title: 'Agent session requirement saved.',
        });
    });
    it('shows a saved requirement and personal sign-out, and preserves the policy source when disabled', () => {
        configured = true;
        credentials = [snowflakeCredential];
        const policySource = {
            label: 'Warehouse rules',
            url: 'https://example.com/rules',
        };
        renderSettings(
            {
                ...policy,
                principalKind: AiPrincipalKind.PERSON,
                groupMappings: [],
                policySource,
            },
            snowflakeCapabilities,
        );
        const toggle = screen.getByRole('switch', {
            name: /^Require verified agent sessions/,
        });
        expect(toggle).toBeChecked();
        expect(
            screen.getByText(/You are signed in for agent sessions since/),
        ).toHaveTextContent(
            new Date(snowflakeCredential.createdAt).toLocaleDateString(),
        );
        expect(
            screen.queryByRole('button', { name: 'Test agent marker' }),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
        expect(remove).toHaveBeenCalledWith(undefined, expect.any(Object));
        fireEvent.click(toggle);
        expect(mutate).toHaveBeenCalledWith(
            {
                enabled: false,
                principalKind: AiPrincipalKind.PERSON,
                transport: { kind: AiTransportKind.DIRECT },
                sharedRef: null,
                twinNameTemplate: null,
                groupMappings: [],
                policySource,
            },
            expect.any(Object),
        );
    });
    it('checks the signed-in warehouse session automatically and shows progress', async () => {
        configured = true;
        credentials = [snowflakeCredential];
        let finish: (value: {
            ok: boolean;
            message: string;
        }) => void = () => {};
        vi.mocked(lightdashApi).mockReturnValue(
            new Promise((resolve) => {
                finish = resolve;
            }),
        );
        renderSettings(null, snowflakeCapabilities);
        expect(
            screen.getByText('Checking the warehouse session…'),
        ).toBeInTheDocument();
        expect(lightdashApi).toHaveBeenCalledWith({
            version: 'v2',
            url: '/projects/project/ai-access/marker/test',
            method: 'POST',
            body: undefined,
        });
        await act(async () =>
            finish({ ok: true, message: 'Verified by the warehouse.' }),
        );
        expect(
            await screen.findByText('Verified by the warehouse.'),
        ).toBeInTheDocument();
    });
    it('shows the verified fallback and keeps sign-out available', async () => {
        configured = true;
        credentials = [snowflakeCredential];
        vi.mocked(lightdashApi).mockResolvedValue({ ok: true, message: '' });
        renderSettings(null, snowflakeCapabilities);
        expect(
            await screen.findByText(
                'Verified: the warehouse session carries the agent marker.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Sign out' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Check again' }),
        ).not.toBeInTheDocument();
    });
    it('shows a failed marker and checks again on request', async () => {
        configured = true;
        credentials = [snowflakeCredential];
        vi.mocked(lightdashApi).mockResolvedValueOnce({
            ok: false,
            message: 'The session is not marked.',
        });
        renderSettings(null, snowflakeCapabilities);
        expect(
            await screen.findByText('The session is not marked.'),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
        expect(
            await screen.findByText(
                'The warehouse session carries the agent marker.',
            ),
        ).toBeInTheDocument();
        expect(lightdashApi).toHaveBeenCalledTimes(2);
    });
    it('shows API errors inline without an automatic retry', async () => {
        configured = true;
        credentials = [snowflakeCredential];
        vi.mocked(lightdashApi).mockRejectedValue({
            error: { message: 'The warehouse is unavailable.' },
        });
        renderSettings(null, snowflakeCapabilities);
        expect(
            await screen.findByText('The warehouse is unavailable.'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Check again' }),
        ).toBeInTheDocument();
        await waitFor(() => expect(lightdashApi).toHaveBeenCalledTimes(1));
    });
    it('waits for sign-in and refreshes cached checks when login invalidates access', async () => {
        const initialProps: { credentialUuid: string | undefined } = {
            credentialUuid: undefined,
        };
        const { result, rerender } = renderHookWithProviders(
            ({ credentialUuid }: { credentialUuid: string | undefined }) => ({
                check: useAiMarkerCheck(
                    'project',
                    'connection',
                    credentialUuid,
                ),
                client: useQueryClient(),
            }),
            undefined,
            { initialProps },
        );
        expect(lightdashApi).not.toHaveBeenCalled();
        rerender({ credentialUuid: snowflakeCredential.uuid });
        await waitFor(() => expect(result.current.check.isSuccess).toBe(true));
        expect(result.current.check.isStale).toBe(false);
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project/ai-access/marker/test?connection=connection',
            }),
        );
        await act(async () => {
            await result.current.client.invalidateQueries(['ai-access']);
        });
        expect(lightdashApi).toHaveBeenCalledTimes(2);
    });
});
