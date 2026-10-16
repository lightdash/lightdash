import type { AiAgentDocumentStructuredSummary } from '@lightdash/common';
import { Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import Callout from '../../../../components/common/Callout';

type Props = {
    summary: AiAgentDocumentStructuredSummary;
};

export const AiAgentDocumentRelevanceCard = ({ summary }: Props) => {
    const { t } = useTranslation('aiAgent');
    const { warning, relevance } = summary;
    const isNotRelevant =
        !!warning || relevance === 'low' || relevance === 'none';

    if (isNotRelevant) {
        return (
            <Callout variant="warning">
                <Text size="xs">{warning ?? t('knowledge.notRelevant')}</Text>
            </Callout>
        );
    }

    return (
        <Callout variant="neutral">
            <Text size="xs">{t('knowledge.summaryUsage')}</Text>
        </Callout>
    );
};
