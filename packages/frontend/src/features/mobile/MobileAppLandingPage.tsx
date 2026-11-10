import { Center, Paper, Stack, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import { MOBILE_STRINGS } from './mobileStrings';
import { StoreBadges } from './StoreBadges';

const MobileAppLandingPage: FC = () => (
    <Center mih="100vh" p="md">
        <Paper withBorder radius="md" p="xl" maw={480} w="100%">
            <Stack align="center" gap="md">
                <Title order={1} size="h3" ta="center">
                    {MOBILE_STRINGS.landingTitle}
                </Title>
                <Text c="dimmed" ta="center">
                    {MOBILE_STRINGS.landingHint}
                </Text>
                <StoreBadges justify="center" />
            </Stack>
        </Paper>
    </Center>
);

export default MobileAppLandingPage;
