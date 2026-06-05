import {
    formatDate,
    formatTimestamp,
    type ServiceAccount,
} from '@lightdash/common';
import {
    ActionIcon,
    CopyButton,
    Group,
    Paper,
    Table,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconCheck,
    IconCopy,
    IconInfoCircle,
    IconTrash,
} from '@tabler/icons-react';
import {
    useEffect,
    useState,
    type Dispatch,
    type FC,
    type SetStateAction,
} from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { useTableStyles } from '../../../../../hooks/styles/useTableStyles';
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
                            withinPortal
                            position="top"
                            maw={350}
                            label={`Last rotated at ${formatTimestamp(
                                rotatedAt,
                            )}`}
                        >
                            <MantineIcon
                                icon={IconInfoCircle}
                                color="ldGray.6"
                                size="md"
                            />
                        </Tooltip>
                    )}
                </Group>
            </Table.Td>
            <Table.Td>
                {lastUsedAt ? (
                    <Tooltip
                        withinPortal
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
                    <Tooltip withinPortal position="top" maw={350} label={uuid}>
                        <Text fz="sm" className={classesModule.uuid}>
                            ...{uuid.slice(-8)}
                        </Text>
                    </Tooltip>
                    <CopyButton value={uuid}>
                        {({ copied, copy }) => (
                            <Tooltip
                                label={copied ? 'Copied' : 'Copy'}
                                withArrow
                                position="right"
                            >
                                <ActionIcon
                                    size="xs"
                                    onClick={copy}
                                    variant="transparent"
                                    color="ldGray.6"
                                >
                                    <MantineIcon
                                        icon={copied ? IconCheck : IconCopy}
                                    />
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </CopyButton>
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

    const { cx, classes } = useTableStyles();

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
            <Paper withBorder style={{ overflow: 'hidden' }}>
                <Table className={cx(classes.root, classes.alignLastTdRight)}>
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
