import { type CatalogField } from '@lightdash/common';
import { Box, Group, Highlight } from '@mantine/core';
import { IconAbc } from '@tabler/icons-react';
import React, { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    field: CatalogField;
    searchString?: string;
    onClick?: () => void;
};

export const CatalogFieldListItem: FC<React.PropsWithChildren<Props>> = ({
    field,
    searchString = '',
    onClick,
}) => {
    const [hovered, setHovered] = useState<boolean | undefined>(false);

    return (
        <>
            <Group
                noWrap
                py="xs"
                sx={(theme) => ({
                    borderRadius: theme.radius.sm,
                    padding: theme.spacing.md,
                    backgroundColor: hovered
                        ? theme.colors.gray[1]
                        : theme.colors.gray[0],
                })}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onClick={onClick}
            >
                <Group noWrap spacing="xs">
                    <MantineIcon
                        icon={IconAbc}
                        color="gray"
                        size="lg"
                    ></MantineIcon>
                </Group>
                <Box miw={150}>
                    <Highlight
                        highlight={searchString}
                        highlightColor="violet"
                        fw={600}
                    >
                        {field.name || ''}
                    </Highlight>
                </Box>
            </Group>
        </>
    );
};
