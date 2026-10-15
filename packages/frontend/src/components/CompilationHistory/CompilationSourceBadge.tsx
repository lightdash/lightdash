import { Badge, type DefaultMantineColor } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { getSourceLabel, isCompilationSource } from './types';

const SOURCE_COLORS: Record<string, DefaultMantineColor> = {
    refresh_dbt: 'indigo',
    cli_deploy: 'pink',
    create_project: 'cyan',
    project_connection_form: 'teal',
} as const;

type CompilationSourceBadgeProps = {
    source: string;
};

export const CompilationSourceBadge = ({
    source,
}: CompilationSourceBadgeProps) => {
    const { t } = useTranslation('projectConnection');
    const color = SOURCE_COLORS[source] ?? 'gray';

    return (
        <Badge
            color={color}
            size="sm"
            radius="md"
            py={10}
            h={24}
            style={(theme) => ({
                border: `1px solid ${theme.colors[color][2]}`,
                textTransform: 'none',
                boxShadow: '0px -1px 0px 0px rgba(4, 4, 4, 0.04) inset',
            })}
        >
            {isCompilationSource(source) ? getSourceLabel(t, source) : source}
        </Badge>
    );
};
