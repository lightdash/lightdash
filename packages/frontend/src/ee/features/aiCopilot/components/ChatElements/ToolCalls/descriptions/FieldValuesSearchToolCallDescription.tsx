import { type ToolSearchFieldValuesArgsTransformed } from '@lightdash/common';
import { Badge, rem, Text } from '@mantine-8/core';
import type { FC } from 'react';

type FieldValuesSearchToolCallDescriptionProps = Pick<
    ToolSearchFieldValuesArgsTransformed,
    'fieldId' | 'query'
>;

export const FieldValuesSearchToolCallDescription: FC<
    FieldValuesSearchToolCallDescriptionProps
> = ({ fieldId, query }) => {
    return (
        <Text c="dimmed" size="xs">
            Searched for values in field{' '}
            <Badge
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
                {fieldId}
            </Badge>
            {query && (
                <>
                    {' '}
                    matching{' '}
                    <Badge
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
                        "{query}"
                    </Badge>
                </>
            )}
        </Text>
    );
};
