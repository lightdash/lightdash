import { assertUnreachable, type ExternalConnection } from '@lightdash/common';
import { ActionIcon, Menu, Paper, Table, Text } from '@mantine-8/core';
import {
    IconDots,
    IconFlask,
    IconPencil,
    IconTrash,
} from '@tabler/icons-react';
import { type Dispatch, type FC, type SetStateAction } from 'react';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    connections: ExternalConnection[];
    setConnectionToEdit: Dispatch<
        SetStateAction<ExternalConnection | undefined>
    >;
    setConnectionToDelete: Dispatch<
        SetStateAction<ExternalConnection | undefined>
    >;
    onSelectConnection: (connection: ExternalConnection) => void;
};

const authLabel = (type: ExternalConnection['type']): string => {
    switch (type) {
        case 'none':
            return 'None';
        case 'api_key':
            return 'API key';
        case 'bearer_token':
            return 'Bearer token';
        default:
            return assertUnreachable(type, `Unknown auth type ${type}`);
    }
};

const ConnectionRow: FC<
    { connection: ExternalConnection } & Pick<
        Props,
        'setConnectionToEdit' | 'setConnectionToDelete' | 'onSelectConnection'
    >
> = ({
    connection,
    setConnectionToEdit,
    setConnectionToDelete,
    onSelectConnection,
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
            <Text fz="sm" c="ldGray.6">
                {authLabel(connection.type)}
            </Text>
        </Table.Td>
        <Table.Td>
            <Text fz="sm" c="ldGray.6">
                {connection.allowedMethods.join(', ')}
            </Text>
        </Table.Td>
        <Table.Td w="1%">
            <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                    <ActionIcon
                        variant="transparent"
                        size="sm"
                        color="ldGray.6"
                        aria-label={`Actions for ${connection.name}`}
                    >
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconFlask} />}
                        onClick={() => onSelectConnection(connection)}
                    >
                        Test and sample
                    </Menu.Item>
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
    onSelectConnection,
}) => {
    const { cx, classes } = useTableStyles();
    return (
        <Paper withBorder style={{ overflow: 'hidden' }}>
            <Table
                className={cx(classes.root, classes.alignLastTdRight)}
                ta="left"
            >
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th w={300}>Name</Table.Th>
                        <Table.Th>Origin</Table.Th>
                        <Table.Th>Auth</Table.Th>
                        <Table.Th>Methods</Table.Th>
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
                            onSelectConnection={onSelectConnection}
                        />
                    ))}
                </Table.Tbody>
            </Table>
        </Paper>
    );
};
