import { Anchor, Box, Image, Stack, Text, Title } from '@mantine/core';
import LightdashLogo from '../../svgs/lightdash-black.svg';
import MantineLinkButton from '../common/MantineLinkButton';

const MobileView = () => (
    <Box w="100vw" h="100vh" sx={{ background: '#ebf1f5' }}>
        <Stack align="center" spacing="xl" justify="start" p="5xl">
            <Image src={LightdashLogo} alt="lightdash logo" maw="8xl" my="lg" />
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
                Lightdash currently works best on bigger screens.
            </Title>
            <Text ta="center" color="gray.6">
                Sign in on a laptop or desktop to get started! In the meantime:
            </Text>
            <MantineLinkButton
                href="https://www.lightdash.com/"
                target="_blank"
            >
                Check out our website
            </MantineLinkButton>
            <Anchor
                href="https://join.slack.com/t/lightdash-community/shared_invite/zt-16q953ork-NZr1qdEqxSwB17E2ckUe7A"
                target="_blank"
                span
            >
                ...or join our community!
            </Anchor>
        </Stack>
    </Box>
);

export default MobileView;
