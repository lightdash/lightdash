import {
    AI_DIRECT_TRANSPORT,
    AiAgentMarkerLevel,
    AiCredentialMethod,
    AiPrincipalKind,
    AiSetupScriptFormat,
    WarehouseTypes,
    type AiAccessPolicy,
    type AiWarehouseCapabilities,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { expect, within } from 'storybook/test';
import { SettingsPage } from '../components/common/Settings/SettingsPage';
import { AiIdentitySettings } from '../features/aiAccess/AiIdentitySettings';
import { createQueryClient } from '../providers/ReactQuery/createQueryClient';
import mockHealthResponse from '../testing/__mocks__/api/healthResponse.mock';
import AppProviderMock from '../testing/__mocks__/providers/AppProvider.mock';

const projectUuid = '3675b69e-8324-4110-bdca-059031aa8da3';
const unavailable = {
    available: false,
    reason: 'SERVICE_AGENT principals for Snowflake are coming soon.',
} as const;

const capabilities: AiWarehouseCapabilities = {
    warehouseType: WarehouseTypes.SNOWFLAKE,
    principals: {
        person: { available: true, method: AiCredentialMethod.SIGN_IN },
        twin: unavailable,
        group: unavailable,
        shared: unavailable,
    },
    transports: {
        direct: { available: true },
        procedure: {
            available: false,
            reason: 'The restricted caller procedure transport is coming soon.',
        },
    },
    setupFormat: AiSetupScriptFormat.SQL,
    marker: {
        level: AiAgentMarkerLevel.VERIFIED_SESSION,
        signals: [
            {
                name: 'Query tag',
                where: 'QUERY_HISTORY query_tag, "agent":"true"',
            },
            {
                name: 'Agentic session (person)',
                where: "SYS_CONTEXT('SNOWFLAKE$CURRENT', 'IS_AGENT_ACTIVATED')",
            },
        ],
        note: 'The warehouse verifies the session only when the person has done the AI sign-in. Other agent queries carry the query tag.',
        enforce: `CREATE ROW ACCESS POLICY agent_access AS (ai_allowed BOOLEAN)
RETURNS BOOLEAN ->
    NOT COALESCE(SYS_CONTEXT('SNOWFLAKE$CURRENT', 'IS_AGENT_ACTIVATED')::BOOLEAN, FALSE)
    OR ai_allowed;
ALTER TABLE protected_data ADD ROW ACCESS POLICY agent_access ON (ai_allowed);`,
    },
};

type ScenarioProps = {
    configured: boolean;
    ruleEnabled: boolean;
};

const SnowflakeScenario = ({ configured, ruleEnabled }: ScenarioProps) => {
    const [client] = useState(() => {
        const queryClient = createQueryClient({
            queries: {
                retry: false,
                staleTime: Infinity,
                refetchOnMount: false,
                refetchOnReconnect: false,
                refetchOnWindowFocus: false,
            },
        });
        const health = mockHealthResponse();
        queryClient.setQueryData(['health'], {
            ...health,
            siteUrl: 'https://analytics.example.com',
            auth: { ...health.auth, snowflakeAi: { enabled: configured } },
        });
        return queryClient;
    });

    const policy: AiAccessPolicy | null = configured
        ? {
              aiAccessPolicyUuid: '6775b69e-8324-4110-bdca-059031aa8da3',
              projectUuid,
              warehouseConnectionUuid: null,
              enabled: ruleEnabled,
              principalKind: AiPrincipalKind.PERSON,
              transport: AI_DIRECT_TRANSPORT,
              sharedRef: null,
              twinNameTemplate: null,
              groupMappings: [],
              policySource: null,
              createdAt: new Date(),
              updatedAt: new Date(),
          }
        : null;

    return (
        <MemoryRouter>
            <QueryClientProvider client={client}>
                <AppProviderMock>
                    <Box p="xl" maw={1120} mx="auto">
                        <SettingsPage title="Agent identity">
                            <AiIdentitySettings
                                projectUuid={projectUuid}
                                connection={null}
                                connectionSelector={null}
                                policy={policy}
                                capabilities={
                                    configured
                                        ? capabilities
                                        : {
                                              ...capabilities,
                                              principals: {
                                                  ...capabilities.principals,
                                                  person: {
                                                      available: false,
                                                      reason: 'The Snowflake sign-in for AI is not configured on this instance. Set the SNOWFLAKE_AI_OAUTH_* settings.',
                                                  },
                                              },
                                          }
                                }
                            />
                        </SettingsPage>
                    </Box>
                </AppProviderMock>
            </QueryClientProvider>
        </MemoryRouter>
    );
};

const meta = {
    title: 'Agent identity/Snowflake',
    component: SnowflakeScenario,
    parameters: { layout: 'fullscreen' },
    render: (args) => (
        <SnowflakeScenario
            key={`${args.configured}-${args.ruleEnabled}`}
            {...args}
        />
    ),
} satisfies Meta<typeof SnowflakeScenario>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BeforeSetup: Story = {
    args: { configured: false, ruleEnabled: false },
};

export const RuleOff: Story = {
    name: 'Configured, rule off',
    args: { configured: true, ruleEnabled: false },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(
            canvas.getByRole('switch', {
                name: /^Require verified agent sessions/,
            }),
        ).not.toBeChecked();
    },
};

export const RuleOn: Story = {
    name: 'Configured, rule on',
    args: { configured: true, ruleEnabled: true },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(
            canvas.getByRole('switch', {
                name: /^Require verified agent sessions/,
            }),
        ).toBeChecked();
    },
};
