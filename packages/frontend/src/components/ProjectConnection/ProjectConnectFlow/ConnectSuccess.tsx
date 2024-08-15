import { Box, Button, Stack } from '@mantine/core';
import { createStyles, keyframes } from '@mantine/emotion';
import { IconCheck } from '@tabler/icons-react';
import confetti from 'canvas-confetti';
import { type FC } from 'react';
import { Link } from 'react-router-dom';
import MantineIcon from '../../common/MantineIcon';
import { ProjectCreationCard } from '../../common/Settings/SettingsCard';
import { OnboardingTitle } from './common/OnboardingTitle';
import OnboardingWrapper from './common/OnboardingWrapper';

const animate = keyframes({
    '0%': { opacity: 0, transform: 'scale(.3)' },
    '50%': { opacity: 1, transform: 'scale(1.05)' },
    '70%': { opacity: 1, transform: 'scale(.8)' },
    '100%': { opacity: 1, transform: 'scale(1)' },
});

const useStyles = createStyles(() => ({
    container: {
        opacity: 0,
        textAlign: 'center',
        animationName: animate,
        animationDuration: '700ms',
        animationDelay: '500ms',
        animationFillMode: 'forwards',
    },
}));

interface ConnectSuccessProps {
    projectUuid: string;
}

const ConnectSuccess: FC<ConnectSuccessProps> = ({ projectUuid }) => {
    const { classes } = useStyles();

    return (
        <OnboardingWrapper>
            <ProjectCreationCard>
                <Stack align="center" spacing="xl">
                    <OnboardingTitle>
                        Your project's been created!
                    </OnboardingTitle>

                    <Box
                        component="div"
                        className={classes.container}
                        p="sm"
                        bg="green.6"
                        sx={{ borderRadius: 999 }}
                        ref={(el) => {
                            if (!el) return;

                            const rect = el.getBoundingClientRect();

                            void confetti({
                                disableForReducedMotion: true,
                                startVelocity: 30,
                                particleCount: 100,
                                spread: 90,
                                gravity: 0.7,
                                origin: {
                                    x:
                                        (rect.left + rect.width / 2) /
                                        window.innerWidth,
                                    y:
                                        (rect.top + rect.height / 2) /
                                        window.innerHeight,
                                },
                            });
                        }}
                    >
                        <MantineIcon
                            icon={IconCheck}
                            size="4xl"
                            color="white"
                            stroke={3}
                        />
                    </Box>

                    <Button
                        component={Link}
                        size="md"
                        to={`/projects/${projectUuid}/home`}
                    >
                        Let's do some data!
                    </Button>
                </Stack>
            </ProjectCreationCard>
        </OnboardingWrapper>
    );
};

export default ConnectSuccess;
