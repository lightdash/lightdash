import {
    formatDate,
    formatTimestamp,
    type PersonalAccessToken,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Menu,
    Paper,
    Select,
    Stack,
    Table,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
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
import { Trans, useTranslation } from 'react-i18next';
import tableStyles from '../../../hooks/styles/tableStyles.module.css';
import {
    useAccessToken,
    useDeleteAccessToken,
    useRotateAccessToken,
} from '../../../hooks/useAccessToken';
import Callout from '../../common/Callout';
import { CopyActionIcon } from '../../common/CopyActionIcon';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import DocumentationHelpButton from '../../DocumentationHelpButton';
import { useExpireOptions } from './useExpireOptions';

const TokenItem: FC<{
    token: PersonalAccessToken;
    setTokenToDelete: Dispatch<SetStateAction<PersonalAccessToken | undefined>>;
    setTokenToCopy: Dispatch<SetStateAction<PersonalAccessToken | undefined>>;
    setTokenToRotate: Dispatch<SetStateAction<PersonalAccessToken | undefined>>;
}> = ({ token, setTokenToDelete, setTokenToCopy, setTokenToRotate }) => {
    const { t } = useTranslation('userSettings');
    const { description, expiresAt, rotatedAt, lastUsedAt } = token;

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
                        {expiresAt ? (
                            <Tooltip
                                position="top"
                                maw={350}
                                label={formatTimestamp(expiresAt)}
                            >
                                <span>{formatDate(expiresAt)}</span>
                            </Tooltip>
                        ) : (
                            t('accessTokensPanel.tokensTable.noExpirationDate')
                        )}
                    </span>

                    {rotatedAt && (
                        <Tooltip
                            position="top"
                            maw={350}
                            label={t(
                                'accessTokensPanel.tokensTable.lastRotatedAt',
                                {
                                    date: formatTimestamp(rotatedAt),
                                },
                            )}
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
                {lastUsedAt && (
                    <Tooltip
                        position="top"
                        maw={350}
                        label={formatTimestamp(lastUsedAt)}
                    >
                        <span>{formatDate(lastUsedAt)}</span>
                    </Tooltip>
                )}
            </Table.Td>
            <Table.Td w="1%">
                <Menu position="bottom-end">
                    <Menu.Target>
                        <ActionIcon variant="transparent" size="sm">
                            <MantineIcon icon={IconDots} />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconCopy} />}
                            onClick={() => setTokenToCopy(token)}
                        >
                            {t(
                                'accessTokensPanel.tokensTable.menu.copyTokenUuid',
                            )}
                        </Menu.Item>
                        {token.expiresAt && (
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconRefresh} />}
                                onClick={() => setTokenToRotate(token)}
                            >
                                {t(
                                    'accessTokensPanel.tokensTable.menu.rotateToken',
                                )}
                            </Menu.Item>
                        )}
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconTrash} />}
                            color="red"
                            onClick={() => setTokenToDelete(token)}
                        >
                            {t('actions.delete', { ns: 'common' })}
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </Table.Td>
        </Table.Tr>
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
    const { t } = useTranslation('userSettings');
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
                <Callout
                    variant="success"
                    title={t(
                        'accessTokensPanel.tokensTable.rotate.successTitle',
                    )}
                >
                    {t('accessTokensPanel.tokensTable.rotate.oldTokenInvalid')}
                </Callout>

                <TextInput
                    label={t('accessTokensPanel.tokensTable.rotate.newToken')}
                    readOnly
                    className="sentry-block ph-no-capture"
                    value={rotatedTokenData.token}
                    rightSection={
                        <CopyActionIcon
                            value={rotatedTokenData.token}
                            tooltipPosition="right"
                        />
                    }
                />

                <Callout
                    variant="info"
                    title={t(
                        'accessTokensPanel.tokensTable.rotate.copyNowTitle',
                    )}
                >
                    {t(
                        'accessTokensPanel.tokensTable.rotate.copyNowDescription',
                    )}
                </Callout>
            </Stack>
        );
    }

    return (
        <form id={ROTATE_TOKEN_FORM_ID} onSubmit={handleOnSubmit}>
            <Stack gap="md">
                <Callout
                    variant="info"
                    title={t(
                        'accessTokensPanel.tokensTable.rotate.rotatingTitle',
                        {
                            description: token?.description,
                        },
                    )}
                >
                    {t(
                        'accessTokensPanel.tokensTable.rotate.rotatingDescription',
                    )}
                </Callout>

                <Select
                    label={t(
                        'accessTokensPanel.tokensTable.rotate.newExpiration',
                    )}
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
    const { t } = useTranslation('userSettings');
    const { data } = useAccessToken();

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
            <Paper className={tableStyles.paper}>
                <Table
                    className={`${tableStyles.root} ${tableStyles.alignLastTdRight}`}
                >
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>
                                {t(
                                    'accessTokensPanel.tokensTable.columns.description',
                                )}
                            </Table.Th>
                            <Table.Th>
                                {t(
                                    'accessTokensPanel.tokensTable.columns.expirationDate',
                                )}
                            </Table.Th>
                            <Table.Th>
                                {t(
                                    'accessTokensPanel.tokensTable.columns.lastUsedAt',
                                )}
                            </Table.Th>
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
                title={t('accessTokensPanel.tokensTable.deleteModal.title')}
                variant="delete"
                resourceType={t(
                    'accessTokensPanel.tokensTable.deleteModal.resourceType',
                )}
                resourceLabel={tokenToDelete?.description}
                cancelDisabled={isDeleting}
                onConfirm={() => mutate(tokenToDelete?.uuid ?? '')}
                confirmDisabled={isDeleting}
            />

            <MantineModal
                opened={!!tokenToCopy}
                onClose={() => setTokenToCopy(undefined)}
                title={
                    tokenToCopy?.description
                        ? t(
                              'accessTokensPanel.tokensTable.copyModal.titleWithDescription',
                              {
                                  description: tokenToCopy.description,
                              },
                          )
                        : t('accessTokensPanel.tokensTable.copyModal.title')
                }
                icon={IconInfoCircle}
                size="md"
                cancelLabel={false}
                actions={
                    <Button
                        variant="default"
                        onClick={() => setTokenToCopy(undefined)}
                    >
                        {t('accessTokensPanel.tokensTable.done')}
                    </Button>
                }
            >
                <Stack gap="lg">
                    <Callout
                        variant="info"
                        title={t(
                            'accessTokensPanel.tokensTable.copyModal.whatIsUuidTitle',
                        )}
                    >
                        <Text size="sm">
                            <Trans
                                t={t}
                                i18nKey="accessTokensPanel.tokensTable.copyModal.whatIsUuidDescription"
                                components={{
                                    help: (
                                        <DocumentationHelpButton
                                            href="https://docs.lightdash.com/references/personal_tokens#rotating-a-personal-access-token"
                                            tooltipProps={{
                                                label: t(
                                                    'accessTokensPanel.tokensTable.copyModal.learnAboutRotation',
                                                ),
                                            }}
                                        />
                                    ),
                                    strong: <strong />,
                                }}
                            />
                        </Text>
                    </Callout>

                    <Group gap="sm">
                        <Paper p="xs" bg="ldGray.0">
                            <Text ff="monospace" size="sm">
                                {tokenToCopy?.uuid}
                            </Text>
                        </Paper>
                        <CopyActionIcon
                            value={tokenToCopy?.uuid ?? ''}
                            copyLabel={t(
                                'accessTokensPanel.tokensTable.copyModal.copyUuid',
                            )}
                            copiedLabel={t(
                                'accessTokensPanel.tokensTable.copyModal.copied',
                            )}
                            tooltipPosition="top"
                            size="sm"
                            variant="light"
                        />
                    </Group>
                </Stack>
            </MantineModal>

            <MantineModal
                opened={!!tokenToRotate}
                onClose={handleCloseRotateModal}
                title={t('accessTokensPanel.tokensTable.menu.rotateToken')}
                icon={IconRefresh}
                size="md"
                cancelLabel={
                    rotateFormState.isSuccess
                        ? false
                        : t('actions.cancel', { ns: 'common' })
                }
                cancelDisabled={rotateFormState.isLoading}
                actions={
                    rotateFormState.isSuccess ? (
                        <Button onClick={handleCloseRotateModal}>
                            {t('accessTokensPanel.tokensTable.done')}
                        </Button>
                    ) : (
                        <Button
                            type="submit"
                            form={ROTATE_TOKEN_FORM_ID}
                            loading={rotateFormState.isLoading}
                        >
                            {t('accessTokensPanel.tokensTable.rotate.submit')}
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
