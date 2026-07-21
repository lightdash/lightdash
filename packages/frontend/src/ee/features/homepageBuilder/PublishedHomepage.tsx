import {
    migrateHomepageConfig,
    type HomepageBlock,
    type HomepageConfig,
} from '@lightdash/common';
import { Box, Paper, Text } from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';
import { TIER_CLASS } from './blockLayout';
import { getBlockDefinition } from './blocks/registry';
import { type BlockPresentation } from './blocks/types';
import layout from './homepageLayout.module.css';
import {
    resolveHomepageLayout,
    type ResolvedRow,
} from './resolveHomepageLayout';

const PERSONAL_BLOCK_TYPES: HomepageBlock['type'][] = ['favorites', 'recent'];

// Unknown block types render nothing so newer configs degrade gracefully
const BlockRenderer: FC<{
    block: HomepageBlock;
    projectUuid: string;
    personalPlaceholders: boolean;
    presentation?: BlockPresentation;
    itemSpan: number | null;
}> = ({ block, projectUuid, personalPlaceholders, presentation, itemSpan }) => {
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
    return (
        <View
            block={block}
            projectUuid={projectUuid}
            presentation={presentation}
            itemSpan={itemSpan}
        />
    );
};

const RowRenderer: FC<{
    row: ResolvedRow;
    projectUuid: string;
    personalPlaceholders: boolean;
}> = ({ row, projectUuid, personalPlaceholders }) => (
    <Box
        className={`${layout.row} ${TIER_CLASS[row.widthTier]}`}
        data-gap={row.gap}
        data-role={row.role}
        data-fit={row.fit}
    >
        {row.columns.map((column) => (
            <Box
                key={column.block.id}
                className={layout.col}
                data-weight={column.weight}
                data-hug-units={column.hugUnits ?? undefined}
            >
                <BlockRenderer
                    block={column.block}
                    projectUuid={projectUuid}
                    personalPlaceholders={personalPlaceholders}
                    itemSpan={column.itemSpan}
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
    const { hero, rows } = resolveHomepageLayout(migrateHomepageConfig(config));

    return (
        <div className={layout.page}>
            {topBar}
            {hero && (
                <div
                    className={layout.heroSection}
                    data-presentation={hero.presentation}
                >
                    {hero.companions.length > 0 && (
                        <div className={layout.heroCompanions}>
                            {hero.companions.map((row) => (
                                <RowRenderer
                                    key={row.id}
                                    row={row}
                                    projectUuid={projectUuid}
                                    personalPlaceholders={personalPlaceholders}
                                />
                            ))}
                        </div>
                    )}
                    <div className={layout.hero}>
                        <BlockRenderer
                            block={hero.row.columns[0].block}
                            projectUuid={projectUuid}
                            personalPlaceholders={personalPlaceholders}
                            presentation="hero"
                            itemSpan={hero.row.columns[0].itemSpan}
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
