import { type HomepageBlock, type HomepageConfig } from '@lightdash/common';
import { Box, Paper, Text } from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';
import { type BlockWidthTier } from './blockLayout';
import { getBlockDefinition } from './blocks/registry';
import layout from './homepageLayout.module.css';
import {
    resolveHomepageLayout,
    type ResolvedRow,
} from './resolveHomepageLayout';

const PERSONAL_BLOCK_TYPES: HomepageBlock['type'][] = ['favorites', 'recent'];

const TIER_CLASS: Record<BlockWidthTier, string> = {
    reading: layout.tierReading,
    composer: layout.tierComposer,
    content: layout.tierContent,
    full: layout.tierFull,
};

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
    return <View block={block} projectUuid={projectUuid} />;
};

const RowRenderer: FC<{
    row: ResolvedRow;
    projectUuid: string;
    personalPlaceholders: boolean;
}> = ({ row, projectUuid, personalPlaceholders }) => (
    <Box
        className={`${layout.row} ${TIER_CLASS[row.widthTier]}`}
        data-gap={row.gap}
    >
        {row.columns.map((column) => (
            <Box
                key={column.block.id}
                className={layout.col}
                data-weight={column.weight}
            >
                <BlockRenderer
                    block={column.block}
                    projectUuid={projectUuid}
                    personalPlaceholders={personalPlaceholders}
                />
            </Box>
        ))}
    </Box>
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
    const { heroRow, rows } = resolveHomepageLayout(config);

    return (
        <div className={layout.page}>
            {topBar}
            {heroRow && (
                <div className={layout.heroSection}>
                    <div className={layout.hero}>
                        <BlockRenderer
                            block={heroRow.columns[0].block}
                            projectUuid={projectUuid}
                            personalPlaceholders={personalPlaceholders}
                        />
                    </div>
                </div>
            )}
            {rows.length > 0 && (
                <div className={layout.secondary}>
                    {rows.map((row) => (
                        <RowRenderer
                            key={row.id}
                            row={row}
                            projectUuid={projectUuid}
                            personalPlaceholders={personalPlaceholders}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
