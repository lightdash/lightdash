import {
    formatDate,
    formatTimestamp,
    type PersonalAccessToken,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Button,
    CopyButton,
    Flex,
    Group,
    Menu,
    Modal,
    Paper,
    Select,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconCheck,
    IconCopy,
    IconDots,
    IconInfoCircle,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useState,
    type Dispatch,
    type FC,
    type SetStateAction,
} from 'react';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import {
    useAccessToken,
    useDeleteAccessToken,
    useRotateAccessToken,
} from '../../../hooks/useAccessToken';
import DocumentationHelpButton from '../../DocumentationHelpButton';
import MantineIcon from '../../common/MantineIcon';
import { useExpireOptions } from './useExpireOptions';

const TokenItem: FC<{
    token: PersonalAccessToken;
    setTokenToDelete: Dispatch<SetStateAction<PersonalAccessToken | undefined>>;
    setTokenToCopy: Dispatch<SetStateAction<PersonalAccessToken | undefined>>;
    setTokenToRotate: Dispatch<SetStateAction<PersonalAccessToken | undefined>>;
}> = ({ token, setTokenToDelete, setTokenToCopy, setTokenToRotate }) => {
    const { description, expiresAt, rotatedAt, lastUsedAt } = token;

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
                <td width="1%">
                    <Menu withinPortal position="bottom-end">
                        <Menu.Target>
                            <ActionIcon
                                variant="transparent"
                                size="sm"
                                color="gray.6"
                            >
                                <MantineIcon icon={IconDots} />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item
                                icon={<MantineIcon icon={IconCopy} />}
                                onClick={() => setTokenToCopy(token)}
                            >
                                Copy token UUID
                            </Menu.Item>
                            {token.expiresAt && (
                                <Menu.Item
                                    icon={<MantineIcon icon={IconRefresh} />}
                                    onClick={() => setTokenToRotate(token)}
                                >
                                    Rotate token
                                </Menu.Item>
                            )}
                            <Menu.Item
                                icon={<MantineIcon icon={IconTrash} />}
                                color="red"
                                onClick={() => setTokenToDelete(token)}
                            >
                                Delete
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </td>
            </tr>
        </>
    );
};

const RotateTokenForm: FC<{
    token: PersonalAccessToken | undefined;
    onCancel: () => void;
}> = ({ token, onCancel }) => {
    const {
        mutate: rotateToken,
        isLoading,
        isSuccess,
        data: rotatedTokenData,
    } = useRotateAccessToken();

    const onRotate = useCallback(
        (expiresAt: string) => {
            if (token) {
                rotateToken({
                    tokenUuid: token.uuid,
                    expiresAt,
                });
            }
        },
        [token, rotateToken],
    );

    const expireOptions = useExpireOptions();

    const form = useForm({
        initialValues: {
            expiresAt: expireOptions[0]?.value || '30',
        },
    });

    const handleOnSubmit = form.onSubmit(({ expiresAt }) => {
        const currentDate = new Date();
        const dateWhenExpires = new Date(
            currentDate.setDate(currentDate.getDate() + Number(expiresAt)),
        );
        onRotate(dateWhenExpires.toISOString());
    });

    if (isSuccess && rotatedTokenData) {
        return (
            <Stack spacing="md">
                <Alert icon={<MantineIcon icon={IconCheck} />} color="green">
                    Token rotated successfully! Your old token is now invalid.
                </Alert>

                <TextInput
                    label="New Token"
                    readOnly
                    className="sentry-block ph-no-capture"
                    value={rotatedTokenData.token}
                    rightSection={
                        <CopyButton value={rotatedTokenData.token}>
                            {({ copied, copy }) => (
                                <Tooltip
                                    label={copied ? 'Copied' : 'Copy'}
                                    withArrow
                                    position="right"
                                >
                                    <ActionIcon
                                        color={copied ? 'teal' : 'gray'}
                                        onClick={copy}
                                    >
                                        <MantineIcon
                                            icon={copied ? IconCheck : IconCopy}
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </CopyButton>
                    }
                />

                <Alert icon={<MantineIcon icon={IconInfoCircle} />}>
                    Make sure to copy your new token now. You won't be able to
                    see it again!
                </Alert>

                <Flex gap="sm" justify="flex-end">
                    <Button onClick={onCancel}>Done</Button>
                </Flex>
            </Stack>
        );
    }

    return (
        <form onSubmit={handleOnSubmit}>
            <Stack spacing="md">
                <Alert
                    icon={<MantineIcon icon={IconInfoCircle} />}
                    color="blue"
                    variant="light"
                >
                    <Stack spacing="xs">
                        <Text fw={500}>
                            Rotating token: {token?.description}
                        </Text>
                        <Text size="sm">
                            This will generate a new token and invalidate the
                            current one. You must specify a new expiration date.
                        </Text>
                    </Stack>
                </Alert>

                <Select
                    withinPortal
                    label="New Expiration"
                    data={expireOptions}
                    required
                    disabled={isLoading}
                    {...form.getInputProps('expiresAt')}
                />

                <Flex gap="sm" justify="flex-end">
                    <Button
                        variant="outline"
                        onClick={onCancel}
                        disabled={isLoading}
                    >
                        Cancel
                    </Button>
                    <Button type="submit" loading={isLoading} color="blue">
                        Rotate Token
                    </Button>
                </Flex>
            </Stack>
        </form>
    );
};

export const TokensTable = () => {
    const { data } = useAccessToken();

    const { cx, classes } = useTableStyles();

    const [tokenToDelete, setTokenToDelete] = useState<
        PersonalAccessToken | undefined
    >();
    const [tokenToCopy, setTokenToCopy] = useState<
        PersonalAccessToken | undefined
    >();
    const [tokenToRotate, setTokenToRotate] = useState<
        PersonalAccessToken | undefined
    >();

    const { mutate, isLoading: isDeleting, isSuccess } = useDeleteAccessToken();

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
                            <th>Description</th>
                            <th>Expiration date</th>
                            <th>Last used at</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {data?.map((token) => (
                            <TokenItem
                                key={token.uuid}
                                token={token}
                                setTokenToDelete={setTokenToDelete}
                                setTokenToCopy={setTokenToCopy}
                                setTokenToRotate={setTokenToRotate}
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

            <Modal
                opened={!!tokenToCopy}
                onClose={() => setTokenToCopy(undefined)}
                title={
                    <Title order={4}>
                        Token UUID{' '}
                        {tokenToCopy?.description
                            ? `for "${tokenToCopy.description}"`
                            : ''}
                    </Title>
                }
                size="md"
            >
                <Stack spacing="lg">
                    <Alert
                        icon={<MantineIcon icon={IconInfoCircle} />}
                        color="blue"
                        variant="light"
                    >
                        <Stack spacing="xs">
                            <Text fw={500}>What is a token UUID?</Text>
                            <Text size="sm">
                                The UUID is a unique identifier for your token,
                                used for token rotation via the CLI{' '}
                                <DocumentationHelpButton
                                    href="https://docs.lightdash.com/references/personal_tokens#rotating-a-personal-access-token"
                                    tooltipProps={{
                                        label: 'Learn about token rotation',
                                    }}
                                />
                                . This is <strong>not</strong> your Personal
                                Access Token value.
                            </Text>
                        </Stack>
                    </Alert>

                    <Group spacing="sm">
                        <Text
                            family="monospace"
                            size="sm"
                            bg="white"
                            p="xs"
                            style={{
                                borderRadius: 4,
                                border: '1px solid #e9ecef',
                            }}
                        >
                            {tokenToCopy?.uuid}
                        </Text>
                        <CopyButton value={tokenToCopy?.uuid ?? ''}>
                            {({ copied, copy }) => (
                                <Tooltip
                                    label={copied ? 'Copied!' : 'Copy UUID'}
                                    withArrow
                                    position="top"
                                >
                                    <ActionIcon
                                        size="sm"
                                        onClick={copy}
                                        variant={copied ? 'filled' : 'light'}
                                        color={copied ? 'teal' : 'blue'}
                                    >
                                        <MantineIcon
                                            icon={copied ? IconCheck : IconCopy}
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </CopyButton>
                    </Group>

                    <Flex gap="sm" justify="flex-end">
                        <Button
                            variant="light"
                            onClick={() => setTokenToCopy(undefined)}
                        >
                            Done
                        </Button>
                    </Flex>
                </Stack>
            </Modal>

            <Modal
                opened={!!tokenToRotate}
                onClose={() => setTokenToRotate(undefined)}
                title={<Title order={4}>Rotate token</Title>}
                size="md"
            >
                {!!tokenToRotate ? (
                    <RotateTokenForm
                        key={tokenToRotate?.uuid}
                        token={tokenToRotate}
                        onCancel={() => setTokenToRotate(undefined)}
                    />
                ) : null}
            </Modal>
        </>
    );
};
