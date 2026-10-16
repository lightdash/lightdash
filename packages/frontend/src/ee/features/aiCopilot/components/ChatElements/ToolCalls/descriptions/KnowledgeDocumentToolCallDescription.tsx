import type { ToolGetKnowledgeDocumentContentOutput } from '@lightdash/common';
import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { formatFileSize } from '../../../../../../../utils/formatters';
import { ToolCallChip } from '../ToolCallChip';

type Props = {
    documentUuid: string;
    toolOutput: ToolGetKnowledgeDocumentContentOutput | undefined;
};

export const KnowledgeDocumentToolCallDescription: FC<Props> = ({
    documentUuid,
    toolOutput,
}) => {
    const { t } = useTranslation('aiCopilotChat');
    const metadata = toolOutput?.metadata;
    const success = metadata?.status === 'success' ? metadata : null;

    return (
        <Text c="dimmed" size="xs">
            {t('toolDescriptions.readKnowledgeDocument')}{' '}
            <ToolCallChip mx={rem(2)}>
                {success?.name ?? documentUuid}
            </ToolCallChip>
            {success && ` (${formatFileSize(success.contentSizeBytes)})`}
        </Text>
    );
};
