import {
    Box,
    Group,
    Radio,
    SimpleGrid,
    Stack,
    Text,
    ThemeIcon,
} from '@mantine-8/core';
import { IconClock, IconDatabase, IconSearch } from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { DEEP_RESEARCH_DEPTH_CONFIG } from '../../deepResearch/deepResearchAdapter';
import {
    DEEP_RESEARCH_DEPTHS,
    type DeepResearchDepth,
    type DeepResearchSource,
} from '../../deepResearch/types';
import styles from './DeepResearchPreflight.module.css';

const SOURCES: DeepResearchSource[] = [
    { name: 'Project data', isAvailable: true, warning: null },
    { name: 'Public web', isAvailable: true, warning: null },
];

const DEPTH_LABELS: Record<DeepResearchDepth, string> = {
    quick: 'low',
    standard: 'medium',
    deep: 'high',
    exhaustive: 'xhigh',
};

type Props = {
    depth: DeepResearchDepth;
    onDepthChange: (depth: DeepResearchDepth) => void;
};

export const DeepResearchPreflight = ({ depth, onDepthChange }: Props) => {
    return (
        <Box
            className={styles.root}
            role="region"
            aria-label="Deep research settings"
        >
            <Stack gap="md">
                <Stack gap={2}>
                    <Text size="13px" fw={600} lh={1.35}>
                        Research depth
                    </Text>
                    <Text size="11px" c="dimmed" lh={1.4}>
                        Runs in the background. You can safely leave this page.
                    </Text>
                </Stack>

                <Radio.Group
                    value={depth}
                    onChange={(value) =>
                        onDepthChange(value as DeepResearchDepth)
                    }
                    aria-label="Research depth"
                >
                    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                        {DEEP_RESEARCH_DEPTHS.map((option) => {
                            const optionConfig =
                                DEEP_RESEARCH_DEPTH_CONFIG[option];
                            return (
                                <Radio.Card
                                    key={option}
                                    value={option}
                                    className={styles.depthCard}
                                    radius="md"
                                    p="xs"
                                >
                                    <Group
                                        wrap="nowrap"
                                        gap="xs"
                                        align="center"
                                    >
                                        <Radio.Indicator size="xs" />
                                        <Stack gap={0}>
                                            <Text size="12px" fw={600} lh={1.3}>
                                                {DEPTH_LABELS[option]}
                                            </Text>
                                            <Group gap="xs" mt={3} wrap="wrap">
                                                <Group gap={3} wrap="nowrap">
                                                    <MantineIcon
                                                        icon={IconClock}
                                                        size={10}
                                                    />
                                                    <Text
                                                        size="10px"
                                                        c="dimmed"
                                                        lh={1.3}
                                                    >
                                                        {optionConfig.duration}
                                                    </Text>
                                                </Group>
                                                <Group gap={3} wrap="nowrap">
                                                    <MantineIcon
                                                        icon={IconDatabase}
                                                        size={10}
                                                    />
                                                    <Text
                                                        size="10px"
                                                        c="dimmed"
                                                        lh={1.3}
                                                    >
                                                        Up to{' '}
                                                        {
                                                            optionConfig.warehouseQueries
                                                        }{' '}
                                                        queries
                                                    </Text>
                                                </Group>
                                            </Group>
                                        </Stack>
                                    </Group>
                                </Radio.Card>
                            );
                        })}
                    </SimpleGrid>
                </Radio.Group>

                <Stack gap="xs">
                    <Stack gap={2}>
                        <Text size="13px" fw={600} lh={1.35}>
                            Evidence sources
                        </Text>
                        <Text size="11px" c="dimmed" lh={1.4}>
                            Deep Research will search the available sources
                            shown below.
                        </Text>
                    </Stack>
                    <Group gap="xs">
                        {SOURCES.map((source) => (
                            <Group
                                key={source.name}
                                gap={6}
                                className={styles.source}
                                data-available={source.isAvailable}
                            >
                                <ThemeIcon
                                    variant="light"
                                    color={
                                        source.isAvailable ? 'indigo' : 'gray'
                                    }
                                    size={22}
                                >
                                    <MantineIcon
                                        icon={
                                            source.name === 'Project data'
                                                ? IconDatabase
                                                : IconSearch
                                        }
                                        size={12}
                                    />
                                </ThemeIcon>
                                <Text size="11px" lh={1.35}>
                                    {source.name}
                                </Text>
                                {!source.isAvailable && (
                                    <Text span size="xs" c="dimmed">
                                        unavailable
                                    </Text>
                                )}
                            </Group>
                        ))}
                    </Group>
                </Stack>
            </Stack>
        </Box>
    );
};
