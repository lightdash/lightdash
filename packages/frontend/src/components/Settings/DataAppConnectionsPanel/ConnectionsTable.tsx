import { assertUnreachable, type ExternalConnection } from '@lightdash/common';
import { ActionIcon, Group, Paper, Table, Text } from '@mantine-8/core';
import { IconEdit, IconFlask, IconTrash } from '@tabler/icons-react';
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
            <Text fw={500}>{connection.name}</Text>
        </Table.Td>
        <Table.Td>{connection.origin}</Table.Td>
        <Table.Td>{authLabel(connection.type)}</Table.Td>
        <Table.Td>{connection.allowedMethods.join(', ')}</Table.Td>
        <Table.Td>
            <Group justify="flex-end">
                <ActionIcon
                    title="Test / samples"
                    onClick={() => onSelectConnection(connection)}
                >
                    <MantineIcon icon={IconFlask} />
                </ActionIcon>
                <ActionIcon onClick={() => setConnectionToEdit(connection)}>
                    <MantineIcon icon={IconEdit} />
                </ActionIcon>
                <ActionIcon onClick={() => setConnectionToDelete(connection)}>
                    <MantineIcon icon={IconTrash} />
                </ActionIcon>
            </Group>
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
                        <Table.Th>Name</Table.Th>
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
