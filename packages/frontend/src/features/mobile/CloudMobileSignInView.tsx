import { Code, Group, Stack, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import { CopyActionIcon } from '../../components/common/CopyActionIcon';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import classes from './MobileSettingsPage.module.css';
import { MobileSignInStep } from './MobileSignInStep';
import { MOBILE_STRINGS } from './mobileStrings';
import { useMobileSignInCode } from './useMobileSignInCode';

export const CloudMobileSignInView: FC<{ host: string }> = ({ host }) => {
    const signIn = useMobileSignInCode({ autoShow: true });

    return (
        <SettingsCard withBorder>
            <Stack gap="md">
                <Title order={5}>{MOBILE_STRINGS.signInTitle}</Title>
                <Group gap="xs" wrap="nowrap">
                    <Text size="sm">{MOBILE_STRINGS.signInTo}</Text>
                    <Code fz="sm" className={classes.host}>
                        {host}
                    </Code>
                    <CopyActionIcon
                        value={host}
                        copyLabel={MOBILE_STRINGS.copyHost}
                        copiedLabel={MOBILE_STRINGS.copied}
                        variant="subtle"
                        size="sm"
                    />
                </Group>
                <MobileSignInStep signIn={signIn} />
            </Stack>
        </SettingsCard>
    );
};
