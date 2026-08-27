import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

type Props = {
    action: 'read' | 'edit' | 'create';
    slug: string;
    type: 'dashboard' | 'chart' | 'data_app';
};

const CONTENT_TYPE_LABELS: Record<Props['type'], string> = {
    dashboard: 'dashboard',
    chart: 'chart',
    data_app: 'data app',
};

export const ContentEditorToolCallDescription: FC<Props> = ({
    action,
    slug,
    type,
}) => (
    <Text c="dimmed" size="xs">
        {action === 'read' ? 'Read' : action === 'edit' ? 'Edited' : 'Created'}{' '}
        {CONTENT_TYPE_LABELS[type]}{' '}
        <ToolCallChip mx={rem(2)}>{slug}</ToolCallChip>
    </Text>
);
