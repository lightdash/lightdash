import { type ToolFindFieldsArgsTransformed } from '@lightdash/common';
import { Badge, rem, Text } from '@mantine-8/core';
import type { FC } from 'react';

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
                <Badge
                    key={query.label}
                    color="gray"
                    variant="light"
                    size="xs"
                    mx={rem(2)}
                    radius="sm"
                    style={{
                        textTransform: 'none',
                        fontWeight: 400,
                    }}
                >
                    {query.label}
                </Badge>
            ))}
        </Text>
    );
};
