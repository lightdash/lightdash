import { TextInput, Stack, Text, Title, Button, Anchor } from '@mantine-8/core';
import { useClipboard } from '@mantine-8/hooks';
import { IconCopy, IconKey } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { SettingsGridCard } from '../../../../../components/common/Settings/SettingsCard';
import { SettingsEmptyState } from '../../../../../components/common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../../../../components/common/Settings/SettingsPage';
import useToaster from '../../../../../hooks/toaster/useToaster';
import useApp from '../../../../../providers/App/useApp';
import { useScimTokenList } from '../../hooks/useScimAccessToken';
import { CreateTokenModal } from './CreateTokenModal';
import { TokensTable } from './TokensTable';

const ScimAccessTokensPanel: FC = () => {
    const { data } = useScimTokenList();
    const [isCreatingToken, setIsCreatingToken] = useState(false);
    const hasAvailableTokens = data && data.length > 0;
    const { health } = useApp();
    const { showToastSuccess } = useToaster();
    const clipboard = useClipboard({ timeout: 200 });

    const scimURL = `${health?.data?.siteUrl}/api/v1/scim/v2`;

    const handleCopyToClipboard = useCallback(() => {
        clipboard.copy(scimURL);
        showToastSuccess({ title: 'Copied to clipboard!' });
    }, [scimURL, clipboard, showToastSuccess]);

    return (
        <SettingsPage
            title="SCIM access tokens"
            description="Connect your identity provider and manage tokens used for user provisioning."
            actions={
                <Button size="xs" onClick={() => setIsCreatingToken(true)}>
                    Generate new token
                </Button>
            }
        >
            <SettingsGridCard>
                <Stack gap="sm">
                    <Title order={5}>SCIM URL</Title>
                    <Text c="dimmed">
                        Use the URL to connect your identity provider to
                        Lightdash via SCIM.
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
                            onMouseDown={(event) => event.preventDefault()}
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

            {isCreatingToken && (
                <CreateTokenModal
                    onBackClick={() => setIsCreatingToken(false)}
                />
            )}
        </SettingsPage>
    );
};

export default ScimAccessTokensPanel;
