import {
    formatDate,
    formatTimestamp,
    type ServiceAccount,
} from '@lightdash/common';
import { ActionIcon, Group, Paper, Table, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle, IconTrash } from '@tabler/icons-react';
import {
    useEffect,
    useState,
    type Dispatch,
    type FC,
    type SetStateAction,
} from 'react';
import { CopyActionIcon } from '../../../../../components/common/CopyActionIcon';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import tableStyles from '../../../../../hooks/styles/tableStyles.module.css';
import {
    useDeleteScimToken,
    useScimTokenList,
} from '../../hooks/useScimAccessToken';
import classesModule from './TokensTable.module.css';

const TokenItem: FC<{
    token: ServiceAccount;
    setTokenToDelete: Dispatch<SetStateAction<ServiceAccount | undefined>>;
}> = ({ token, setTokenToDelete }) => {
    const { description, expiresAt, rotatedAt, lastUsedAt, uuid } = token;
    return (
        <Table.Tr>
            <Table.Td>
                <Text fw={500} fz="sm">
                    {description}
                </Text>
            </Table.Td>

            <Table.Td>
                <Group gap="xs">
                    <span>
                        {expiresAt
                            ? formatDate(expiresAt)
                            : 'No expiration date'}
                    </span>
                    {rotatedAt && (
                        <Tooltip
                            position="top"
                            maw={350}
                            label={`Last rotated at ${formatTimestamp(
                                rotatedAt,
                            )}`}
                        >
                            <MantineIcon
                                icon={IconInfoCircle}
                                color="dimmed"
                                size="md"
                            />
                        </Tooltip>
                    )}
                </Group>
            </Table.Td>
            <Table.Td>
                {lastUsedAt ? (
                    <Tooltip
                        position="top"
                        maw={350}
                        label={formatTimestamp(lastUsedAt)}
                    >
                        <span>{formatDate(lastUsedAt)}</span>
                    </Tooltip>
                ) : (
                    <span>Never used</span>
                )}
            </Table.Td>
            <Table.Td>
                <Group gap="xs" wrap="nowrap">
                    <Tooltip position="top" maw={350} label={uuid}>
                        <Text fz="sm" className={classesModule.uuid}>
                            ...{uuid.slice(-8)}
                        </Text>
                    </Tooltip>
                    <CopyActionIcon
                        value={uuid}
                        tooltipPosition="right"
                        size="xs"
                        variant="transparent"
                    />
                </Group>
            </Table.Td>
            <Table.Td w="1%">
                <ActionIcon
                    variant="outline"
                    size="md"
                    color="red"
                    onClick={() => setTokenToDelete(token)}
                >
                    <MantineIcon icon={IconTrash} />
                </ActionIcon>
            </Table.Td>
        </Table.Tr>
    );
};

export const TokensTable = () => {
    const { data } = useScimTokenList();

    const [tokenToDelete, setTokenToDelete] = useState<
        ServiceAccount | undefined
    >();
    const { mutate, isLoading: isDeleting, isSuccess } = useDeleteScimToken();

    useEffect(() => {
        if (isSuccess) {
            setTokenToDelete(undefined);
        }
    }, [isSuccess]);

    return (
        <>
            <Paper className="ld-overflow-hidden">
                <Table
                    className={`${tableStyles.root} ${tableStyles.alignLastTdRight}`}
                >
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th className={classesModule.nameColumn}>
                                Name
                            </Table.Th>
                            <Table.Th className={classesModule.dateColumn}>
                                Expiration date
                            </Table.Th>
                            <Table.Th className={classesModule.dateColumn}>
                                Last used at
                            </Table.Th>
                            <Table.Th>UUID</Table.Th>
                            <Table.Th></Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {data?.map((token) => (
                            <TokenItem
                                key={token.uuid}
                                token={token}
                                setTokenToDelete={setTokenToDelete}
                            />
                        ))}
                    </Table.Tbody>
                </Table>
            </Paper>

            <MantineModal
                opened={!!tokenToDelete}
                onClose={() => !isDeleting && setTokenToDelete(undefined)}
                title="Delete token"
                variant="delete"
                resourceType="token"
                resourceLabel={tokenToDelete?.description}
                cancelDisabled={isDeleting}
                onConfirm={() => mutate(tokenToDelete?.uuid ?? '')}
                confirmLoading={isDeleting}
            />
        </>
    );
};
