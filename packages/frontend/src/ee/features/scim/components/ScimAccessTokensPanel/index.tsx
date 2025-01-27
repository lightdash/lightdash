import {
    Anchor,
    Button,
    Group,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import {
    SettingsCard,
    SettingsGridCard,
} from '../../../../../components/common/Settings/SettingsCard';
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
        <Stack mb="lg">
            <Group position="apart">
                <Title order={5}>SCIM access tokens</Title>
                <Button onClick={() => setIsCreatingToken(true)}>
                    Generate new token
                </Button>
            </Group>

            <SettingsGridCard>
                <Stack spacing="sm">
                    <Title order={4}>SCIM URL</Title>
                    <Text color="dimmed">
                        Use the URL to connect your identity provider to
                        Lightdash via SCIM.
                    </Text>
                    <Anchor
                        href="https://docs.lightdash.com/references/scim-integration/"
                        target="_blank"
                    >
                        Learn more
                    </Anchor>
                </Stack>
                <TextInput
                    value={scimURL}
                    readOnly
                    rightSection={
                        <Button
                            variant="subtle"
                            onClick={handleCopyToClipboard}
                            compact
                        >
                            <IconCopy size={16} />
                        </Button>
                    }
                />
            </SettingsGridCard>

            {hasAvailableTokens ? (
                <TokensTable />
            ) : (
                <SettingsCard shadow="none">
                    You haven't generated any tokens yet.
                </SettingsCard>
            )}

            {isCreatingToken && (
                <CreateTokenModal
                    onBackClick={() => setIsCreatingToken(false)}
                />
            )}
        </Stack>
    );
};

export default ScimAccessTokensPanel;
