import { Badge, type DefaultMantineColor } from '@mantine-8/core';
import { SOURCE_LABELS } from './types';

const SOURCE_COLORS: Record<string, DefaultMantineColor> = {
    refresh_dbt: 'indigo',
    cli_deploy: 'pink',
    create_project: 'cyan',
} as const;

type CompilationSourceBadgeProps = {
    source: string;
};

export const CompilationSourceBadge = ({
    source,
}: CompilationSourceBadgeProps) => {
    const color = SOURCE_COLORS[source] ?? 'gray';

    return (
        <Badge
            color={color}
            variant="light"
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
            {source in SOURCE_LABELS
                ? SOURCE_LABELS[source as keyof typeof SOURCE_LABELS]
                : source}
        </Badge>
    );
};
