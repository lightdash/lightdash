import { Box, Image, Stack, Text, Title } from '@mantine/core';
import LightdashLogo from '../../svgs/lightdash-black.svg';
import MantineLinkButton from '../common/MantineLinkButton';

const MobileView = (health: any) => (
    <Box w="100vw" h="100vh" sx={{ background: '#ebf1f5' }}>
        <Stack align="center" spacing="xl" justify="start" p="5xl">
            <Image
                src={
                    health.data?.siteLogoBlack
                        ? health.data?.siteLogoBlack
                        : LightdashLogo
                }
                alt={`${health.data?.siteName} logo`}
                maw="8xl"
                my="lg"
            />
            <Box
                component="span"
                sx={{
                    fontSize: '2.5rem',
                    display: 'block',
                }}
            >
                &#128586;
            </Box>
            <Title ta="center" order={4}>
                This page is not available to view on mobile yet.
            </Title>
            <Text ta="center" color="gray.6">
                Sign in on a laptop or desktop to access this page!
            </Text>
            <MantineLinkButton href="/">Back to home page</MantineLinkButton>
        </Stack>
    </Box>
);

export default MobileView;
