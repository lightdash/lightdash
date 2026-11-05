import type { AiAgentDocumentStructuredSummary } from '@lightdash/common';
import { Text } from '@mantine/core';
import Callout from '../../../../components/common/Callout';

type Props = {
    summary: AiAgentDocumentStructuredSummary;
};

export const AiAgentDocumentRelevanceCard = ({ summary }: Props) => {
    const { warning, relevance } = summary;
    const isNotRelevant =
        !!warning || relevance === 'low' || relevance === 'none';

    if (!isNotRelevant) return null;

    return (
        <Callout variant="warning">
            <Text size="xs">
                {warning ??
                    'This document does not appear to relate to the project — the agent may ignore it.'}
            </Text>
        </Callout>
    );
};
