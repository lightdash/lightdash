import { type AiMcpCredentialScope } from '@lightdash/common';
import {
    Anchor,
    Button,
    Divider,
    List,
    PasswordInput,
    SegmentedControl,
    Stack,
    Text,
} from '@mantine/core';
import { IconBrandGithub } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';

const GITHUB_FINE_GRAINED_TOKEN_URL =
    'https://github.com/settings/personal-access-tokens/new';

type Props = {
    opened: boolean;
    isLoading: boolean;
    canChooseScope?: boolean;
    onClose: () => void;
    onConnect: (
        personalAccessToken: string,
        credentialScope: AiMcpCredentialScope,
    ) => void;
};

export const GithubMcpConnectModal: FC<Props> = ({
    opened,
    isLoading,
    canChooseScope = false,
    onClose,
    onConnect,
}) => {
    const { t } = useTranslation('aiAgent');
    const [token, setToken] = useState('');
    const [scope, setScope] = useState<AiMcpCredentialScope>('user');

    const handleClose = useCallback(() => {
        setToken('');
        setScope('user');
        onClose();
    }, [onClose]);

    const trimmedToken = token.trim();

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title={t('githubConnect.title')}
            icon={IconBrandGithub}
            actions={
                <Button
                    leftSection={<MantineIcon icon={IconBrandGithub} />}
                    loading={isLoading}
                    disabled={!trimmedToken}
                    onClick={() => onConnect(trimmedToken, scope)}
                >
                    {t('mcpInput.github.connect')}
                </Button>
            }
        >
            <Stack gap="md">
                <Text size="sm">{t('githubConnect.intro')}</Text>

                <Divider />

                {canChooseScope && (
                    <Stack gap={4}>
                        <Text size="sm" fw={600}>
                            {t('githubConnect.whoCanUse')}
                        </Text>
                        <SegmentedControl
                            fullWidth
                            size="xs"
                            value={scope}
                            onChange={(value) =>
                                setScope(value as AiMcpCredentialScope)
                            }
                            data={[
                                {
                                    label: t('githubConnect.justMe'),
                                    value: 'user',
                                },
                                {
                                    label: t('githubConnect.wholeProject'),
                                    value: 'shared',
                                },
                            ]}
                        />
                        <Text size="xs" c="dimmed">
                            {scope === 'user'
                                ? t('githubConnect.justMeHelp')
                                : t('githubConnect.wholeProjectHelp')}
                        </Text>
                    </Stack>
                )}

                <Stack gap="xs">
                    <Text size="sm" fw={600}>
                        {t('githubConnect.createToken')}
                    </Text>
                    <List type="ordered" size="sm" spacing="xs">
                        <List.Item>
                            <Trans
                                t={t}
                                i18nKey="githubConnect.step1"
                                components={{
                                    anchor: (
                                        <Anchor
                                            href={GITHUB_FINE_GRAINED_TOKEN_URL}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        />
                                    ),
                                }}
                            />
                        </List.Item>
                        <List.Item>
                            <Trans
                                t={t}
                                i18nKey="githubConnect.step2"
                                components={{ b: <b /> }}
                            />
                        </List.Item>
                        <List.Item>
                            <Trans
                                t={t}
                                i18nKey="githubConnect.step3"
                                components={{ b: <b /> }}
                            />
                        </List.Item>
                        <List.Item>{t('githubConnect.step4')}</List.Item>
                    </List>
                </Stack>

                <PasswordInput
                    label={t('githubConnect.tokenLabel')}
                    placeholder="github_pat_..."
                    value={token}
                    onChange={(event) => setToken(event.currentTarget.value)}
                    autoComplete="off"
                />

                <Text size="xs" c="dimmed">
                    {t('githubConnect.storageNote')}
                </Text>
            </Stack>
        </MantineModal>
    );
};
