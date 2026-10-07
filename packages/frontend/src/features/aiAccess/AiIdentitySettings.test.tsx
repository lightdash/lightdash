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
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { AiIdentitySettings } from './AiIdentitySettings';
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
vi.mock('./api', () => ({
    useUpsertAiAccessPolicy: () => ({ mutate, isLoading: false }),
}));
vi.mock('./AiMarkerTest', () => ({
    AiMarkerTest: () => <div>Marker test</div>,
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
        expect(
            screen.getByText('Sign in for agent sessions first.'),
        ).toBeInTheDocument();
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
        expect(
            screen.getByText('Sign in for agent sessions first.'),
        ).toBeInTheDocument();
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
        expect(screen.getByText('Marker test')).toBeInTheDocument();
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
});
