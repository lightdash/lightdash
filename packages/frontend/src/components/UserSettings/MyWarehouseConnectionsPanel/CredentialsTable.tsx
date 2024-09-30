import { type UserWarehouseCredentials } from '@lightdash/common';
import { ActionIcon, Group, Paper, Table, Text } from '@mantine/core';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { type Dispatch, type FC, type SetStateAction } from 'react';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import MantineIcon from '../../common/MantineIcon';
import { getWarehouseLabel } from '../../ProjectConnection/ProjectConnectFlow/SelectWarehouse';

type CredentialsTableProps = {
    credentials: UserWarehouseCredentials[];
    setWarehouseCredentialsToBeEdited: Dispatch<
        SetStateAction<UserWarehouseCredentials | undefined>
    >;
    setWarehouseCredentialsToBeDeleted: Dispatch<
        SetStateAction<UserWarehouseCredentials | undefined>
    >;
};

const CredentialsItem: FC<
    {
        credentials: UserWarehouseCredentials;
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
        <td>{getWarehouseLabel(credentials.credentials.type)}</td>
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
                        setWarehouseCredentialsToBeDeleted(credentials)
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
            <Table
                className={cx(classes.root, classes.alignLastTdRight)}
                ta="left"
            >
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Warehouse</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {credentials?.map((c) => (
                        <CredentialsItem
                            key={c.uuid}
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
