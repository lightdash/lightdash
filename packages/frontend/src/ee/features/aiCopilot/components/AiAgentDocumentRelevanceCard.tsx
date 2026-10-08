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

    if (isNotRelevant) {
        return (
            <Callout variant="warning">
                <Text size="xs">
                    {warning ??
                        'This document does not appear to relate to the project — the agent may ignore it.'}
                </Text>
            </Callout>
        );
    }

    return (
        <Callout variant="neutral">
            <Text size="xs">
                The agent uses this summary to decide whether to read the file.
                The full text is retrieved on demand.
            </Text>
        </Callout>
    );
};
