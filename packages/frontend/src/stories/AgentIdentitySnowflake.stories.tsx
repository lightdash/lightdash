import {
    AI_DIRECT_TRANSPORT,
    AiPrincipalKind,
    type AiAccessPolicy,
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
