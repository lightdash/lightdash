import {
    formatDate,
    formatTimestamp,
    type ServiceAccount,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    CopyButton,
    Flex,
    Group,
    Modal,
    Paper,
    Stack,
    Table,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
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
import { useTableStyles } from '../../../../../hooks/styles/useTableStyles';
import {
    useDeleteScimToken,
    useScimTokenList,
} from '../../hooks/useScimAccessToken';

const TokenItem: FC<{
    token: ServiceAccount;
    setTokenToDelete: Dispatch<SetStateAction<ServiceAccount | undefined>>;
}> = ({ token, setTokenToDelete }) => {
    const { description, expiresAt, rotatedAt, lastUsedAt, uuid } = token;
    return (
        <>
            <tr>
                <Text component="td" fw={500}>
                    {description}
                </Text>

                <td>
                    <Group align="center" position="left" spacing="xs">
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
                                    color="gray.6"
                                    size="md"
                                />
                            </Tooltip>
                        )}
                    </Group>
                </td>
                <td>
                    {lastUsedAt && (
                        <Tooltip
                            withinPortal
                            position="top"
                            maw={350}
                            label={formatTimestamp(lastUsedAt)}
                        >
                            <Text>{formatDate(lastUsedAt)}</Text>
                        </Tooltip>
                    )}
                </td>
                <td>
                    <Group align="center" position="left" spacing="xs">
                        <Tooltip
                            withinPortal
                            position="top"
                            maw={350}
                            label={uuid}
                        >
                            <span>{uuid.substring(0, 4)}...</span>
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
                                        variant={'transparent'}
                                    >
                                        <MantineIcon
                                            color={'gray.6'}
                                            icon={copied ? IconCheck : IconCopy}
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </CopyButton>
                    </Group>
                </td>
                <td width="1%">
                    <Button
                        px="xs"
                        variant="outline"
                        size="xs"
                        color="red"
                        onClick={() => setTokenToDelete(token)}
                    >
                        <MantineIcon icon={IconTrash} />
                    </Button>
                </td>
            </tr>
        </>
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
            <Paper withBorder sx={{ overflow: 'hidden' }}>
                <Table className={cx(classes.root, classes.alignLastTdRight)}>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Expiration date</th>
                            <th>Last used at</th>
                            <th>UUID</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {data?.map((token) => (
                            <TokenItem
                                key={token.uuid}
                                token={token}
                                setTokenToDelete={setTokenToDelete}
                            />
                        ))}
                    </tbody>
                </Table>
            </Paper>

            <Modal
                opened={!!tokenToDelete}
                onClose={() => !isDeleting && setTokenToDelete(undefined)}
                title={
                    <Title order={4}>
                        Delete token {tokenToDelete?.description}
                    </Title>
                }
            >
                <Stack spacing="xl">
                    <Text>
                        Are you sure? This will permanently delete the
                        <Text fw={600} component="span">
                            {' '}
                            {tokenToDelete?.description}{' '}
                        </Text>
                        token.
                    </Text>

                    <Flex gap="sm" justify="flex-end">
                        <Button
                            color="dark"
                            variant="outline"
                            disabled={isDeleting}
                            onClick={() => setTokenToDelete(undefined)}
                        >
                            Cancel
                        </Button>
                        <Button
                            color="red"
                            disabled={isDeleting}
                            onClick={() => {
                                mutate(tokenToDelete?.uuid ?? '');
                            }}
                        >
                            Delete
                        </Button>
                    </Flex>
                </Stack>
            </Modal>
        </>
    );
};
