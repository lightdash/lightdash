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
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('serviceAccounts');
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
                            : t('scim.tokens.noExpirationDate')}
                    </span>
                    {rotatedAt && (
                        <Tooltip
                            position="top"
                            maw={350}
                            label={t('table.lastRotatedAt', {
                                date: formatTimestamp(rotatedAt),
                            })}
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
                    <span>{t('scim.tokens.neverUsed')}</span>
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
    const { t } = useTranslation('serviceAccounts');
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
            <Paper className={tableStyles.paper}>
                <Table
                    className={`${tableStyles.root} ${tableStyles.alignLastTdRight}`}
                >
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th className={classesModule.nameColumn}>
                                {t('scim.tokens.name')}
                            </Table.Th>
                            <Table.Th className={classesModule.dateColumn}>
                                {t('scim.tokens.expirationDate')}
                            </Table.Th>
                            <Table.Th className={classesModule.dateColumn}>
                                {t('table.headers.lastUsedAt')}
                            </Table.Th>
                            <Table.Th>{t('scim.tokens.uuid')}</Table.Th>
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
                title={t('scim.tokens.deleteTitle')}
                variant="delete"
                resourceType={t('scim.tokens.resourceType')}
                resourceLabel={tokenToDelete?.description}
                cancelDisabled={isDeleting}
                onConfirm={() => mutate(tokenToDelete?.uuid ?? '')}
                confirmLoading={isDeleting}
            />
        </>
    );
};
