import { interpolateUiString, type ItemsMap } from '@lightdash/common';
import { Badge, Box, Group, Stack, Text, Tooltip } from '@mantine/core';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconCalculator,
    IconLayersIntersect,
    IconListNumbers,
    IconRepeat,
    IconStack2,
    IconTable,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { useUiStrings } from '../../../../../providers/Embed/useUiStrings';
import chipClasses from '../QueryChip.module.css';
import styles from './MergeNodeDetails.module.css';
import { type MergeColumn, type MergeNodeSummary } from './mergeNodeSummary';
import { DetailsRow, FieldChip } from './SemanticNodeDetails';
import { useMergeNodeCopy } from './useMergeNodeCopy';

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

const ColumnChip: FC<{ column: MergeColumn; descending?: boolean }> = ({
    column,
    descending,
}) => {
    const getUiString = useUiStrings();
    return (
        <Tooltip label={column.sourceTitle} disabled={!column.sourceTitle}>
            <Box component="span" className={chipClasses.chip}>
                {descending !== undefined && (
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
                <Text fz="xs" fw={600} truncate>
                    {column.label}
                </Text>
            </Box>
        </Tooltip>
    );
};

type Props = {
    summary: MergeNodeSummary;
    fieldsMapBySource: Readonly<Record<string, ItemsMap>>;
    exploreLabelBySource: Readonly<Record<string, string>>;
};

/** The merged steps and their keys, the rows kept, calculations, sorts and limit. */
export const MergeNodeDetails: FC<Props> = ({
    summary,
    fieldsMapBySource,
    exploreLabelBySource,
}) => {
    const getUiString = useUiStrings();
    const { joinTypeLabel, joinTypeHelp, repeatsHelp } = useMergeNodeCopy();
    const rowsLabel = (count: number) =>
        interpolateUiString(
            getUiString(
                count === 1
                    ? 'aiAgent.composer.semanticNode.rows.singular'
                    : 'aiAgent.composer.semanticNode.rows.plural',
            ),
            { count },
        );
    return (
        <Stack gap={6}>
            <DetailsRow
                icon={IconStack2}
                label={getUiString('aiAgent.composer.mergeNode.sources')}
            >
                <Stack gap={4}>
                    {summary.sources.map((source) => (
                        <Group
                            key={source.nodeId}
                            gap={6}
                            className={styles.source}
                            data-testid="merge-node-source"
                        >
                            <Text fz="xs" fw={500} truncate>
                                {source.title}
                            </Text>
                            {exploreLabelBySource[source.nodeId] && (
                                <Group
                                    gap={4}
                                    wrap="nowrap"
                                    className={styles.explore}
                                >
                                    <MantineIcon icon={IconTable} size={13} />
                                    <Text fz="xs" truncate>
                                        {exploreLabelBySource[source.nodeId]}
                                    </Text>
                                </Group>
                            )}
                            {source.keyFields.length > 0 && (
                                <Group gap={4}>
                                    <Text fz="xs" c="dimmed">
                                        {getUiString(
                                            'aiAgent.composer.mergeNode.joinedOn',
                                        )}
                                    </Text>
                                    {source.keyFields.map(({ fieldId }) => (
                                        <FieldChip
                                            key={fieldId}
                                            fieldId={fieldId}
                                            fieldsMap={
                                                fieldsMapBySource[
                                                    source.nodeId
                                                ] ?? {}
                                            }
                                        />
                                    ))}
                                </Group>
                            )}
                            {source.repeatValues && (
                                <RepeatsValuesBadge
                                    help={repeatsHelp(summary, source.nodeId)}
                                />
                            )}
                        </Group>
                    ))}
                </Stack>
            </DetailsRow>
            <DetailsRow
                icon={IconLayersIntersect}
                label={getUiString('aiAgent.composer.mergeNode.joinType')}
            >
                <Text fz="xs" className={styles.prose}>
                    <Text span fz="xs" fw={500}>
                        {joinTypeLabel(summary)}
                    </Text>{' '}
                    <Text span fz="xs" c="dimmed">
                        {joinTypeHelp(summary)}
                    </Text>
                </Text>
            </DetailsRow>
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
                    <Text fz="xs" c="dimmed" className={styles.prose}>
                        {rowsLabel(summary.limit)}
                    </Text>
                </DetailsRow>
            )}
        </Stack>
    );
};
