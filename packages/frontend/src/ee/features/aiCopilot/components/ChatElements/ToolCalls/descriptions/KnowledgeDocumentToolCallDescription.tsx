import {
    type getKnowledgeDocumentContentTool,
    type ToolOutput,
} from '@lightdash/common';
import { rem, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { formatFileSize } from '../../../../../../../utils/formatters';
import { ToolCallChip } from '../ToolCallChip';

type ToolGetKnowledgeDocumentContentOutput = ToolOutput<
    typeof getKnowledgeDocumentContentTool
>;

type Props = {
    documentUuid: string;
    toolOutput: ToolGetKnowledgeDocumentContentOutput | undefined;
};

export const KnowledgeDocumentToolCallDescription: FC<Props> = ({
    documentUuid,
    toolOutput,
}) => {
    const metadata = toolOutput?.metadata;
    const success = metadata?.status === 'success' ? metadata : null;

    return (
        <Text c="dimmed" size="xs">
            Read knowledge document{' '}
            <ToolCallChip mx={rem(2)}>
                {success?.name ?? documentUuid}
            </ToolCallChip>
            {success && ` (${formatFileSize(success.contentSizeBytes)})`}
        </Text>
    );
};
