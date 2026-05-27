import { rem, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

type Props = {
    action: 'read' | 'edit' | 'create';
    slug: string;
    type: 'dashboard' | 'chart';
};

export const ContentEditorToolCallDescription: FC<Props> = ({
    action,
    slug,
    type,
}) => (
    <Text c="dimmed" size="xs">
        {action === 'read' ? 'Read' : action === 'edit' ? 'Edited' : 'Created'}{' '}
        {type} <ToolCallChip mx={rem(2)}>{slug}</ToolCallChip>
    </Text>
);
