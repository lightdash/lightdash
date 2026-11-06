import type { ToolGetMetadataArgs } from '@lightdash/common';
import { Group, rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { ExploreChip } from '../ExploreChip';
import { ToolCallChip } from '../ToolCallChip';

type GetMetadataToolCallDescriptionProps = {
    requests: ToolGetMetadataArgs['requests'];
};

export const GetMetadataToolCallDescription: FC<
    GetMetadataToolCallDescriptionProps
> = ({ requests }) => {
    const items = (requests ?? []).flatMap((request) =>
        request.type === 'explore'
            ? request.exploreIds.map((name) => ({ isExplore: true, name }))
            : request.fields.map((field) => ({
                  isExplore: false,
                  name: field.fieldId,
              })),
    );
    return (
        <Text c="dimmed" size="xs" component="div">
            <Group
                gap={rem(4)}
                align="center"
                wrap="wrap"
                display="inline-flex"
            >
                Read metadata for
                {items.map(({ isExplore, name }, i) =>
                    isExplore ? (
                        <ExploreChip
                            key={`${name}-${i}`}
                            ff="monospace"
                            exploreName={name}
                        />
                    ) : (
                        <ToolCallChip key={`${name}-${i}`} ff="monospace">
                            {name}
                        </ToolCallChip>
                    ),
                )}
            </Group>
        </Text>
    );
};
