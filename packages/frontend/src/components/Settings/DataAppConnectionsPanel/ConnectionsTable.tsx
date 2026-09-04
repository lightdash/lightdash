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
import { type Dispatch, type FC, type SetStateAction } from 'react';
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

const authLabel = (type: ExternalConnection['type']): string => {
    switch (type) {
        case 'none':
            return 'None';
        case 'api_key':
            return 'API key';
        case 'bearer_token':
            return 'Bearer token';
        case 'google_service_account':
            return 'Google service account';
        case 'oauth_client_credentials':
            return 'OAuth 2.0 client credentials';
        default:
            return assertUnreachable(type, `Unknown auth type ${type}`);
    }
};

const accessLabel = (connection: ExternalConnection): string => {
    const methods = connection.allowedMethods.join(', ');

    if (connection.allowBrowserImages) {
        return methods ? `${methods} + public images` : 'Public images only';
    }

    return methods || '—';
};

const linkedResourcesLabel = (connection: ExternalConnectionListItem): string =>
    `${connection.linkedDataAppCount} data app${
        connection.linkedDataAppCount === 1 ? '' : 's'
    } and ${connection.linkedChartTypeCount} chart type${
        connection.linkedChartTypeCount === 1 ? '' : 's'
    }`;

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
}) => (
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
                {authLabel(connection.type)}
            </Text>
        </Table.Td>
        <Table.Td>
            <Text fz="sm" c="dimmed">
                {accessLabel(connection)}
            </Text>
        </Table.Td>
        <Table.Td>
            <Tooltip
                label={`${linkedResourcesLabel(
                    connection,
                )}. Click to view the full list.`}
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
                    aria-label={`View ${linkedResourcesLabel(
                        connection,
                    )} linked to ${connection.name}`}
                >
                    {connection.linkedDataAppCount} data app
                    {connection.linkedDataAppCount === 1 ? '' : 's'}
                    {connection.linkedChartTypeCount > 0 &&
                        ` + ${connection.linkedChartTypeCount} chart type${
                            connection.linkedChartTypeCount === 1 ? '' : 's'
                        }`}
                </Button>
            </Tooltip>
        </Table.Td>
        <Table.Td>
            <Badge
                color={connection.allowDataAppBuilderLinking ? 'green' : 'gray'}
            >
                {connection.allowDataAppBuilderLinking
                    ? 'Allowed'
                    : 'Admins only'}
            </Badge>
        </Table.Td>
        <Table.Td w="1%">
            <Menu position="bottom-end">
                <Menu.Target>
                    <ActionIcon
                        variant="transparent"
                        size="sm"
                        aria-label={`Actions for ${connection.name}`}
                    >
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconPencil} />}
                        onClick={() => setConnectionToEdit(connection)}
                    >
                        Edit
                    </Menu.Item>
                    <Menu.Item
                        color="red"
                        leftSection={<MantineIcon icon={IconTrash} />}
                        onClick={() => setConnectionToDelete(connection)}
                    >
                        Delete
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
        </Table.Td>
    </Table.Tr>
);

export const ConnectionsTable: FC<Props> = ({
    connections,
    setConnectionToEdit,
    setConnectionToDelete,
    setConnectionToViewUsage,
}) => {
    return (
        <Paper className="ld-overflow-hidden">
            <Table
                className={`${tableStyles.root} ${tableStyles.alignLastTdRight}`}
                ta="left"
            >
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th w={300}>Name</Table.Th>
                        <Table.Th>Origin</Table.Th>
                        <Table.Th>Auth</Table.Th>
                        <Table.Th>Access</Table.Th>
                        <Table.Th>Linked to</Table.Th>
                        <Table.Th>Builder linking</Table.Th>
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
