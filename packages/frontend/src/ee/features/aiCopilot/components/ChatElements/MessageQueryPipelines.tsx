import { type AiAgentMessageQueryPipeline } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconChevronDown,
    IconChevronUp,
    IconStack2,
    IconTransform,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { PolymorphicPaperButton } from '../../../../../components/common/PolymorphicPaperButton';
import { nodeTypeLabelOf } from './composerPipeline/groupPipeline';
import { nodeTypeIcon } from './composerPipeline/nodeTypeIcon';
import styles from './MessageQueryPipelines.module.css';

export const MessageQueriesToggle: FC<{
    count: number;
    expanded: boolean;
    onToggle: () => void;
}> = ({ count, expanded, onToggle }) => (
    <Button
        variant="subtle"
        color="gray"
        size="compact-xs"
        className={styles.toggle}
        onClick={onToggle}
        leftSection={<MantineIcon icon={IconStack2} size={16} />}
        rightSection={
            <MantineIcon
                icon={expanded ? IconChevronUp : IconChevronDown}
                size={12}
            />
        }
    >
        {count} {count === 1 ? 'query' : 'queries'}
    </Button>
);

const pipelineSummary = ({ nodes }: AiAgentMessageQueryPipeline): string => {
    const sourceLabels = [
        ...new Set(
            nodes.flatMap((node) => {
                const label = nodeTypeLabelOf(node);
                return label ? [label] : [];
            }),
        ),
    ];
    return [
        `${nodes.length} step${nodes.length === 1 ? '' : 's'}`,
        ...(sourceLabels.length > 0 ? [sourceLabels.join(', ')] : []),
    ].join(' · ');
};

/** A card per pipeline the message ran; null `onSelect` renders them static. */
export const MessageQueriesList: FC<{
    pipelines: AiAgentMessageQueryPipeline[];
    onSelect: ((pipeline: AiAgentMessageQueryPipeline) => void) | null;
    /** The pipeline open in the preview pane, highlighted. */
    selectedQueryUuid: string | null;
}> = ({ pipelines, onSelect, selectedQueryUuid }) => (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
        {pipelines.map((pipeline) => {
            const terminal = pipeline.nodes.find(
                (node) => node.nodeId === pipeline.terminalNodeId,
            );
            // DuckDB has no type in the Queries tab; it is a transformation there
            const icon = (terminal && nodeTypeIcon(terminal)) ?? IconTransform;
            const content = (
                <Group gap="sm" wrap="nowrap" align="flex-start">
                    <Box className={styles.iconChip} flex="0 0 auto">
                        <MantineIcon icon={icon} size={14} />
                    </Box>
                    <Stack gap={2} miw={0}>
                        <Text size="sm" fw={500} lineClamp={1} ta="left">
                            {pipeline.title}
                        </Text>
                        <Text size="xs" c="dimmed" lineClamp={1} ta="left">
                            {pipelineSummary(pipeline)}
                        </Text>
                    </Stack>
                </Group>
            );
            return onSelect ? (
                <PolymorphicPaperButton
                    key={pipeline.queryUuid}
                    component="button"
                    type="button"
                    p="sm"
                    className={styles.card}
                    aria-label={`Show query ${pipeline.title}`}
                    aria-pressed={pipeline.queryUuid === selectedQueryUuid}
                    onClick={() => onSelect(pipeline)}
                >
                    {content}
                </PolymorphicPaperButton>
            ) : (
                <Paper key={pipeline.queryUuid} p="sm">
                    {content}
                </Paper>
            );
        })}
    </SimpleGrid>
);
