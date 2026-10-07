import {
    AiAgentMarkerLevel,
    AiCredentialMethod,
    AiPrincipalKind,
    AiSetupScriptFormat,
    AiTransportKind,
    WarehouseTypes,
    type AiAccessPolicy,
    type AiWarehouseCapabilities,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { AiIdentitySettings } from './AiIdentitySettings';
import type * as AiAccessApi from './api';
const mutate = vi.fn();
const toast = vi.fn();
let configured = false;
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
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastSuccess: toast }),
}));
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
        <MemoryRouter>
            <AiIdentitySettings
                projectUuid="project"
                connection={null}
                connectionSelector={null}
                policy={saved}
                capabilities={available}
            />
        </MemoryRouter>,
    );
const snowflakeCapabilities: AiWarehouseCapabilities = {
    ...capabilities,
    warehouseType: WarehouseTypes.SNOWFLAKE,
    marker: {
        ...capabilities.marker,
        level: AiAgentMarkerLevel.VERIFIED_SESSION,
    },
};
describe('Snowflake agent identity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        configured = false;
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
    });
    it('saves the person policy immediately', () => {
        configured = true;
        renderSettings(null, snowflakeCapabilities);
        expect(
            screen.getByText('Agent sign-in integration configured.'),
        ).toBeInTheDocument();
        const toggle = screen.getByRole('switch', {
            name: /^Require verified agent sessions/,
        });
        expect(toggle).not.toBeChecked();
        expect(toggle).toBeEnabled();
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
    it('shows a saved requirement and preserves the policy source when disabled', () => {
        configured = true;
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
    it('links to personal warehouse connections in the sign-in hint', () => {
        configured = true;
        renderSettings(null, snowflakeCapabilities);
        const link = screen.getByRole('link', {
            name: 'My warehouse connections',
        });
        expect(link).toHaveAttribute(
            'href',
            '/generalSettings/myWarehouseConnections',
        );
        expect(link.parentElement).toHaveTextContent(
            'People sign in from the chat or from My warehouse connections.',
        );
        expect(screen.queryByText('Your sign-in')).not.toBeInTheDocument();
    });
});
