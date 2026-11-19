import {
    type AiAgentIntegration,
    type ServiceAccountWithProjectAccessCount,
} from '@lightdash/common';
import { Select, Stack, Table, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconRobot } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useSlackChannels } from '../../../../hooks/slack/useSlack';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';

const DEFAULT_IDENTITY = 'default_identity';
const SERVICE_ACCOUNT_INFO =
    "Everyone in this channel gets this account's permissions. Guests and people outside your workspace can't ask.";
const INSTALLER_WARNING =
    'Everyone who asks here gets the permissions of the person who installed the Slack app. Turn on the AI Agents OAuth requirement in the Slack settings so each person uses their own permissions.';

type Props = {
    integrations: AiAgentIntegration[];
    canManageServiceAccounts: boolean;
    requireOAuth: boolean;
    onChange: (integrations: AiAgentIntegration[]) => void;
};

export const SlackChannelIdentityList: FC<Props> = ({
    integrations,
    canManageServiceAccounts,
    requireOAuth,
    onChange,
}) => {
    const lightdashApi = useLightdashApi();
    const serviceAccounts = useQuery<ServiceAccountWithProjectAccessCount[]>({
        queryKey: ['service-accounts'],
        queryFn: () =>
            lightdashApi<ServiceAccountWithProjectAccessCount[]>({
                method: 'GET',
                url: '/service-accounts',
            }),
        enabled: canManageServiceAccounts,
    });
    const channelIds = useMemo(
        () => integrations.map((i) => i.channelId),
        [integrations],
    );
    const { data: channels } = useSlackChannels('', {
        includeChannelIds: channelIds,
    });
    const channelNames = useMemo(
        () => new Map((channels ?? []).map((c) => [c.id, c.name])),
        [channels],
    );

    const options = useMemo(() => {
        const accounts = (serviceAccounts.data ?? []).map((account) => ({
            value: account.uuid,
            label: account.description,
        }));
        const known = new Set(accounts.map((a) => a.value));
        const unknown = [
            ...new Set(
                integrations
                    .map((i) => i.serviceAccountUuid)
                    .filter(
                        (uuid): uuid is string => !!uuid && !known.has(uuid),
                    ),
            ),
        ].map((uuid) => ({ value: uuid, label: 'Service account' }));
        return [
            {
                value: DEFAULT_IDENTITY,
                label: requireOAuth ? "Each person's own" : 'App installer',
            },
            ...(accounts.length + unknown.length > 0
                ? [
                      {
                          group: 'Shared service account',
                          items: [...accounts, ...unknown],
                      },
                  ]
                : []),
        ];
    }, [serviceAccounts.data, integrations, requireOAuth]);

    if (integrations.length === 0) return null;

    return (
        <Stack gap="xs">
            <Table verticalSpacing={6} horizontalSpacing="xs">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>
                            <Text size="xs" c="dimmed" fw={500}>
                                Channel
                            </Text>
                        </Table.Th>
                        <Table.Th>
                            <Text size="xs" c="dimmed" fw={500}>
                                Permissions
                            </Text>
                        </Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {integrations.map((integration) => (
                        <Table.Tr key={integration.channelId}>
                            <Table.Td>
                                <Text size="sm" fw={500}>
                                    #
                                    {channelNames.get(integration.channelId) ??
                                        integration.channelId}
                                </Text>
                            </Table.Td>
                            <Table.Td w={240}>
                                <Select
                                    size="xs"
                                    aria-label={`Permissions in #${channelNames.get(integration.channelId) ?? integration.channelId}`}
                                    data={options}
                                    value={
                                        integration.serviceAccountUuid ??
                                        DEFAULT_IDENTITY
                                    }
                                    disabled={!canManageServiceAccounts}
                                    allowDeselect={false}
                                    leftSectionPointerEvents="all"
                                    leftSection={
                                        integration.serviceAccountUuid ? (
                                            <Tooltip
                                                label={SERVICE_ACCOUNT_INFO}
                                                multiline
                                                w={280}
                                                withinPortal
                                            >
                                                <MantineIcon
                                                    icon={IconRobot}
                                                    aria-label={
                                                        SERVICE_ACCOUNT_INFO
                                                    }
                                                />
                                            </Tooltip>
                                        ) : !requireOAuth ? (
                                            <Tooltip
                                                label={INSTALLER_WARNING}
                                                multiline
                                                w={280}
                                                withinPortal
                                            >
                                                <MantineIcon
                                                    icon={IconAlertTriangle}
                                                    color="yellow.7"
                                                    aria-label={
                                                        INSTALLER_WARNING
                                                    }
                                                />
                                            </Tooltip>
                                        ) : undefined
                                    }
                                    onChange={(value) =>
                                        onChange(
                                            integrations.map((i) =>
                                                i.channelId ===
                                                integration.channelId
                                                    ? {
                                                          ...i,
                                                          serviceAccountUuid:
                                                              typeof value ===
                                                                  'string' &&
                                                              value !==
                                                                  DEFAULT_IDENTITY
                                                                  ? value
                                                                  : null,
                                                      }
                                                    : i,
                                            ),
                                        )
                                    }
                                />
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
            {!canManageServiceAccounts && (
                <Text size="xs" c="dimmed">
                    Only organization admins can change permissions.
                </Text>
            )}
        </Stack>
    );
};
