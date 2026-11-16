import {
    interpolateUiString,
    MergeJoinType,
    type UiStringKey,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Group,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconCalculator,
    IconKey,
    IconListNumbers,
    IconRepeat,
    IconTable,
} from '@tabler/icons-react';
import { Fragment, useMemo, useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { useUiStrings } from '../../../../../providers/Embed/useUiStrings';
import chipClasses from '../QueryChip.module.css';
import { type PipelineNode } from './groupPipeline';
import { type MergeColumn, type MergeNodeSummary } from './mergeNodeSummary';
import {
    MergeStepContext,
    useMergeStep,
    type MergeStepContextValue,
} from './mergeStepContext';
import styles from './MergeStepParts.module.css';
import { NodeReferencePill, StepMarker } from './NodeReferencePill';
import { type MergeNodeView } from './notebook/useMergeNodeView';
import { DetailsRow } from './SemanticNodeDetails';
import { useMergeNodeCopy } from './useMergeNodeCopy';

const JOIN_TYPE_NAME = {
    [MergeJoinType.INNER]: 'aiAgent.composer.mergeNode.joinTypeName.inner',
    [MergeJoinType.LEFT]: 'aiAgent.composer.mergeNode.joinTypeName.left',
    [MergeJoinType.FULL]: 'aiAgent.composer.mergeNode.joinTypeName.full',
} as const satisfies Record<MergeJoinType, UiStringKey>;

const FIRST_MARKER = 'A'.charCodeAt(0);

export const RepeatsValuesBadge: FC<{ help: string }> = ({ help }) => {
    const getUiString = useUiStrings();
    return (
        <Tooltip label={help} multiline maw={280}>
            <Badge
                size="xs"
                flex="0 0 auto"
                leftSection={<MantineIcon icon={IconRepeat} size={10} />}
            >
                {getUiString('aiAgent.composer.mergeNode.repeatsValues')}
            </Badge>
        </Tooltip>
    );
};

/** Lets the step's pills and columns highlight their source in the graph. */
export const MergeStepProvider: FC<{
    view: MergeNodeView;
    references: PipelineNode[];
    onJump: (nodeId: string) => void;
    onHighlightNode: (nodeId: string | null) => void;
    children: ReactNode;
}> = ({ view, references, onJump, onHighlightNode, children }) => {
    const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(
        null,
    );
    const value = useMemo<MergeStepContextValue>(() => {
        const markers = new Map(
            view.summary.sources.map((source, index) => [
                source.nodeId,
                String.fromCharCode(FIRST_MARKER + index),
            ]),
        );
        return {
            nodesById: new Map(references.map((node) => [node.nodeId, node])),
            onJump,
            highlight: (nodeId) => {
                setHighlightedNodeId(nodeId);
                onHighlightNode(nodeId);
            },
            highlightedNodeId,
            markerOf: (nodeId) => markers.get(nodeId) ?? null,
        };
    }, [view, references, onJump, onHighlightNode, highlightedNodeId]);
    return <MergeStepContext value={value}>{children}</MergeStepContext>;
};

/** Fills a UI string's {slots} with nodes, keeping the words between them. */
const SlotTemplate: FC<{
    template: string;
    slots: Record<string, ReactNode>;
    /** Keeps spaces around words, for templates set as inline text. */
    inline?: boolean;
}> = ({ template, slots, inline = false }) => (
    <>
        {template.split(/(\{\w+\})/).map((part, index) => {
            const slot = slots[part.slice(1, -1)];
            const text = inline ? part : part.trim();
            if (slot !== undefined)
                // eslint-disable-next-line react/no-array-index-key
                return <Fragment key={index}>{slot}</Fragment>;
            return text ? (
                // eslint-disable-next-line react/no-array-index-key
                <Text key={index} component="span" inherit>
                    {text}
                </Text>
            ) : null;
        })}
    </>
);

/** The join type, its meaning one hover or keyboard focus away. */
const JoinTypeTerm: FC<{ summary: MergeNodeSummary }> = ({ summary }) => {
    const getUiString = useUiStrings();
    const { joinTypeHelp } = useMergeNodeCopy();
    return (
        <Tooltip
            label={joinTypeHelp(summary)}
            multiline
            maw={300}
            events={{ hover: true, focus: true, touch: true }}
        >
            <UnstyledButton
                component="span"
                className={styles.term}
                tabIndex={0}
            >
                {getUiString(JOIN_TYPE_NAME[summary.joinType])}
            </UnstyledButton>
        </Tooltip>
    );
};

/** The key parts by their most common names; each step's own names are in its pill. */
const KeyTerms: FC<{ summary: MergeNodeSummary }> = ({ summary }) => (
    <>
        {summary.keys.map((key, index) => (
            <Fragment key={key.name}>
                {index > 0 && ' + '}
                <Text component="span" inherit className={styles.strong}>
                    {key.label}
                </Text>
            </Fragment>
        ))}
    </>
);

type MergeSource = MergeNodeSummary['sources'][number];

/** What a step brings to the merge: its explore, its key fields, repeats. */
const StepDetails: FC<{
    summary: MergeNodeSummary;
    source: MergeSource;
    exploreLabel: string | null;
}> = ({ summary, source, exploreLabel }) => {
    const getUiString = useUiStrings();
    const { repeatsHelp } = useMergeNodeCopy();
    const keepsAllRows =
        summary.joinType === MergeJoinType.LEFT &&
        summary.sources[0]?.nodeId === source.nodeId;
    return (
        <Stack gap={4}>
            {exploreLabel !== null && (
                <Group gap={6} wrap="nowrap">
                    <MantineIcon icon={IconTable} size={12} />
                    <Text component="span" inherit>
                        {interpolateUiString(
                            getUiString(
                                'aiAgent.composer.mergeNode.stepExplore',
                            ),
                            { explore: exploreLabel },
                        )}
                    </Text>
                </Group>
            )}
            {source.keyFields.length > 0 && (
                <Group gap={6} wrap="nowrap">
                    <MantineIcon icon={IconKey} size={12} />
                    <Text component="span" inherit>
                        {interpolateUiString(
                            getUiString('aiAgent.composer.mergeNode.stepKey'),
                            {
                                fields: source.keyFields
                                    .map((field) => field.label)
                                    .join(', '),
                            },
                        )}
                    </Text>
                </Group>
            )}
            {keepsAllRows && (
                <Text component="span" inherit>
                    {getUiString('aiAgent.composer.mergeNode.keepsAllRows')}
                </Text>
            )}
            {source.repeatValues && (
                <Group gap={6} wrap="nowrap">
                    <MantineIcon icon={IconRepeat} size={12} />
                    <Text component="span" inherit>
                        {repeatsHelp(summary, source.nodeId)}
                    </Text>
                </Group>
            )}
        </Stack>
    );
};

const StepPill: FC<{ view: MergeNodeView; source: MergeSource }> = ({
    view,
    source,
}) => {
    const getUiString = useUiStrings();
    const { nodesById, onJump, highlight, highlightedNodeId, markerOf } =
        useMergeStep();
    const { nodeId } = source;
    const marker = markerOf(nodeId);
    return (
        <NodeReferencePill
            node={{
                nodeId,
                title: nodesById.get(nodeId)?.title ?? source.title,
            }}
            leading={marker === null ? null : <StepMarker marker={marker} />}
            onJump={onJump}
            onHighlight={(on) => highlight(on ? nodeId : null)}
            active={highlightedNodeId === nodeId}
            trailing={
                source.repeatValues ? (
                    <MantineIcon
                        icon={IconRepeat}
                        size={12}
                        aria-label={getUiString(
                            'aiAgent.composer.mergeNode.repeatsValues',
                        )}
                    />
                ) : null
            }
            details={
                <StepDetails
                    summary={view.summary}
                    source={source}
                    exploreLabel={view.exploreLabelBySource[nodeId] ?? null}
                />
            }
        />
    );
};

/** "Inner join of A B C on key", or "Left join of A with B C" so the kept step reads first. */
export const MergeSentence: FC<{ view: MergeNodeView }> = ({ view }) => {
    const getUiString = useUiStrings();
    const { summary } = view;
    const pills = (sources: MergeSource[]) =>
        sources.map((source) => (
            <StepPill key={source.nodeId} view={view} source={source} />
        ));
    const [first, ...others] = summary.sources;
    const isLeft = summary.joinType === MergeJoinType.LEFT && !!first;
    return (
        <Box className={styles.sentence}>
            <SlotTemplate
                template={getUiString(
                    isLeft
                        ? 'aiAgent.composer.mergeNode.sentence.left'
                        : 'aiAgent.composer.mergeNode.sentence',
                )}
                slots={{
                    joinType: <JoinTypeTerm summary={summary} />,
                    sources: pills(summary.sources),
                    first: first ? pills([first]) : null,
                    others: pills(others),
                }}
            />
            {summary.keys.length > 0 && (
                <Text component="span" inherit className={styles.phrase}>
                    <SlotTemplate
                        template={getUiString(
                            'aiAgent.composer.mergeNode.onKey',
                        )}
                        slots={{ key: <KeyTerms summary={summary} /> }}
                        inline
                    />
                </Text>
            )}
        </Box>
    );
};

/** A merged column; a step's column carries its step's letter. */
const ColumnChip: FC<{
    column: MergeColumn;
    /** Sort direction; null when the column is not a sort. */
    descending: boolean | null;
}> = ({ column, descending }) => {
    const getUiString = useUiStrings();
    const { highlight, highlightedNodeId, markerOf } = useMergeStep();
    const { sourceNodeId, sourceTitle } = column;
    const fromStep = sourceNodeId !== null && sourceTitle !== null;
    const marker = sourceNodeId === null ? null : markerOf(sourceNodeId);
    return (
        <Tooltip
            label={interpolateUiString(
                getUiString('aiAgent.composer.mergeNode.columnFrom'),
                { column: column.label, step: sourceTitle ?? '' },
            )}
            disabled={!fromStep}
            events={{ hover: true, focus: true, touch: false }}
        >
            <Box
                component="span"
                className={`${chipClasses.chip} ${styles.columnChip}`}
                tabIndex={fromStep ? 0 : undefined}
                data-active={fromStep && highlightedNodeId === sourceNodeId}
                onMouseEnter={() => fromStep && highlight(sourceNodeId)}
                onMouseLeave={() => fromStep && highlight(null)}
                onFocus={() => fromStep && highlight(sourceNodeId)}
                onBlur={() => fromStep && highlight(null)}
            >
                {descending !== null && (
                    <MantineIcon
                        icon={descending ? IconArrowDown : IconArrowUp}
                        aria-label={getUiString(
                            descending
                                ? 'aiAgent.composer.semanticNode.descending'
                                : 'aiAgent.composer.semanticNode.ascending',
                        )}
                        size={12}
                        color="ldGray.6"
                    />
                )}
                {marker !== null && <StepMarker marker={marker} />}
                <Text fz="xs" fw={600} truncate>
                    {column.label}
                </Text>
            </Box>
        </Tooltip>
    );
};

/** Calculations, sort and limit: what the merge does after joining. */
export const MergeOutputRows: FC<{ summary: MergeNodeSummary }> = ({
    summary,
}) => {
    const getUiString = useUiStrings();
    return (
        <>
            {summary.calculations.length > 0 && (
                <DetailsRow
                    icon={IconCalculator}
                    label={getUiString(
                        'aiAgent.composer.mergeNode.calculations',
                    )}
                >
                    <Stack gap={4}>
                        {summary.calculations.map((calc) => (
                            <Group
                                key={calc.name}
                                gap={4}
                                data-testid="merge-node-calculation"
                            >
                                <Text fz="xs" fw={500}>
                                    {calc.displayName}
                                </Text>
                                <Text fz="xs" c="dimmed" aria-hidden>
                                    =
                                </Text>
                                {calc.formula.map((token, index) =>
                                    token.kind === 'column' ? (
                                        <ColumnChip
                                            // eslint-disable-next-line react/no-array-index-key
                                            key={index}
                                            column={token.column}
                                            descending={null}
                                        />
                                    ) : (
                                        <Text
                                            // eslint-disable-next-line react/no-array-index-key
                                            key={index}
                                            fz="xs"
                                            c="dimmed"
                                            className={styles.formulaText}
                                        >
                                            {token.text.trim()}
                                        </Text>
                                    ),
                                )}
                            </Group>
                        ))}
                    </Stack>
                </DetailsRow>
            )}
            {summary.sorts.length > 0 && (
                <DetailsRow
                    icon={IconArrowsSort}
                    label={getUiString('aiAgent.composer.semanticNode.sorts')}
                >
                    <Group gap={4}>
                        {summary.sorts.map((sort) => (
                            <ColumnChip
                                key={sort.column.label}
                                column={sort.column}
                                descending={sort.descending}
                            />
                        ))}
                    </Group>
                </DetailsRow>
            )}
            {summary.limit !== null && (
                <DetailsRow
                    icon={IconListNumbers}
                    label={getUiString('aiAgent.composer.mergeNode.limit')}
                >
                    <Text fz="xs" c="dimmed" lh="22px">
                        {interpolateUiString(
                            getUiString(
                                summary.limit === 1
                                    ? 'aiAgent.composer.semanticNode.rows.singular'
                                    : 'aiAgent.composer.semanticNode.rows.plural',
                            ),
                            { count: summary.limit },
                        )}
                    </Text>
                </DetailsRow>
            )}
        </>
    );
};
