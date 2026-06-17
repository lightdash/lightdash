import { type ExternalConnection } from '@lightdash/common';
import { ActionIcon, Group, Paper, Table, Text } from '@mantine/core';
import { IconEdit, IconTrash } from '@tabler/icons-react';
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
};

const authLabel = (type: ExternalConnection['type']): string => {
    if (type === 'api_key') return 'API key';
    if (type === 'bearer_token') return 'Bearer token';
    return 'None';
};

const ConnectionRow: FC<
    { connection: ExternalConnection } & Pick<
        Props,
        'setConnectionToEdit' | 'setConnectionToDelete'
    >
> = ({ connection, setConnectionToEdit, setConnectionToDelete }) => (
    <tr>
        <Text component="td" fw={500}>
            {connection.name}
        </Text>
        <td>{connection.origin}</td>
        <td>{authLabel(connection.type)}</td>
        <td>{connection.allowedMethods.join(', ')}</td>
        <td
            style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
            }}
        >
            <Group>
                <ActionIcon onClick={() => setConnectionToEdit(connection)}>
                    <MantineIcon icon={IconEdit} />
                </ActionIcon>
                <ActionIcon onClick={() => setConnectionToDelete(connection)}>
                    <MantineIcon icon={IconTrash} />
                </ActionIcon>
            </Group>
        </td>
    </tr>
);

export const ConnectionsTable: FC<Props> = ({
    connections,
    setConnectionToEdit,
    setConnectionToDelete,
}) => {
    const { cx, classes } = useTableStyles();
    return (
        <Paper withBorder sx={{ overflow: 'hidden' }}>
            <Table
                className={cx(classes.root, classes.alignLastTdRight)}
                ta="left"
            >
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Origin</th>
                        <th>Auth</th>
                        <th>Methods</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {connections.map((connection) => (
                        <ConnectionRow
                            key={connection.externalConnectionUuid}
                            connection={connection}
                            setConnectionToEdit={setConnectionToEdit}
                            setConnectionToDelete={setConnectionToDelete}
                        />
                    ))}
                </tbody>
            </Table>
        </Paper>
    );
};
