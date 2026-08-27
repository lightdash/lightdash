import {
    READ_CONTENT_TYPE_LABELS,
    type ReadContentType,
} from '@lightdash/common';
import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

type Props = {
    action: 'read' | 'edit' | 'create';
    slug: string;
    type: ReadContentType;
};

export const ContentEditorToolCallDescription: FC<Props> = ({
    action,
    slug,
    type,
}) => (
    <Text c="dimmed" size="xs">
        {action === 'read' ? 'Read' : action === 'edit' ? 'Edited' : 'Created'}{' '}
        {READ_CONTENT_TYPE_LABELS[type]}{' '}
        <ToolCallChip mx={rem(2)}>{slug}</ToolCallChip>
    </Text>
);
