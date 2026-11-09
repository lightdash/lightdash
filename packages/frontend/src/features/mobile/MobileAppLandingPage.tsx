import { Center, Paper, Stack, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import { StoreBadges } from './StoreBadges';

const MobileAppLandingPage: FC = () => (
    <Center mih="100vh" p="md">
        <Paper withBorder radius="md" p="xl" maw={480} w="100%">
            <Stack align="center" gap="md">
                <Title order={3} ta="center">
                    Get the Lightdash app
                </Title>
                <Text c="dimmed" ta="center">
                    Open this link on your phone, or pick your store.
                </Text>
                <StoreBadges justify="center" />
            </Stack>
        </Paper>
    </Center>
);

export default MobileAppLandingPage;
