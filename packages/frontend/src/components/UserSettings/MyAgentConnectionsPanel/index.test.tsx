import {
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type AiIdentitySource,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { credential } from './fixtures';
import { MyAgentConnectionsPanel } from './index';

let snowflakeSource: AiIdentitySource = 'agent_sign_in';
let bigquerySource: AiIdentitySource = 'ai_service_account';
let warehouses: (WarehouseTypes | undefined)[] = [
    WarehouseTypes.SNOWFLAKE,
    WarehouseTypes.BIGQUERY,
];
let configured = true;
let credentials: UserWarehouseCredentials[] = [];
let isInitialLoading = false;
let isError = false;

vi.mock('../../../features/aiAccess/api', () => ({
    useOrganizationAgentIdentitySettings: () => ({
        data: {
            snowflakeConfigured: configured,
            rules: [
                {
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                    source: snowflakeSource,
                },
                {
                    warehouseType: WarehouseTypes.BIGQUERY,
                    source: bigquerySource,
                },
            ],
        },
        isInitialLoading,
        isError,
    }),
}));
vi.mock('../../../hooks/useProjects', () => ({
    useProjects: () => ({
        data: warehouses.map((warehouseType) => ({ warehouseType })),
    }),
}));
vi.mock('../../../hooks/health/useHealth', () => ({
    default: () => ({
        data: { auth: { snowflakeAi: { enabled: !configured } } },
    }),
}));
vi.mock(
    '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials',
    () => ({
        useUserWarehouseCredentials: () => ({ data: credentials }),
    }),
);
vi.mock('../../../hooks/useSnowflake', () => ({
    useSnowflakeAiLoginPopup: () => ({
        mutate: vi.fn(),
        isLoading: false,
        error: null,
    }),
}));

describe('MyAgentConnectionsPanel', () => {
    beforeEach(() => {
        snowflakeSource = 'agent_sign_in';
        bigquerySource = 'ai_service_account';
        warehouses = [WarehouseTypes.SNOWFLAKE, WarehouseTypes.BIGQUERY];
        configured = true;
        credentials = [];
        isInitialLoading = false;
        isError = false;
    });
    it('shows both applicable cards and the agreed heading', () => {
        renderWithProviders(<MyAgentConnectionsPanel />);
        expect(
            screen.getByRole('heading', { name: 'My agent connections' }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Some warehouses need your agent to sign in as you, once.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'Snowflake' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'BigQuery' }),
        ).toBeInTheDocument();
    });
    it.each([
        ['agent_sign_in', true, [WarehouseTypes.SNOWFLAKE], true],
        ['marked_person', true, [WarehouseTypes.SNOWFLAKE], false],
        ['ai_service_account', true, [WarehouseTypes.SNOWFLAKE], false],
        ['agent_sign_in', false, [WarehouseTypes.SNOWFLAKE], true],
        ['agent_sign_in', true, [WarehouseTypes.BIGQUERY], false],
        ['agent_sign_in', true, [undefined], false],
        ['agent_sign_in', true, [], false],
    ] satisfies [
        AiIdentitySource,
        boolean,
        (WarehouseTypes | undefined)[],
        boolean,
    ][])(
        'gates Snowflake on rule %s, config %s and projects %j',
        (source, enabled, projectWarehouses, visible) => {
            snowflakeSource = source;
            configured = enabled;
            warehouses = projectWarehouses;
            renderWithProviders(<MyAgentConnectionsPanel />);
            expect(
                screen.queryByRole('heading', { name: 'Snowflake' }) !== null,
            ).toBe(visible);
        },
    );
    it.each([
        ['ai_service_account', [WarehouseTypes.BIGQUERY], true],
        ['marked_person', [WarehouseTypes.BIGQUERY], false],
        ['agent_sign_in', [WarehouseTypes.BIGQUERY], false],
        ['ai_service_account', [WarehouseTypes.SNOWFLAKE], false],
        ['ai_service_account', [undefined], false],
    ] satisfies [AiIdentitySource, (WarehouseTypes | undefined)[], boolean][])(
        'gates BigQuery on rule %s and projects %j',
        (source, projectWarehouses, visible) => {
            bigquerySource = source;
            warehouses = projectWarehouses;
            configured = false;
            renderWithProviders(<MyAgentConnectionsPanel />);
            expect(
                screen.queryByRole('heading', { name: 'BigQuery' }) !== null,
            ).toBe(visible);
        },
    );
    it('allows an organisation client to connect when instance health is unconfigured', () => {
        renderWithProviders(<MyAgentConnectionsPanel />);
        expect(
            screen.getByRole('button', { name: 'Connect agent' }),
        ).toBeEnabled();
    });
    it('shows unavailable setup instead of the empty state for a required Snowflake sign-in', () => {
        configured = false;
        warehouses = [WarehouseTypes.SNOWFLAKE];
        renderWithProviders(<MyAgentConnectionsPanel />);
        expect(
            screen.getByRole('heading', { name: 'Snowflake' }),
        ).toBeInTheDocument();
        expect(screen.getByText('Not available')).toBeInTheDocument();
        expect(
            screen.getByText(
                'Agent sign-in is not set up yet. Ask an admin to finish the Snowflake setup.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Connect agent' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('No agent connections needed'),
        ).not.toBeInTheDocument();
    });
    it('shows the neutral empty state when no card applies', () => {
        snowflakeSource = 'marked_person';
        bigquerySource = 'marked_person';
        renderWithProviders(<MyAgentConnectionsPanel />);
        expect(
            screen.getByText('No agent connections needed'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Your agents use your usual warehouse access.'),
        ).toBeInTheDocument();
    });
    it('uses only the AI-purpose credential', () => {
        credentials = [
            { ...credential, purpose: UserWarehouseCredentialPurpose.DEFAULT },
        ];
        const { rerender } = renderWithProviders(<MyAgentConnectionsPanel />);
        expect(screen.getByText('Not connected')).toBeInTheDocument();
        credentials = [...credentials, credential];
        rerender(<MyAgentConnectionsPanel />);
        expect(screen.getByText('Connected')).toBeInTheDocument();
    });
    it('waits for data before showing cards or the empty state', () => {
        isInitialLoading = true;
        renderWithProviders(<MyAgentConnectionsPanel />);
        expect(
            screen.queryByRole('heading', { name: 'Snowflake' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('No agent connections needed'),
        ).not.toBeInTheDocument();
    });
    it('does not describe a failed request as an empty state', () => {
        isError = true;
        renderWithProviders(<MyAgentConnectionsPanel />);
        expect(
            screen.getByText('Could not load your agent connections.'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('No agent connections needed'),
        ).not.toBeInTheDocument();
    });
});
