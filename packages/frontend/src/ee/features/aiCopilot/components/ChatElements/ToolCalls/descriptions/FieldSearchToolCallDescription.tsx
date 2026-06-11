import { type ToolFindFieldsArgsTransformed } from '@lightdash/common';
import { rem, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

type FieldSearchToolCallDescriptionProps = {
    searchQueries: NonNullable<ToolFindFieldsArgsTransformed>['fieldSearchQueries'];
};

export const FieldSearchToolCallDescription: FC<
    FieldSearchToolCallDescriptionProps
> = ({ searchQueries }) => {
    return (
        <Text c="dimmed" size="xs">
            Searched for fields{' '}
            {searchQueries?.map((query) => (
                <ToolCallChip key={query.label} mx={rem(2)}>
                    {query.label}
                </ToolCallChip>
            ))}
        </Text>
    );
};
