import { type ReadContentType } from '@lightdash/common';
import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { ToolCallChip } from '../ToolCallChip';

type Props = {
    action: 'read' | 'edit' | 'create';
    slug: string;
    type: ReadContentType | 'document';
};

const TYPE_LABEL_KEYS: Record<ReadContentType | 'document', string> = {
    dashboard: 'contentEditor.types.dashboard',
    chart: 'contentEditor.types.chart',
    sql_chart: 'contentEditor.types.sqlChart',
    data_app: 'contentEditor.types.dataApp',
    document: 'contentEditor.types.document',
};

const ACTION_KEYS: Record<Props['action'], string> = {
    read: 'contentEditor.read',
    edit: 'contentEditor.edited',
    create: 'contentEditor.created',
};

export const ContentEditorToolCallDescription: FC<Props> = ({
    action,
    slug,
    type,
}) => {
    const { t } = useTranslation('aiCopilotChat');
    return (
        <Text c="dimmed" size="xs">
            <Trans
                t={t}
                i18nKey={ACTION_KEYS[action]}
                values={{ type: t(TYPE_LABEL_KEYS[type]), slug }}
                components={{
                    chip: <ToolCallChip mx={rem(2)}>{slug}</ToolCallChip>,
                }}
            />
        </Text>
    );
};
