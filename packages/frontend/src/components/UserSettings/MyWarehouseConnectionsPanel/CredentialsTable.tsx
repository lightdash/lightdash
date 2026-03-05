import { ProjectType, type UserWarehouseCredentials } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Group,
    Menu,
    Paper,
    Table,
    Text,
} from '@mantine-8/core';
import { IconDots, IconEdit, IconTrash } from '@tabler/icons-react';
import { type Dispatch, type FC, type SetStateAction } from 'react';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import MantineIcon from '../../common/MantineIcon';
import { getWarehouseLabel } from '../../ProjectConnection/ProjectConnectFlow/utils';

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
        <Table.Td>
            {credentials.project ? (
                <Group gap="xs" wrap="nowrap">
                    <Text size="sm">{credentials.project.name}</Text>
                    {credentials.project.type === ProjectType.PREVIEW && (
                        <Badge size="xs" variant="light" color="orange">
                            Preview
                        </Badge>
                    )}
                </Group>
            ) : (
                <Text size="sm" c="dimmed">
                    All projects
                </Text>
            )}
        </Table.Td>
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
                        <Table.Th>Project</Table.Th>
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
