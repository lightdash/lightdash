import {
    friendlyName,
    type FunnelSourceQuery,
    type ItemsMap,
} from '@lightdash/common';
import { Group, Stack, Text } from '@mantine/core';
import { Fragment, type FC, type ReactNode } from 'react';
import { useUiStrings } from '../../../../../providers/Embed/useUiStrings';
import {
    sortedFunnelSteps,
    useRangeLabel,
    useWindowPhrase,
} from './funnelNodeLabels';
import { FunnelEventFieldChips } from './FunnelNodeParts';
import styles from './FunnelNodeSentence.module.css';
import { RowText } from './NodeDetailsRow';
import { nodeFieldLabel } from './nodeFieldLabel';

/** Interpolates `{token}`s with nodes, keeping each node's markup. */
const interpolateNodes = (
    template: string,
    values: Record<string, ReactNode>,
): ReactNode =>
    template.split(/(\{\w+\})/).map((part, index) => {
        const token = /^\{(\w+)\}$/.exec(part)?.[1];
        return (
            <Fragment key={index}>
                {token !== undefined && token in values ? values[token] : part}
            </Fragment>
        );
    });

const Em: FC<{ children: ReactNode }> = ({ children }) => (
    <Text span inherit className={styles.em}>
        {children}
    </Text>
);

/** The funnel stated as one sentence, with its event fields beneath. */
export const FunnelNodeSentence: FC<{
    query: FunnelSourceQuery;
    fieldsMap: ItemsMap;
}> = ({ query, fieldsMap }) => {
    const getUiString = useUiStrings();
    const windowPhrase = useWindowPhrase();
    const rangeLabel = useRangeLabel();
    // Preset labels are title case ("Last 30 days"); mid-sentence they are not.
    const inSentence = (label: string) =>
        query.dateRange.type === 'preset'
            ? label.charAt(0).toLowerCase() + label.slice(1)
            : label;
    const [first, ...rest] = sortedFunnelSteps(query);
    const listAnd = getUiString('aiAgent.composer.funnelNode.sentence.listAnd');
    const restList = rest.map((step, index) => (
        <Fragment key={step.stepOrder}>
            {index > 0 && (index === rest.length - 1 ? listAnd : ', ')}
            <Em>{friendlyName(step.eventName)}</Em>
        </Fragment>
    ));

    return (
        <Stack gap={8}>
            <Text className={styles.sentence} data-testid="funnel-sentence">
                {interpolateNodes(
                    getUiString('aiAgent.composer.funnelNode.sentence.lead'),
                    {
                        first: <Em>{friendlyName(first.eventName)}</Em>,
                        rest: restList,
                    },
                )}
                {interpolateNodes(
                    getUiString('aiAgent.composer.funnelNode.sentence.rule'),
                    {
                        window: <Em>{windowPhrase(query)}</Em>,
                        range: (
                            <Em>{inSentence(rangeLabel(query.dateRange))}</Em>
                        ),
                    },
                )}
                {query.breakdownDimensionId &&
                    interpolateNodes(
                        getUiString(
                            'aiAgent.composer.funnelNode.sentence.breakdown',
                        ),
                        {
                            breakdown: (
                                <Em>
                                    {nodeFieldLabel(
                                        fieldsMap,
                                        query.breakdownDimensionId,
                                    )}
                                </Em>
                            ),
                        },
                    )}
                .
            </Text>
            <Group gap={4}>
                <FunnelEventFieldChips query={query} fieldsMap={fieldsMap} />
                <RowText>
                    {getUiString(
                        query.breakdownDimensionId
                            ? 'aiAgent.composer.funnelNode.returnsNoteBreakdown'
                            : 'aiAgent.composer.funnelNode.returnsNote',
                    )}
                </RowText>
            </Group>
        </Stack>
    );
};
