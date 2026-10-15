import {
    assertUnreachable,
    type ExternalConnection,
    type ExternalConnectionListItem,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Menu,
    Paper,
    Table,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconDots,
    IconExternalLink,
    IconPencil,
    IconTrash,
} from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { type Dispatch, type FC, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import tableStyles from '../../../hooks/styles/tableStyles.module.css';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    connections: ExternalConnectionListItem[];
    setConnectionToEdit: Dispatch<
        SetStateAction<ExternalConnection | undefined>
    >;
    setConnectionToDelete: Dispatch<
        SetStateAction<ExternalConnection | undefined>
    >;
    setConnectionToViewUsage: Dispatch<
        SetStateAction<ExternalConnectionListItem | undefined>
    >;
};

const authLabel = (
    type: ExternalConnection['type'],
    t: TFunction<'settings'>,
): string => {
    switch (type) {
        case 'none':
            return t('dataAppConnections.authTypes.none');
        case 'api_key':
            return t('dataAppConnections.authTypes.apiKey');
        case 'bearer_token':
            return t('dataAppConnections.authTypes.bearerToken');
        case 'google_service_account':
            return t('dataAppConnections.authTypes.googleServiceAccount');
        case 'oauth_client_credentials':
            return t('dataAppConnections.authTypes.oauthClientCredentials');
        default:
            return assertUnreachable(type, `Unknown auth type ${type}`);
    }
};

const accessLabel = (
    connection: ExternalConnection,
    t: TFunction<'settings'>,
): string => {
    const methods = connection.allowedMethods.join(', ');

    if (connection.allowBrowserImages) {
        return methods
            ? t('dataAppConnections.table.methodsWithPublicImages', {
                  methods,
              })
            : t('dataAppConnections.table.publicImagesOnly');
    }

    return methods || '—';
};

const linkedResourcesLabel = (
    connection: ExternalConnectionListItem,
    t: TFunction<'settings'>,
): string =>
    t('dataAppConnections.table.linkedResources', {
        dataApps: t('dataAppConnections.table.dataAppCount', {
            count: connection.linkedDataAppCount,
        }),
        chartTypes: t('dataAppConnections.table.chartTypeCount', {
            count: connection.linkedChartTypeCount,
        }),
    });

const ConnectionRow: FC<
    { connection: ExternalConnectionListItem } & Pick<
        Props,
        | 'setConnectionToEdit'
        | 'setConnectionToDelete'
        | 'setConnectionToViewUsage'
    >
> = ({
    connection,
    setConnectionToEdit,
    setConnectionToDelete,
    setConnectionToViewUsage,
}) => {
    const { t } = useTranslation('settings');
    const linkedResources = linkedResourcesLabel(connection, t);
    const dataAppCount = t('dataAppConnections.table.dataAppCount', {
        count: connection.linkedDataAppCount,
    });
    return (
        <Table.Tr>
            <Table.Td>
                <Text fw={600} fz="sm">
                    {connection.name}
                </Text>
            </Table.Td>
            <Table.Td>
                <Text fz="sm">{connection.origin}</Text>
            </Table.Td>
            <Table.Td>
                <Text fz="sm" c="dimmed">
                    {authLabel(connection.type, t)}
                </Text>
            </Table.Td>
            <Table.Td>
                <Text fz="sm" c="dimmed">
                    {accessLabel(connection, t)}
                </Text>
            </Table.Td>
            <Table.Td>
                <Tooltip
                    label={t(
                        'dataAppConnections.table.linkedResourcesTooltip',
                        {
                            resources: linkedResources,
                        },
                    )}
                >
                    <Button
                        size="compact-xs"
                        variant="subtle"
                        c="ldGray.7"
                        px={0}
                        onClick={() => setConnectionToViewUsage(connection)}
                        rightSection={
                            <MantineIcon icon={IconExternalLink} size={14} />
                        }
                        aria-label={t(
                            'dataAppConnections.table.viewLinkedResourcesAria',
                            {
                                resources: linkedResources,
                                name: connection.name,
                            },
                        )}
                    >
                        {connection.linkedChartTypeCount > 0
                            ? t(
                                  'dataAppConnections.table.linkedSummaryWithChartTypes',
                                  {
                                      dataApps: dataAppCount,
                                      chartTypes: t(
                                          'dataAppConnections.table.chartTypeCount',
                                          {
                                              count: connection.linkedChartTypeCount,
                                          },
                                      ),
                                  },
                              )
                            : dataAppCount}
                    </Button>
                </Tooltip>
            </Table.Td>
            <Table.Td>
                <Badge
                    color={
                        connection.allowDataAppBuilderLinking ? 'green' : 'gray'
                    }
                >
                    {connection.allowDataAppBuilderLinking
                        ? t('dataAppConnections.table.builderLinkingAllowed')
                        : t(
                              'dataAppConnections.table.builderLinkingAdminsOnly',
                          )}
                </Badge>
            </Table.Td>
            <Table.Td w="1%">
                <Menu position="bottom-end">
                    <Menu.Target>
                        <ActionIcon
                            variant="transparent"
                            size="sm"
                            aria-label={t(
                                'dataAppConnections.table.actionsAria',
                                {
                                    name: connection.name,
                                },
                            )}
                        >
                            <MantineIcon icon={IconDots} />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconPencil} />}
                            onClick={() => setConnectionToEdit(connection)}
                        >
                            {t('actions.edit', { ns: 'common' })}
                        </Menu.Item>
                        <Menu.Item
                            color="red"
                            leftSection={<MantineIcon icon={IconTrash} />}
                            onClick={() => setConnectionToDelete(connection)}
                        >
                            {t('actions.delete', { ns: 'common' })}
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </Table.Td>
        </Table.Tr>
    );
};

export const ConnectionsTable: FC<Props> = ({
    connections,
    setConnectionToEdit,
    setConnectionToDelete,
    setConnectionToViewUsage,
}) => {
    const { t } = useTranslation('settings');
    return (
        <Paper className={tableStyles.paper}>
            <Table
                className={`${tableStyles.root} ${tableStyles.alignLastTdRight}`}
                ta="left"
            >
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th w={300}>
                            {t('dataAppConnections.table.headers.name')}
                        </Table.Th>
                        <Table.Th>
                            {t('dataAppConnections.table.headers.origin')}
                        </Table.Th>
                        <Table.Th>
                            {t('dataAppConnections.table.headers.auth')}
                        </Table.Th>
                        <Table.Th>
                            {t('dataAppConnections.table.headers.access')}
                        </Table.Th>
                        <Table.Th>
                            {t('dataAppConnections.table.headers.linkedTo')}
                        </Table.Th>
                        <Table.Th>
                            {t(
                                'dataAppConnections.table.headers.builderLinking',
                            )}
                        </Table.Th>
                        <Table.Th></Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {connections.map((connection) => (
                        <ConnectionRow
                            key={connection.externalConnectionUuid}
                            connection={connection}
                            setConnectionToEdit={setConnectionToEdit}
                            setConnectionToDelete={setConnectionToDelete}
                            setConnectionToViewUsage={setConnectionToViewUsage}
                        />
                    ))}
                </Table.Tbody>
            </Table>
        </Paper>
    );
};
