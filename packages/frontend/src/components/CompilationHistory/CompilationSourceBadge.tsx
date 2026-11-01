import { Badge, type DefaultMantineColor } from '@mantine/core';
import classes from './CompilationSourceBadge.module.css';
import { SOURCE_LABELS } from './types';

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
    const color = SOURCE_COLORS[source] ?? 'gray';

    return (
        <Badge
            color={color}
            size="sm"
            radius="md"
            py={10}
            h={24}
            className={classes.badge}
            style={{
                '--source-badge-border': `var(--mantine-color-${color}-2)`,
            }}
        >
            {source in SOURCE_LABELS
                ? SOURCE_LABELS[source as keyof typeof SOURCE_LABELS]
                : source}
        </Badge>
    );
};
