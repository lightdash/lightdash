import {
    TextInput,
    Stack,
    Text,
    Title,
    Button,
    Anchor,
    Tabs,
} from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy, IconKey, IconRefresh } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { SettingsGridCard } from '../../../../../components/common/Settings/SettingsCard';
import { SettingsEmptyState } from '../../../../../components/common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../../../../components/common/Settings/SettingsPage';
import useToaster from '../../../../../hooks/toaster/useToaster';
import useApp from '../../../../../providers/App/useApp';
import { useScimTokenList } from '../../hooks/useScimAccessToken';
import { SCIM_REQUEST_LOGS_QUERY_KEY } from '../../hooks/useScimRequestLogs';
import { CreateTokenModal } from './CreateTokenModal';
import { RequestLogTable } from './RequestLogTable';
import { TokensTable } from './TokensTable';

const ScimAccessTokensPanel: FC = () => {
    const { data } = useScimTokenList();
    const [isCreatingToken, setIsCreatingToken] = useState(false);
    const [activeTab, setActiveTab] = useState<'tokens' | 'request-log'>(
        'tokens',
    );
    const hasAvailableTokens = data && data.length > 0;
    const { health } = useApp();
    const { showToastSuccess } = useToaster();
    const clipboard = useClipboard({ timeout: 200 });
    const queryClient = useQueryClient();

    const scimURL = `${health?.data?.siteUrl}/api/v1/scim/v2`;

    const handleCopyToClipboard = useCallback(() => {
        clipboard.copy(scimURL);
        showToastSuccess({ title: 'Copied to clipboard!' });
    }, [scimURL, clipboard, showToastSuccess]);

    const handleRefreshLogs = useCallback(() => {
        void queryClient.invalidateQueries([SCIM_REQUEST_LOGS_QUERY_KEY]);
    }, [queryClient]);

    return (
        <SettingsPage
            title="SCIM access tokens"
            description="Connect your identity provider and manage tokens used for user provisioning."
            actions={
                activeTab === 'tokens' ? (
                    <Button size="xs" onClick={() => setIsCreatingToken(true)}>
                        Generate new token
                    </Button>
                ) : (
                    <Button
                        size="xs"
                        variant="default"
                        leftSection={<MantineIcon icon={IconRefresh} />}
                        onClick={handleRefreshLogs}
                    >
                        Refresh
                    </Button>
                )
            }
        >
            <Tabs
                value={activeTab}
                onChange={(value) =>
                    setActiveTab(
                        value === 'request-log' ? 'request-log' : 'tokens',
                    )
                }
                keepMounted={false}
            >
                <Tabs.List>
                    <Tabs.Tab value="tokens">Tokens</Tabs.Tab>
                    <Tabs.Tab value="request-log">Request log</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="tokens" pt="lg">
                    <Stack gap="lg">
                        <SettingsGridCard>
                            <Stack gap="sm">
                                <Title order={5}>SCIM URL</Title>
                                <Text c="dimmed">
                                    Use the URL to connect your identity
                                    provider to Lightdash via SCIM.
                                </Text>
                                <Anchor
                                    inherit
                                    href="https://docs.lightdash.com/references/scim-integration/"
                                    target="_blank"
                                >
                                    Learn more
                                </Anchor>
                            </Stack>
                            <TextInput
                                value={scimURL}
                                readOnly
                                rightSectionPointerEvents="all"
                                rightSection={
                                    <Button
                                        aria-label="Copy access token"
                                        onMouseDown={(event) =>
                                            event.preventDefault()
                                        }
                                        variant="subtle"
                                        onClick={handleCopyToClipboard}
                                        size="compact-sm"
                                    >
                                        <IconCopy size={16} />
                                    </Button>
                                }
                            />
                        </SettingsGridCard>

                        {hasAvailableTokens ? (
                            <TokensTable />
                        ) : (
                            <SettingsEmptyState
                                icon={IconKey}
                                title="No SCIM tokens"
                                description="Generate a token to connect your identity provider."
                            />
                        )}
                    </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="request-log" pt="lg">
                    <RequestLogTable />
                </Tabs.Panel>
            </Tabs>

            {isCreatingToken && (
                <CreateTokenModal
                    onBackClick={() => setIsCreatingToken(false)}
                />
            )}
        </SettingsPage>
    );
};

export default ScimAccessTokensPanel;
