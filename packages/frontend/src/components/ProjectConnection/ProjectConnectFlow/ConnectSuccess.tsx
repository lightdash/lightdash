import { Avatar, Button, createStyles, keyframes, Stack } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { FC } from 'react';
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
        animationDuration: '0.7s',
        animationDelay: '1s',
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

                    <Avatar
                        className={classes.container}
                        size="xl"
                        color="green"
                        radius={999}
                    >
                        <MantineIcon icon={IconCheck} size="4xl" />
                    </Avatar>

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
