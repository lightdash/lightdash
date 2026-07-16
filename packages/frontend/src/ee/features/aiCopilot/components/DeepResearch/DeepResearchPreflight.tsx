import {
    Alert,
    Box,
    Group,
    Radio,
    SimpleGrid,
    Stack,
    Text,
    ThemeIcon,
} from '@mantine-8/core';
import {
    IconAlertTriangle,
    IconClock,
    IconDatabase,
    IconSearch,
} from '@tabler/icons-react';
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
        warning:
            'Connected AI Agent sources are not available to Deep Research yet and will not be used for this run.',
    },
];

type Props = {
    depth: DeepResearchDepth;
    onDepthChange: (depth: DeepResearchDepth) => void;
};

export const DeepResearchPreflight = ({ depth, onDepthChange }: Props) => {
    const warnings = SOURCES.flatMap((source) =>
        source.warning ? [source.warning] : [],
    );
    const config = DEEP_RESEARCH_DEPTH_CONFIG[depth];

    return (
        <Box
            className={styles.root}
            role="region"
            aria-label="Deep research settings"
        >
            <Stack gap="md">
                <Group justify="space-between" align="flex-start" wrap="wrap">
                    <Stack gap={2}>
                        <Text size="sm" fw={600}>
                            Research depth
                        </Text>
                        <Text size="xs" c="dimmed">
                            Runs in the background. You can safely leave this
                            page.
                        </Text>
                    </Stack>
                    <Group gap="lg">
                        <Group gap={6} wrap="nowrap">
                            <MantineIcon
                                icon={IconClock}
                                size={15}
                                color="indigo.5"
                            />
                            <Text size="xs" fw={600}>
                                {config.duration}
                            </Text>
                        </Group>
                        <Group gap={6} wrap="nowrap">
                            <MantineIcon
                                icon={IconDatabase}
                                size={15}
                                color="indigo.5"
                            />
                            <Text size="xs" fw={600}>
                                Up to {config.warehouseQueries} queries
                            </Text>
                        </Group>
                    </Group>
                </Group>

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
                                        </Stack>
                                    </Group>
                                </Radio.Card>
                            );
                        })}
                    </SimpleGrid>
                </Radio.Group>

                <Stack gap="xs">
                    <Text size="xs" fw={600} c="dimmed">
                        Evidence sources
                    </Text>
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
                    {warnings.length > 0 && (
                        <Alert
                            color="yellow"
                            variant="light"
                            icon={<IconAlertTriangle size={15} />}
                            className={styles.warning}
                        >
                            {warnings.map((warning) => (
                                <Text key={warning} size="xs">
                                    {warning}
                                </Text>
                            ))}
                        </Alert>
                    )}
                </Stack>
            </Stack>
        </Box>
    );
};
