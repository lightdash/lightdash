import { type ToolListFieldsArgs } from '@lightdash/common';
import { rem, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

type ListFieldsToolCallDescriptionProps = {
    fields: ToolListFieldsArgs['fields'];
};

export const ListFieldsToolCallDescription: FC<
    ListFieldsToolCallDescriptionProps
> = ({ fields }) => {
    return (
        <Text c="dimmed" size="xs">
            Fetched fields{' '}
            {fields.map((field) => (
                <ToolCallChip
                    key={`${field.explore}-${field.fieldId}`}
                    mx={rem(2)}
                >
                    {field.fieldId}
                </ToolCallChip>
            ))}
        </Text>
    );
};
