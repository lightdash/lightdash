import { ActionIcon, Group, Paper, Table, Text } from '@mantine/core';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { Dispatch, FC, SetStateAction } from 'react';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import MantineIcon from '../../common/MantineIcon';
import { Credentials } from './types';

type CredentialsTableProps = {
    credentials: Pick<Credentials, 'name' | 'username'>[];
    setWarehouseCredentialsToBeEdited: Dispatch<
        SetStateAction<Pick<Credentials, 'name' | 'username'> | undefined>
    >;
    setWarehouseCredentialsToBeDeleted: Dispatch<
        SetStateAction<string | undefined>
    >;
};

const CredentialsItem: FC<
    {
        credentials: Pick<Credentials, 'name' | 'username'>;
    } & Pick<
        CredentialsTableProps,
        | 'setWarehouseCredentialsToBeDeleted'
        | 'setWarehouseCredentialsToBeEdited'
    >
> = ({
    credentials,
    setWarehouseCredentialsToBeDeleted,
    setWarehouseCredentialsToBeEdited,
}) => (
    <tr>
        <Text component="td" fw={500}>
            {credentials.name}
        </Text>

        <td
            style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
            }}
        >
            <Group>
                <ActionIcon
                    onClick={() =>
                        setWarehouseCredentialsToBeEdited(credentials)
                    }
                >
                    <MantineIcon icon={IconEdit} />
                </ActionIcon>

                <ActionIcon
                    onClick={() =>
                        setWarehouseCredentialsToBeDeleted(credentials.name)
                    }
                >
                    <MantineIcon icon={IconTrash} />
                </ActionIcon>
            </Group>
        </td>
    </tr>
);

export const CredentialsTable: FC<CredentialsTableProps> = ({
    credentials,
    setWarehouseCredentialsToBeEdited,
    setWarehouseCredentialsToBeDeleted,
}) => {
    const { cx, classes } = useTableStyles();

    return (
        <Paper withBorder sx={{ overflow: 'hidden' }}>
            <Table className={cx(classes.root, classes.alignLastTdRight)}>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {credentials?.map((c) => (
                        <CredentialsItem
                            key={c.name}
                            credentials={c}
                            setWarehouseCredentialsToBeEdited={
                                setWarehouseCredentialsToBeEdited
                            }
                            setWarehouseCredentialsToBeDeleted={
                                setWarehouseCredentialsToBeDeleted
                            }
                        />
                    ))}
                </tbody>
            </Table>
        </Paper>
    );
};
