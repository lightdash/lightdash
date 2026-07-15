import {
    Alert,
    Button,
    Divider,
    Drawer,
    Group,
    Radio,
    SimpleGrid,
    Stack,
    Text,
    ThemeIcon,
} from '@mantine-8/core';
import { useMediaQuery } from '@mantine-8/hooks';
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
    opened: boolean;
    onClose: () => void;
    question: string;
    depth: DeepResearchDepth;
    onDepthChange: (depth: DeepResearchDepth) => void;
    onStart: () => void;
    isStarting: boolean;
    projectUuid?: string;
    agentUuid?: string;
};

export const DeepResearchPreflight = ({
    opened,
    onClose,
    question,
    depth,
    onDepthChange,
    onStart,
    isStarting,
    projectUuid: _projectUuid,
    agentUuid: _agentUuid,
}: Props) => {
    const isNarrow = useMediaQuery('(max-width: 48em)');
    const sources = SOURCES;
    const warnings = sources.flatMap((source) =>
        source.warning ? [source.warning] : [],
    );
    const config = DEEP_RESEARCH_DEPTH_CONFIG[depth];

    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            title="Deep research"
            position={isNarrow ? 'bottom' : 'right'}
            size={isNarrow ? '92%' : 440}
            padding="lg"
            classNames={{ body: styles.drawerBody }}
        >
            <Stack gap="lg" h="100%">
                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        Research runs in the background. You can leave this page
                        and return to the report later.
                    </Text>
                    <Text size="sm" fw={600}>
                        Question
                    </Text>
                    <Text size="sm" className={styles.question}>
                        {question || 'Write a question in the composer first.'}
                    </Text>
                </Stack>

                <Stack gap="xs">
                    <Text size="sm" fw={600}>
                        Research depth
                    </Text>
                    <Radio.Group
                        value={depth}
                        onChange={(value) =>
                            onDepthChange(value as DeepResearchDepth)
                        }
                        aria-label="Research depth"
                    >
                        <SimpleGrid cols={2} spacing="xs">
                            {DEEP_RESEARCH_DEPTHS.map((option) => {
                                const optionConfig =
                                    DEEP_RESEARCH_DEPTH_CONFIG[option];
                                return (
                                    <Radio.Card
                                        key={option}
                                        value={option}
                                        className={styles.depthCard}
                                        radius="md"
                                        p="sm"
                                    >
                                        <Group wrap="nowrap" align="flex-start">
                                            <Radio.Indicator />
                                            <Stack gap={2}>
                                                <Text size="sm" fw={600}>
                                                    {optionConfig.label}
                                                </Text>
                                                <Text size="xs" c="dimmed">
                                                    {optionConfig.description}
                                                </Text>
                                            </Stack>
                                        </Group>
                                    </Radio.Card>
                                );
                            })}
                        </SimpleGrid>
                    </Radio.Group>
                </Stack>

                <Stack gap="xs">
                    <Text size="sm" fw={600}>
                        Included evidence
                    </Text>
                    <Group gap="xs">
                        {sources.map((source) => (
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
                            icon={<IconAlertTriangle size={16} />}
                        >
                            <Stack gap={4}>
                                {warnings.map((warning) => (
                                    <Text key={warning} size="xs">
                                        {warning}
                                    </Text>
                                ))}
                            </Stack>
                        </Alert>
                    )}
                </Stack>

                <Divider />

                <SimpleGrid cols={2} spacing="md">
                    <Group wrap="nowrap" align="flex-start">
                        <MantineIcon
                            icon={IconClock}
                            size={18}
                            color="indigo.5"
                        />
                        <Stack gap={1}>
                            <Text size="xs" c="dimmed">
                                Estimated duration
                            </Text>
                            <Text size="sm" fw={600}>
                                {config.duration}
                            </Text>
                        </Stack>
                    </Group>
                    <Group wrap="nowrap" align="flex-start">
                        <MantineIcon
                            icon={IconDatabase}
                            size={18}
                            color="indigo.5"
                        />
                        <Stack gap={1}>
                            <Text size="xs" c="dimmed">
                                Warehouse allowance
                            </Text>
                            <Text size="sm" fw={600}>
                                Up to {config.warehouseQueries} queries
                            </Text>
                        </Stack>
                    </Group>
                </SimpleGrid>

                <Button
                    mt="auto"
                    fullWidth
                    leftSection={<IconSearch size={16} />}
                    disabled={!question.trim()}
                    loading={isStarting}
                    onClick={onStart}
                >
                    Start research
                </Button>
            </Stack>
        </Drawer>
    );
};
