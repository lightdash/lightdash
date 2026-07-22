import { type OrganizationWarehouseCredentials } from '@lightdash/common';
import { ActionIcon, Group, Paper, Table } from '@mantine-8/core';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { type Dispatch, type FC, type SetStateAction } from 'react';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import MantineIcon from '../../common/MantineIcon';
import { getWarehouseLabel } from '../../ProjectConnection/ProjectConnectFlow/utils';

type CredentialsTableProps = {
    credentials: OrganizationWarehouseCredentials[];
    setWarehouseCredentialsToBeEdited: Dispatch<
        SetStateAction<OrganizationWarehouseCredentials | undefined>
    >;
    setWarehouseCredentialsToBeDeleted: Dispatch<
        SetStateAction<OrganizationWarehouseCredentials | undefined>
    >;
};

const CredentialsItem: FC<
    {
        credentials: OrganizationWarehouseCredentials;
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
    <Table.Tr>
        <Table.Td fw={500}>{credentials.name}</Table.Td>
        <Table.Td>{credentials.description || '-'}</Table.Td>
        <Table.Td>{getWarehouseLabel(credentials.warehouseType)}</Table.Td>
        <Table.Td
            style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
            }}
        >
            <Group>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    onClick={() =>
                        setWarehouseCredentialsToBeEdited(credentials)
                    }
                >
                    <MantineIcon icon={IconEdit} />
                </ActionIcon>

                <ActionIcon
                    variant="subtle"
                    color="gray"
                    onClick={() =>
                        setWarehouseCredentialsToBeDeleted(credentials)
                    }
                >
                    <MantineIcon icon={IconTrash} />
                </ActionIcon>
            </Group>
        </Table.Td>
    </Table.Tr>
);

export const CredentialsTable: FC<CredentialsTableProps> = ({
    credentials,
    setWarehouseCredentialsToBeEdited,
    setWarehouseCredentialsToBeDeleted,
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
                        <Table.Th>Description</Table.Th>
                        <Table.Th>Warehouse</Table.Th>
                        <Table.Th />
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {credentials?.map((c) => (
                        <CredentialsItem
                            key={c.organizationWarehouseCredentialsUuid}
                            credentials={c}
                            setWarehouseCredentialsToBeEdited={
                                setWarehouseCredentialsToBeEdited
                            }
                            setWarehouseCredentialsToBeDeleted={
                                setWarehouseCredentialsToBeDeleted
                            }
                        />
                    ))}
                </Table.Tbody>
            </Table>
        </Paper>
    );
};
