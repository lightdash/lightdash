import {
    formatDate,
    formatTimestamp,
    type PersonalAccessToken,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    CopyButton,
    Group,
    Menu,
    Paper,
    Select,
    Stack,
    Table,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
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
import Callout from '../../common/Callout';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
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
            <Table.Tr>
                <Table.Td>
                    <Text fw={500}>{description}</Text>
                </Table.Td>
                <Table.Td>
                    <Group align="center" justify="flex-start" gap="xs">
                        <span>
                            {expiresAt ? (
                                <Tooltip
                                    withinPortal
                                    position="top"
                                    maw={350}
                                    label={formatTimestamp(expiresAt)}
                                >
                                    <span>{formatDate(expiresAt)}</span>
                                </Tooltip>
                            ) : (
                                'No expiration date'
                            )}
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
                                leftSection={<MantineIcon icon={IconCopy} />}
                                onClick={() => setTokenToCopy(token)}
                            >
                                Copy token UUID
                            </Menu.Item>
                            {token.expiresAt && (
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconRefresh} />
                                    }
                                    onClick={() => setTokenToRotate(token)}
                                >
                                    Rotate token
                                </Menu.Item>
                            )}
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconTrash} />}
                                color="red"
                                onClick={() => setTokenToDelete(token)}
                            >
                                Delete
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </Table.Td>
            </Table.Tr>
        </>
    );
};

const ROTATE_TOKEN_FORM_ID = 'rotate-token-form';

interface RotateFormState {
    isLoading: boolean;
    isSuccess: boolean;
}

const RotateTokenForm: FC<{
    token: PersonalAccessToken | undefined;
    onStateChange: (state: RotateFormState) => void;
}> = ({ token, onStateChange }) => {
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

    // Report state changes to parent for modal actions
    useEffect(() => {
        onStateChange({ isLoading, isSuccess });
    }, [isLoading, isSuccess, onStateChange]);

    if (isSuccess && rotatedTokenData) {
        return (
            <Stack gap="md">
                <Callout variant="success" title="Token rotated successfully!">
                    Your old token is now invalid.
                </Callout>

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

                <Callout
                    variant="info"
                    title="Make sure to copy your new token now"
                >
                    You won't be able to see it again! Your old token is now
                    invalid.
                </Callout>
            </Stack>
        );
    }

    return (
        <form id={ROTATE_TOKEN_FORM_ID} onSubmit={handleOnSubmit}>
            <Stack gap="md">
                <Callout
                    variant="info"
                    title={`Rotating token for "${token?.description}"`}
                >
                    This will generate a new token and invalidate the current
                    one. You must specify a new expiration date.
                </Callout>

                <Select
                    label="New Expiration"
                    data={expireOptions}
                    required
                    disabled={isLoading}
                    {...form.getInputProps('expiresAt')}
                />
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
    const [rotateFormState, setRotateFormState] = useState<RotateFormState>({
        isLoading: false,
        isSuccess: false,
    });

    const { mutate, isLoading: isDeleting, isSuccess } = useDeleteAccessToken();

    const handleCloseRotateModal = useCallback(() => {
        setTokenToRotate(undefined);
        setRotateFormState({ isLoading: false, isSuccess: false });
    }, []);

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
                            <Table.Th>Description</Table.Th>
                            <Table.Th>Expiration date</Table.Th>
                            <Table.Th>Last used at</Table.Th>
                            <Table.Th></Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {data?.map((token) => (
                            <TokenItem
                                key={token.uuid}
                                token={token}
                                setTokenToDelete={setTokenToDelete}
                                setTokenToCopy={setTokenToCopy}
                                setTokenToRotate={setTokenToRotate}
                            />
                        ))}
                    </Table.Tbody>
                </Table>
            </Paper>

            <MantineModal
                opened={!!tokenToDelete}
                onClose={() => !isDeleting && setTokenToDelete(undefined)}
                title={`Delete token ${tokenToDelete?.description}`}
                icon={IconTrash}
                cancelDisabled={isDeleting}
                actions={
                    <Button
                        color="red"
                        disabled={isDeleting}
                        onClick={() => {
                            mutate(tokenToDelete?.uuid ?? '');
                        }}
                    >
                        Delete
                    </Button>
                }
            >
                <Text>
                    Are you sure? This will permanently delete the
                    <Text fw={600} component="span">
                        {' '}
                        {tokenToDelete?.description}{' '}
                    </Text>
                    token.
                </Text>
            </MantineModal>

            <MantineModal
                opened={!!tokenToCopy}
                onClose={() => setTokenToCopy(undefined)}
                title={`Token UUID ${
                    tokenToCopy?.description
                        ? `for "${tokenToCopy.description}"`
                        : ''
                }`}
                icon={IconInfoCircle}
                size="md"
                cancelLabel={false}
                actions={
                    <Button
                        variant="default"
                        onClick={() => setTokenToCopy(undefined)}
                    >
                        Done
                    </Button>
                }
            >
                <Stack gap="lg">
                    <Callout variant="info" title="What is a token UUID?">
                        <Text size="sm">
                            The UUID is a unique identifier for your token, used
                            for token rotation via the CLI{' '}
                            <DocumentationHelpButton
                                href="https://docs.lightdash.com/references/personal_tokens#rotating-a-personal-access-token"
                                tooltipProps={{
                                    label: 'Learn about token rotation',
                                }}
                            />
                            . This is <strong>not</strong> your Personal Access
                            Token value.
                        </Text>
                    </Callout>

                    <Group gap="sm">
                        <Paper p="xs" withBorder bg="ldGray.0">
                            <Text ff="monospace" size="sm">
                                {tokenToCopy?.uuid}
                            </Text>
                        </Paper>
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
                </Stack>
            </MantineModal>

            <MantineModal
                opened={!!tokenToRotate}
                onClose={handleCloseRotateModal}
                title="Rotate token"
                icon={IconRefresh}
                size="md"
                cancelLabel={rotateFormState.isSuccess ? false : 'Cancel'}
                cancelDisabled={rotateFormState.isLoading}
                actions={
                    rotateFormState.isSuccess ? (
                        <Button onClick={handleCloseRotateModal}>Done</Button>
                    ) : (
                        <Button
                            type="submit"
                            form={ROTATE_TOKEN_FORM_ID}
                            loading={rotateFormState.isLoading}
                        >
                            Rotate Token
                        </Button>
                    )
                }
            >
                {!!tokenToRotate ? (
                    <RotateTokenForm
                        key={tokenToRotate?.uuid}
                        token={tokenToRotate}
                        onStateChange={setRotateFormState}
                    />
                ) : null}
            </MantineModal>
        </>
    );
};
