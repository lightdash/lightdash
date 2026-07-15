import { type HomepageBlock, type HomepageConfig } from '@lightdash/common';
import { Box, Group, Paper, Stack, Text } from '@mantine-8/core';
import { type FC } from 'react';
import { getBlockDefinition } from './blocks/registry';
import classes from './PublishedHomepage.module.css';

const PERSONAL_BLOCK_TYPES: HomepageBlock['type'][] = ['favorites', 'recent'];

// Composer-style blocks read better narrow and centered, like day-0's own
// hero, instead of stretching to the full row width other blocks use.
const NARROW_BLOCK_TYPES: HomepageBlock['type'][] = ['ask-ai-hero'];

// Unknown block types render nothing so newer configs degrade gracefully
const BlockRenderer: FC<{
    block: HomepageBlock;
    projectUuid: string;
    personalPlaceholders: boolean;
}> = ({ block, projectUuid, personalPlaceholders }) => {
    const definition = getBlockDefinition(block.type);
    if (!definition) return null;
    if (personalPlaceholders && PERSONAL_BLOCK_TYPES.includes(block.type)) {
        return (
            <Paper withBorder p="md" h="100%">
                <Text size="sm" fw={600}>
                    {block.type === 'favorites'
                        ? 'Favorites'
                        : 'Recently viewed'}
                </Text>
                <Text size="xs" c="dimmed">
                    Personal to each viewer — the target user sees their own
                    content here.
                </Text>
            </Paper>
        );
    }
    const { View } = definition;
    const rendered = <View block={block} projectUuid={projectUuid} />;
    return NARROW_BLOCK_TYPES.includes(block.type) ? (
        <Box className={classes.narrowBlock}>{rendered}</Box>
    ) : (
        rendered
    );
};

type Props = {
    config: HomepageConfig;
    projectUuid: string;
    /** Render personal blocks as placeholders (admin view-as preview) */
    personalPlaceholders?: boolean;
};

export const PublishedHomepage: FC<Props> = ({
    config,
    projectUuid,
    personalPlaceholders = false,
}) => (
    <Stack gap={28} className={classes.container}>
        {config.rows.map((row) => (
            <Group key={row.id} gap={14} align="stretch" wrap="nowrap">
                {row.blocks.map((block) => (
                    <Box key={block.id} style={{ flex: 1, minWidth: 0 }}>
                        <BlockRenderer
                            block={block}
                            projectUuid={projectUuid}
                            personalPlaceholders={personalPlaceholders}
                        />
                    </Box>
                ))}
            </Group>
        ))}
    </Stack>
);
