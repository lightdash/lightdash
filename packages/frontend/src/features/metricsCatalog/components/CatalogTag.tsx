import type { CatalogItem } from '@lightdash/common';
import { Badge } from '@mantine/core';
import type { FC } from 'react';

type Props = {
    tag: Pick<CatalogItem['catalogTags'][number], 'name' | 'color'>;
};

export const CatalogTag: FC<Props> = ({ tag }) => {
    return (
        <Badge
            key={tag.name}
            size="sm"
            variant="light"
            radius="sm"
            styles={(theme) => ({
                root: {
                    textTransform: 'none',
                    fontWeight: 450,
                    border: `1px solid ${theme.fn.lighten(tag.color, 0.5)}`,
                    backgroundColor: theme.fn.lighten(tag.color, 0.9),
                    color: theme.fn.darken(tag.color, 0.2),
                    cursor: 'pointer',
                    '&:hover': {
                        backgroundColor: theme.fn.lighten(tag.color, 0.8),
                    },
                },
            })}
        >
            {tag.name}
        </Badge>
    );
};
