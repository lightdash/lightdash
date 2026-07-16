import {
    type HomepageBlock,
    type HomepageConfig,
    type HomepageRow,
} from '@lightdash/common';
import { Box, Group, Paper, Stack, Text } from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';
import { getBlockDefinition } from './blocks/registry';
import layout from './homepageLayout.module.css';
import classes from './PublishedHomepage.module.css';

const PERSONAL_BLOCK_TYPES: HomepageBlock['type'][] = ['favorites', 'recent'];

// Composer-style blocks read better narrow and centered, like day-0's own
// hero, instead of stretching to the full row width other blocks use.
const NARROW_BLOCK_TYPES: HomepageBlock['type'][] = ['ask-ai-hero'];

// A leading hero block gets the vertically-centred day-0 treatment.
const HERO_BLOCK_TYPES: HomepageBlock['type'][] = ['ask-ai-hero'];

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

const HomepageRows: FC<{
    rows: HomepageRow[];
    projectUuid: string;
    personalPlaceholders: boolean;
}> = ({ rows, projectUuid, personalPlaceholders }) => (
    <Stack gap={28}>
        {rows.map((row) => (
            <Group key={row.id} gap={14} align="stretch" wrap="nowrap">
                {row.blocks.map((block) => (
                    <Box key={block.id} flex={1} miw={0}>
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

type Props = {
    config: HomepageConfig;
    projectUuid: string;
    /** Render personal blocks as placeholders (admin view-as preview) */
    personalPlaceholders?: boolean;
    /** Content pinned at the very top of the page, above the centred hero
     * (e.g. the compact personal favorites bar). */
    topBar?: ReactNode;
};

export const PublishedHomepage: FC<Props> = ({
    config,
    projectUuid,
    personalPlaceholders = false,
    topBar = null,
}) => {
    const [firstRow, ...restRows] = config.rows;
    const leadingHero =
        firstRow &&
        firstRow.blocks.length === 1 &&
        HERO_BLOCK_TYPES.includes(firstRow.blocks[0].type)
            ? firstRow.blocks[0]
            : null;

    if (leadingHero) {
        return (
            <div className={layout.page}>
                {topBar}
                <div className={layout.heroSection}>
                    <div className={layout.hero}>
                        <BlockRenderer
                            block={leadingHero}
                            projectUuid={projectUuid}
                            personalPlaceholders={personalPlaceholders}
                        />
                    </div>
                </div>
                {restRows.length > 0 && (
                    <div className={layout.secondary}>
                        <HomepageRows
                            rows={restRows}
                            projectUuid={projectUuid}
                            personalPlaceholders={personalPlaceholders}
                        />
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={layout.page}>
            {topBar}
            <div className={layout.secondary}>
                <HomepageRows
                    rows={config.rows}
                    projectUuid={projectUuid}
                    personalPlaceholders={personalPlaceholders}
                />
            </div>
        </div>
    );
};
