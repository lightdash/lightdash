import { Box, Button, Stack } from '@mantine-8/core';
import { IconCheck } from '@tabler/icons-react';
import confetti from 'canvas-confetti';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../common/MantineIcon';
import { ProjectCreationCard } from '../../common/Settings/SettingsCard';
import { OnboardingTitle } from './common/OnboardingTitle';
import OnboardingWrapper from './common/OnboardingWrapper';
import classes from './ConnectSuccess.module.css';

interface ConnectSuccessProps {
    projectUuid: string;
}

const ConnectSuccess: FC<ConnectSuccessProps> = ({ projectUuid }) => {
    return (
        <OnboardingWrapper>
            <ProjectCreationCard>
                <Stack align="center" gap="xl">
                    <OnboardingTitle>
                        Your project's been created!
                    </OnboardingTitle>

                    <Box
                        component="div"
                        className={classes.container}
                        p="sm"
                        bg="green.6"
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
