import { Box, Image, Stack, Text, Title } from '@mantine-8/core';
import LightdashLogo from '../../svgs/lightdash-black.svg';
import MantineLinkButton from '../common/MantineLinkButton';
import classes from './Mobile.module.css';

const MobileView = () => (
    <Box w="100vw" h="100vh" className={classes.mobileView}>
        <Stack align="center" gap="xl" justify="start" p="5xl">
            <Image src={LightdashLogo} alt="lightdash logo" maw="8xl" my="lg" />
            <Box component="span" className={classes.emoji}>
                &#128586;
            </Box>
            <Title ta="center" order={4}>
                This page is not available to view on mobile yet.
            </Title>
            <Text ta="center" c="ldGray.6">
                Sign in on a laptop or desktop to access this page!
            </Text>
            <MantineLinkButton href="/">Back to home page</MantineLinkButton>
        </Stack>
    </Box>
);

export default MobileView;
