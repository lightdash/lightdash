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
} from '@mantine-8/core';
import { IconBrandGithub } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
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
    canChooseScope = true,
    onClose,
    onConnect,
}) => {
    const [token, setToken] = useState('');
    const [scope, setScope] = useState<AiMcpCredentialScope>('user');

    const handleClose = useCallback(() => {
        setToken('');
        onClose();
    }, [onClose]);

    const trimmedToken = token.trim();

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title="Give the agent the code behind your data"
            icon={IconBrandGithub}
            actions={
                <Button
                    leftSection={<MantineIcon icon={IconBrandGithub} />}
                    loading={isLoading}
                    disabled={!trimmedToken}
                    onClick={() => onConnect(trimmedToken, scope)}
                >
                    Connect GitHub
                </Button>
            }
        >
            <Stack gap="md">
                <Text size="sm">
                    Once connected, your agent can use your repositories to
                    enhance its understanding of your semantic layer when
                    answering questions or making changes.
                </Text>

                <Divider />

                {canChooseScope && (
                    <Stack gap={4}>
                        <Text size="sm" fw={600}>
                            Who can use this token?
                        </Text>
                        <SegmentedControl
                            fullWidth
                            size="xs"
                            value={scope}
                            onChange={(value) =>
                                setScope(value as AiMcpCredentialScope)
                            }
                            data={[
                                { label: 'Just me', value: 'user' },
                                { label: 'Whole project', value: 'shared' },
                            ]}
                        />
                        <Text size="xs" c="dimmed">
                            {scope === 'user'
                                ? 'Each user connects their own token — the agent reads code as whoever is asking.'
                                : 'One token shared by everyone using this agent.'}
                        </Text>
                    </Stack>
                )}

                <Stack gap="xs">
                    <Text size="sm" fw={600}>
                        Create a GitHub personal access token
                    </Text>
                    <List type="ordered" size="sm" spacing="xs">
                        <List.Item>
                            Open{' '}
                            <Anchor
                                href={GITHUB_FINE_GRAINED_TOKEN_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                fz="inherit"
                            >
                                GitHub → Fine-grained tokens
                            </Anchor>
                            .
                        </List.Item>
                        <List.Item>
                            Under <b>Repository access</b>, select the repos
                            that you want to give the agent access to.
                        </List.Item>
                        <List.Item>
                            Under <b>Permissions → Repository</b>, set{' '}
                            <b>Contents</b> to <b>Read-only</b>.
                        </List.Item>
                        <List.Item>
                            Generate the token and paste it below.
                        </List.Item>
                    </List>
                </Stack>

                <PasswordInput
                    label="Personal access token"
                    placeholder="github_pat_..."
                    value={token}
                    onChange={(event) => setToken(event.currentTarget.value)}
                    autoComplete="off"
                />

                <Text size="xs" c="dimmed">
                    Stored encrypted — use a read-only token scoped to only the
                    repos you need. You can remove it any time from the agent's
                    settings.
                </Text>
            </Stack>
        </MantineModal>
    );
};
