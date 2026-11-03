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
        body: 'Every answer is a real query you can check.',
    },
    {
        icon: IconLayersLinked,
        title: 'Draft your metrics',
        body: 'It reads your tables in the background, so revenue means the same thing in every answer.',
    },
    {
        icon: IconUsers,
        title: 'Bring in your tools and team',
        body: 'Answers in Slack and metric changes as pull requests on GitHub.',
    },
];

export const MeetAurora: FC = () => {
    const onboardingNavigate = useOnboardingNavigate();
    return (
        <Stack gap="xl" className={classes.column}>
            <Stack gap={4}>
                <Title order={1}>Your AI analyst</Title>
                <Text c="dimmed">Three steps to answers you can trust.</Text>
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
