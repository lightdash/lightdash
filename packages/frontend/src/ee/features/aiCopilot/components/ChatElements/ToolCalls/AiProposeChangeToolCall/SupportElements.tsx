import { capitalize } from '@lightdash/common';
import { Group, Text } from '@mantine-8/core';
import { IconChevronRight, IconTable } from '@tabler/icons-react';
import MantineIcon from '../../../../../../../components/common/MantineIcon';

type EntityBreadcrumbProps = {
    entityTableName: string;
};

export const TableBreadcrumb = ({ entityTableName }: EntityBreadcrumbProps) => (
    <Group gap="xxs" align="center" c="ldGray.7">
        <MantineIcon icon={IconTable} size={12} />
        <Text size="xs" fw={600}>
            {capitalize(entityTableName)}
        </Text>
    </Group>
);

type FieldBreadcrumbProps = EntityBreadcrumbProps & {
    fieldType: 'dimension' | 'metric';
    fieldId: string;
};

export const FieldBreadcrumb = ({
    entityTableName,
    fieldType,
    fieldId,
}: FieldBreadcrumbProps) => (
    <Group gap="xxs" align="center" c="ldGray.5">
        <MantineIcon icon={IconTable} size={12} />
        <Text size="xs" fw={500}>
            {capitalize(entityTableName)}
        </Text>
        <MantineIcon icon={IconChevronRight} size="sm" />
        <Text size="xs" fw={600} c="ldGray.7">
            {capitalize(fieldType)}:
        </Text>
        <Text size="xs" c="ldGray.7" component="code" fw={600}>
            {fieldId}
        </Text>
    </Group>
);
