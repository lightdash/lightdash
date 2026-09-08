import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconMoonStars, IconSun } from '@tabler/icons-react';
import { useState } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppColorScheme } from '../../../providers/ColorSchemeContext';
import { type RoadmapMockScenario } from './roadmapMockApi';
import RoadmapMockContent from './RoadmapMockContent';
import classes from './RoadmapProjects.module.css';

const scenarios: {
    value: RoadmapMockScenario;
    label: string;
    description: string;
}[] = [
    {
        value: 'populated',
        label: 'Populated',
        description:
            'Shared projects, your requests, direct project interest, and requests without a project.',
    },
    {
        value: 'empty',
        label: 'Empty',
        description: 'No eligible projects or visible requests.',
    },
    {
        value: 'loading',
        label: 'Loading',
        description:
            'The API response stays pending so you can review the loading state.',
    },
    {
        value: 'error',
        label: 'Error + retry',
        description: 'The first request fails. Try again succeeds.',
    },
    {
        value: 'unavailable',
        label: 'Access unavailable',
        description: 'The API denies roadmap access.',
    },
    {
        value: 'removed',
        label: 'Project removed',
        description:
            'The dashboard-filter project has left the catalog. Its three requests remain under Other requests.',
    },
    {
        value: 'missing-title',
        label: 'Missing project title',
        description:
            'A blank-title project is omitted. Its requests remain under Other requests.',
    },
    {
        value: 'pagination',
        label: 'Multiple pages',
        description:
            'Twenty-four projects, fetched ten at a time. Other requests appears after the final projects.',
    },
    {
        value: 'expiry',
        label: 'Cache expiry',
        description:
            'Projects expire after 12 seconds in this demo. Refresh then fails, so expired titles disappear.',
    },
];

export default function RoadmapPreview() {
    const [scenario, setScenario] = useState<RoadmapMockScenario>('populated');
    const [revision, setRevision] = useState(0);
    const { colorScheme, toggleColorScheme } = useAppColorScheme();
    return (
        <Stack className={classes.review} gap="lg">
            <Stack className={classes.reviewToolbar} gap="sm">
                <Group justify="space-between" gap="md">
                    <Group gap="sm">
                        <Text fw={600}>Lightdash</Text>
                        <Badge variant="light">Roadmap preview</Badge>
                        <Text fz="xs" c="dimmed">
                            Synthetic data · no changes are saved
                        </Text>
                    </Group>
                    <Group gap="sm">
                        <Select
                            aria-label="Preview scenario"
                            value={scenario}
                            data={scenarios.map(({ value, label }) => ({
                                value,
                                label,
                            }))}
                            onChange={(value) => {
                                const next = scenarios.find(
                                    (item) => item.value === value,
                                );
                                if (next) setScenario(next.value);
                            }}
                            allowDeselect={false}
                        />
                        <Button
                            variant="default"
                            onClick={() => setRevision((value) => value + 1)}
                        >
                            Reset
                        </Button>
                        <Tooltip label="Toggle color scheme">
                            <ActionIcon
                                variant="default"
                                size="lg"
                                aria-label="Toggle color scheme"
                                onClick={() => toggleColorScheme()}
                            >
                                <MantineIcon
                                    icon={
                                        colorScheme === 'dark'
                                            ? IconSun
                                            : IconMoonStars
                                    }
                                />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </Group>
                <Text fz="xs" c="dimmed">
                    {
                        scenarios.find((item) => item.value === scenario)
                            ?.description
                    }
                </Text>
            </Stack>
            <RoadmapMockContent
                key={`${scenario}-${revision}`}
                scenario={scenario}
            />
        </Stack>
    );
}
