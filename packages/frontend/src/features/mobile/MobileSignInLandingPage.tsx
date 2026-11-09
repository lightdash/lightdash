import { Center, Paper, Stack, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import { MOBILE_SIGN_IN_LANDING_STRINGS } from './mobileStrings';
import { StoreBadges } from './StoreBadges';

const MobileSignInLandingPage: FC = () => (
    <Center mih="100vh" p="md">
        <Paper withBorder radius="md" p="xl" maw={480} w="100%">
            <Stack align="center" gap="md">
                <Title order={3} ta="center">
                    {MOBILE_SIGN_IN_LANDING_STRINGS.title}
                </Title>
                <Text c="dimmed" ta="center">
                    {MOBILE_SIGN_IN_LANDING_STRINGS.body}
                </Text>
                <StoreBadges justify="center" />
            </Stack>
        </Paper>
    </Center>
);

export default MobileSignInLandingPage;
