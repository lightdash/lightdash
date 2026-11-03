import { Button, Group, Stack, Text } from '@mantine/core';
import Callout from '../../../../../components/common/Callout';
import { useSnowflakeLoginPopup } from '../../../../../hooks/useSnowflake';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';

export const AiSnowflakeReauthenticationCallout = () => {
    const t = useUiStrings();
    const login = useSnowflakeLoginPopup({ onLogin: async () => {} });

    return (
        <Callout variant={login.isSuccess ? 'success' : 'warning'} mb="md">
            {login.isSuccess ? (
                <Text size="sm" role="status">
                    {t('aiAccess.snowflakeReconnected')}
                </Text>
            ) : (
                <Stack gap="sm">
                    <Text size="sm">
                        {t('aiAccess.snowflakeSignInExpired')}
                    </Text>
                    <Group>
                        <Button size="xs" onClick={() => login.mutate()}>
                            {t('aiAccess.snowflakeReconnect')}
                        </Button>
                    </Group>
                    {login.error && (
                        <Text size="sm" c="red" role="alert">
                            {login.error.message}
                        </Text>
                    )}
                </Stack>
            )}
        </Callout>
    );
};
