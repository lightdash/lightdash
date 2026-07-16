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
    {
        name: 'Knowledge and connected integrations',
        isAvailable: false,
        warning: null,
    },
];

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
                    <Text size="sm" fw={600}>
                        Research depth
                    </Text>
                    <Text size="xs" c="dimmed">
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
                                    <Group wrap="nowrap" gap="xs">
                                        <Radio.Indicator />
                                        <Stack gap={0}>
                                            <Text size="xs" fw={600}>
                                                {optionConfig.label}
                                            </Text>
                                            <Text
                                                size="10px"
                                                c="dimmed"
                                                lineClamp={1}
                                            >
                                                {optionConfig.description}
                                            </Text>
                                            <Group gap={4} mt={4} wrap="wrap">
                                                <Group
                                                    gap={4}
                                                    wrap="nowrap"
                                                    className={
                                                        styles.depthAllowance
                                                    }
                                                >
                                                    <MantineIcon
                                                        icon={IconClock}
                                                        size={11}
                                                    />
                                                    <Text size="9px" fw={600}>
                                                        {optionConfig.duration}
                                                    </Text>
                                                </Group>
                                                <Group
                                                    gap={4}
                                                    wrap="nowrap"
                                                    className={
                                                        styles.depthAllowance
                                                    }
                                                >
                                                    <MantineIcon
                                                        icon={IconDatabase}
                                                        size={11}
                                                    />
                                                    <Text size="9px" fw={600}>
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
                        <Text size="sm" fw={600}>
                            Evidence sources
                        </Text>
                        <Text size="xs" c="dimmed">
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
                                    size="sm"
                                >
                                    <MantineIcon
                                        icon={
                                            source.name === 'Project data'
                                                ? IconDatabase
                                                : IconSearch
                                        }
                                        size={13}
                                    />
                                </ThemeIcon>
                                <Text size="xs">{source.name}</Text>
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
