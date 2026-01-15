import { type UserWarehouseCredentials } from '@lightdash/common';
import { ActionIcon, Menu, Paper, Table, Text } from '@mantine-8/core';
import { IconDots, IconEdit, IconTrash } from '@tabler/icons-react';
import { type Dispatch, type FC, type SetStateAction } from 'react';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import { getWarehouseLabel } from '../../ProjectConnection/ProjectConnectFlow/utils';
import MantineIcon from '../../common/MantineIcon';

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
    <Table.Tr>
        <Table.Td>
            <Text fw={500}>{credentials.name}</Text>
        </Table.Td>
        <Table.Td>{getWarehouseLabel(credentials.credentials.type)}</Table.Td>
        <Table.Td w="1%">
            <Menu withinPortal position="bottom-end">
                <Menu.Target>
                    <ActionIcon
                        variant="transparent"
                        size="sm"
                        color="ldGray.6"
                    >
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconEdit} />}
                        onClick={() =>
                            setWarehouseCredentialsToBeEdited(credentials)
                        }
                    >
                        Edit
                    </Menu.Item>
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconTrash} />}
                        color="red"
                        onClick={() =>
                            setWarehouseCredentialsToBeDeleted(credentials)
                        }
                    >
                        Delete
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
        </Table.Td>
    </Table.Tr>
);

export const CredentialsTable: FC<CredentialsTableProps> = ({
    credentials,
    setWarehouseCredentialsToBeEdited,
    setWarehouseCredentialsToBeDeleted,
}) => {
    const { cx, classes: tableClasses } = useTableStyles();

    return (
        <Paper withBorder style={{ overflow: 'hidden' }}>
            <Table
                className={cx(tableClasses.root, tableClasses.alignLastTdRight)}
            >
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Warehouse</Table.Th>
                        <Table.Th></Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
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
                </Table.Tbody>
            </Table>
        </Paper>
    );
};
