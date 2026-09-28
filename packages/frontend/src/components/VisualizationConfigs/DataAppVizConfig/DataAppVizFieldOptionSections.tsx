import {
    getDataAppVizFieldIds,
    type DataAppVizField,
    type DataAppVizFieldMapping,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { type FC, type ReactNode } from 'react';

type Props = {
    fields: DataAppVizField[];
    fieldMapping: DataAppVizFieldMapping;
    group: string | null;
    renderFieldOptions: (
        field: DataAppVizField,
        fieldIds: string[],
        group: string | null,
    ) => ReactNode;
};

const DataAppVizFieldOptionSections: FC<Props> = ({
    fields,
    fieldMapping,
    group,
    renderFieldOptions,
}) =>
    fields.map((field) => {
        const fieldIds = getDataAppVizFieldIds(fieldMapping[field.name]);
        const hasOptions = (field.configOptions ?? []).some(
            (option) => (option.group ?? null) === group,
        );
        if (!hasOptions || fieldIds.length === 0) return null;

        return (
            <Stack key={field.name} gap="xs">
                <Text fz="xs" fw={600}>
                    {field.label}
                </Text>
                {renderFieldOptions(field, fieldIds, group)}
            </Stack>
        );
    });

export default DataAppVizFieldOptionSections;
