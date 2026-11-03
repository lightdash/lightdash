import { Box, Button, Stack, Text, Title } from '@mantine/core';
import {
    IconArrowRight,
    IconDatabase,
    IconLayersLinked,
    IconUsers,
    type Icon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useOnboardingNavigate } from '../../../components/common/viewTransition';
import classes from './MeetAurora.module.css';

const PLAN: { icon: Icon; title: string; body: string }[] = [
    {
        icon: IconDatabase,
        title: 'Connect your warehouse',
        body: 'Aurora runs real queries against it, so you can check any number.',
    },
    {
        icon: IconLayersLinked,
        title: 'Aurora learns your data',
        body: 'It reads your tables in the background, so revenue means the same thing in every answer.',
    },
    {
        icon: IconUsers,
        title: 'Bring in your tools and team',
        body: 'Tool data in your answers, Aurora in Slack, and pull requests on GitHub when it improves your metrics.',
    },
];

export const MeetAurora: FC = () => {
    const onboardingNavigate = useOnboardingNavigate();
    return (
        <Stack gap="xl" className={classes.column}>
            <Stack gap={4}>
                <Title order={1}>Meet Aurora</Title>
                <Text c="dimmed">
                    Aurora is an AI data analyst that works on your own data.
                    Here is what we'll set up together.
                </Text>
            </Stack>
            <Box component="ol" className={classes.plan}>
                {PLAN.map(({ icon, title, body }, index) => (
                    <Box
                        component="li"
                        key={title}
                        className={classes.item}
                        style={{ '--i': index } as React.CSSProperties}
                    >
                        <Box className={classes.glyph}>
                            <MantineIcon icon={icon} size={16} />
                        </Box>
                        <Box>
                            <Text fz="sm" fw={600}>
                                {title}
                            </Text>
                            <Text fz="sm" c="dimmed">
                                {body}
                            </Text>
                        </Box>
                    </Box>
                ))}
            </Box>
            <Button
                size="md"
                className={classes.cta}
                rightSection={<MantineIcon icon={IconArrowRight} />}
                onClick={() =>
                    onboardingNavigate('/onboarding/data-source?intro=done')
                }
            >
                Connect your data
            </Button>
        </Stack>
    );
};
