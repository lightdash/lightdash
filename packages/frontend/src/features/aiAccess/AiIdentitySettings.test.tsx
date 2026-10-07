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
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { AiIdentitySettings } from './AiIdentitySettings';
const mutate = vi.fn();
const login = vi.fn();
const remove = vi.fn();
const toast = vi.fn();
let separateEnabled = true;
let configured = false;
let credentials: UserWarehouseCredentials[] = [];
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: separateEnabled } }),
}));
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
vi.mock('./AiPrincipals', () => ({
    Principals: () => <div>Principal table</div>,
    PrincipalsEmptyState: () => <div>Principals empty state</div>,
}));
vi.mock('./AiMarkerTest', () => ({
    AiMarkerTest: () => <div>Marker test</div>,
}));
vi.mock('./AiSetupScriptDrawer', () => ({ AiSetupScriptDrawer: () => null }));
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
describe('Agent identity draft', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        separateEnabled = true;
        configured = false;
        credentials = [];
    });
    it.each([AiPrincipalKind.GROUP, AiPrincipalKind.TWIN])(
        'replaces an API-created %s setup with one principal after confirmation',
        (principalKind) => {
            renderSettings({
                ...policy,
                principalKind,
                groupMappings:
                    principalKind === AiPrincipalKind.GROUP
                        ? policy.groupMappings
                        : [],
                twinNameTemplate:
                    principalKind === AiPrincipalKind.TWIN
                        ? 'ai_{user_uuid}'
                        : null,
            });
            expect(screen.getByLabelText('Principal reference')).toHaveValue(
                '',
            );
            expect(
                screen.getByText(/Agents run as a per-group or per-person/),
            ).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
            fireEvent.change(screen.getByLabelText('Principal reference'), {
                target: { value: 'ai_shared' },
            });
            fireEvent.click(screen.getByRole('button', { name: 'Save' }));
            expect(
                screen.getByText('Replace principal setup?'),
            ).toBeInTheDocument();
            expect(mutate).not.toHaveBeenCalled();
            fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
            expect(mutate).not.toHaveBeenCalled();
            fireEvent.click(screen.getByRole('button', { name: 'Save' }));
            fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
            expect(mutate).toHaveBeenCalledWith(
                {
                    enabled: true,
                    principalKind: AiPrincipalKind.SHARED,
                    transport: { kind: AiTransportKind.DIRECT },
                    sharedRef: 'ai_shared',
                    twinNameTemplate: null,
                    groupMappings: [],
                    policySource: null,
                },
                expect.any(Object),
            );
        },
    );
    it('keeps a saved shared reference and saves edits without confirmation', () => {
        renderSettings({
            ...policy,
            principalKind: AiPrincipalKind.SHARED,
            sharedRef: 'ai_shared',
            groupMappings: [],
        });
        expect(screen.getByLabelText('Principal reference')).toHaveValue(
            'ai_shared',
        );
        expect(
            screen.getByText(/Agents run as the separate principal/),
        ).toHaveTextContent('ai_shared');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(
            screen.queryByText(/Switch.*marked person/),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Principal table')).toBeInTheDocument();
        expect(screen.queryByText('Marker test')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Principal reference'), {
            target: { value: 'ai_other' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(mutate).toHaveBeenCalledWith(
            expect.objectContaining({
                principalKind: AiPrincipalKind.SHARED,
                sharedRef: 'ai_other',
            }),
            expect.any(Object),
        );
    });
    it.each([
        null,
        { ...policy, principalKind: AiPrincipalKind.PERSON, groupMappings: [] },
    ])(
        'shows the principal form and warning without a principal policy',
        (saved) => {
            renderSettings(saved);
            expect(
                screen.getByText(
                    'Agents need a separate principal on this warehouse.',
                ),
            ).toBeInTheDocument();
            expect(
                screen.getByText(
                    'The marker identifies agent queries here but cannot restrict them.',
                ),
            ).toBeInTheDocument();
            expect(screen.getByRole('alert')).toHaveTextContent(
                'Agents currently run as the person with no restriction.',
            );
            expect(screen.getByLabelText('Principal reference')).toBeEnabled();
            expect(screen.getByText('Transport')).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Setup script' }),
            ).toBeEnabled();
            expect(
                screen.queryByText(/Need a hard boundary/),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText(/Switch.*marked person/),
            ).not.toBeInTheDocument();
            expect(screen.queryByText('Marker test')).not.toBeInTheDocument();
            expect(
                screen.getByText('Principals empty state'),
            ).toBeInTheDocument();
            fireEvent.change(screen.getByLabelText('Principal reference'), {
                target: { value: 'ai_shared' },
            });
            fireEvent.click(screen.getByRole('button', { name: 'Save' }));
            expect(mutate).toHaveBeenCalledWith(
                expect.objectContaining({
                    principalKind: AiPrincipalKind.SHARED,
                    sharedRef: 'ai_shared',
                }),
                expect.any(Object),
            );
        },
    );
    it.each([AiAgentMarkerLevel.REQUEST_BOUND])(
        'keeps the marked person and marker test without controls for %s',
        (level) => {
            renderSettings(null, {
                ...capabilities,
                marker: { ...capabilities.marker, level },
            });
            expect(
                screen.getByText('Agents run as the marked person'),
            ).toBeInTheDocument();
            expect(
                screen.getByText(
                    "The marker is fixed by the request. Enforcement needs your warehouse's access control plugin or policy to read it.",
                ),
            ).toBeInTheDocument();
            expect(
                within(
                    screen.getByRole('heading', { name: 'Identity' })
                        .parentElement!.parentElement!,
                ).queryByRole('button'),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByLabelText('Principal reference'),
            ).not.toBeInTheDocument();
            expect(screen.getByText('Marker test')).toBeInTheDocument();
        },
    );
    it.each([
        WarehouseTypes.REDSHIFT,
        WarehouseTypes.BIGQUERY,
        WarehouseTypes.DATABRICKS,
        WarehouseTypes.ATHENA,
        WarehouseTypes.CLICKHOUSE,
    ])(
        'disables the form and explains unavailable shared principals on %s',
        (warehouseType) => {
            renderSettings(null, {
                ...capabilities,
                warehouseType,
                principals: {
                    ...capabilities.principals,
                    shared: {
                        available: false,
                        reason: 'Separate principals are coming soon.',
                    },
                },
            });
            expect(
                screen.getByText(
                    'Agents need a separate principal on this warehouse.',
                ),
            ).toBeInTheDocument();
            expect(
                screen.getByText(
                    'The marker identifies agent queries here but cannot restrict them.',
                ),
            ).toBeInTheDocument();
            expect(screen.getByRole('alert')).toHaveTextContent(
                'Agents currently run as the person with no restriction.',
            );
            expect(screen.getByLabelText('Principal reference')).toBeDisabled();
            expect(
                screen.getByRole('radio', { name: 'Direct' }),
            ).toBeDisabled();
            expect(
                screen.getByRole('radio', { name: 'Procedure' }),
            ).toBeDisabled();
            expect(
                screen.getByText('Separate principals are coming soon.'),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Save' }),
            ).not.toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Setup script' }),
            ).toBeDisabled();
            expect(screen.queryByText('Marker test')).not.toBeInTheDocument();
            expect(
                screen.getByText('Principals empty state'),
            ).toBeInTheDocument();
        },
    );
    it('shows the dotted message without Identity controls or Test for no marker', () => {
        renderSettings(policy, {
            ...capabilities,
            principals: {
                ...capabilities.principals,
                shared: { available: false, reason: 'Unavailable' },
            },
            marker: { ...capabilities.marker, level: AiAgentMarkerLevel.NONE },
        });
        expect(
            screen.getByText('This warehouse cannot mark agent queries.')
                .parentElement,
        ).toHaveAttribute('data-variant', 'dotted');
        expect(
            within(
                screen.getByRole('heading', { name: 'Identity' }).parentElement!
                    .parentElement!,
            ).queryByRole('button'),
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Test')).not.toBeInTheDocument();
    });
});

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
        separateEnabled = false;
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
    it.each([
        AiAgentMarkerLevel.REQUEST_BOUND,
        AiAgentMarkerLevel.IDENTIFY_ONLY,
        AiAgentMarkerLevel.NONE,
    ])(
        'shows only the marked-person statement for %s with separate principals off',
        (level) => {
            renderSettings(
                {
                    ...policy,
                    principalKind: AiPrincipalKind.SHARED,
                    sharedRef: 'ai_shared',
                    groupMappings: [],
                },
                { ...capabilities, marker: { ...capabilities.marker, level } },
            );
            const card = within(
                screen.getByRole('heading', { name: 'Identity' }).parentElement!
                    .parentElement!,
            );
            expect(
                card.getByText('Agents run as the marked person.'),
            ).toBeInTheDocument();
            expect(card.queryByRole('alert')).not.toBeInTheDocument();
            expect(card.queryByRole('button')).not.toBeInTheDocument();
            expect(
                card.queryByLabelText('Principal reference'),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText('Principal table'),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText('Principals empty state'),
            ).not.toBeInTheDocument();
        },
    );
});
