import { Box,Center,Group,Text } from '@mantine/core';
import { IconAlertTriangle,IconTool } from '@tabler/icons-react';
import { useEffect,useState } from 'react';
import MantineIcon from '../common/MantineIcon';
import { BANNER_HEIGHT } from '../common/Page/constants';

export const PreviewBanner = () => {
    const [opacity, setOpacity] = useState(1);
    const [position, setPosition] = useState(0);

    /*
    A subtle pulse animation effect for the banner by continuously adjusting its opacity. 
    The opacity oscillates between 0.8 and 1 every 50ms, drawing user attention without being too distracting.
    To make the pulse slower or faster, we can adjust the interval duration (50ms) or change the opacity step size (0.01).
    */
    useEffect(() => {
        let direction = -0.01;
        let currentOpacity = 1;

        const pulseInterval = setInterval(() => {
            currentOpacity += direction;

            if (currentOpacity <= 0.8) {
                direction = 0.01;
            } else if (currentOpacity >= 1) {
                direction = -0.01;
            }

            setOpacity(currentOpacity);
        }, 50);

        return () => clearInterval(pulseInterval);
    }, []);

    /*
    An attention-grabbing slide animation for the banner every 30 seconds.
    It briefly slides the banner out to the left, resets its position off-screen to the right,
    and then slides it back in after a small delay to catch the user's attention.
    */
    useEffect(() => {
        const attentionInterval = setInterval(() => {
            setPosition(-100);

            setTimeout(() => {
                setPosition(100);

                setTimeout(() => {
                    setPosition(0);
                }, 50);
            }, 1500);
        }, 30000);

        return () => clearInterval(attentionInterval);
    }, []);

    return (
        <Box
            bg="dark.7"
            style={{
                position: 'fixed',
                width: '100%',
                zIndex: 999,
            }}
        >
            <Center
                w="100%"
                h={BANNER_HEIGHT}
                bg="orange.5"
                style={{
                    zIndex: 1000,
                    opacity: opacity,
                    transform: `translateX(${position}%)`,
                    transition:
                        'opacity 0.1s ease-in-out, transform 1s ease-in-out',
                }}
            >
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconAlertTriangle}
                        color="red"
                        size="md"
                    />
                    <MantineIcon icon={IconTool} color="dark" size="md" />
                    <Text
                        color="dark"
                        fw={700}
                        fz="sm"
                        style={{
                            letterSpacing: '0.5px',
                        }}
                    >
                        THIS IS A PREVIEW ENVIRONMENT. ANY CHANGES YOU MAKE HERE
                        WILL NOT AFFECT PRODUCTION
                    </Text>
                    <MantineIcon icon={IconTool} color="dark" size="md" />
                    <MantineIcon
                        icon={IconAlertTriangle}
                        color="red"
                        size="md"
                    />
                </Group>
            </Center>
        </Box>
    );
};
