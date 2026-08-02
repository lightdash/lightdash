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
import { useRuntimeEmptyBlocks } from './hooks/useRuntimeEmptyBlocks';
import {
    resolveHomepageLayout,
    type ResolvedRow,
} from './resolveHomepageLayout';
import { RuntimeEmptyBlocksProvider } from './RuntimeEmptyBlocks';

const PERSONAL_BLOCK_TYPES: HomepageBlock['type'][] = ['favorites', 'recent'];

// Unknown block types render nothing so newer configs degrade gracefully
const BlockRenderer: FC<{
    block: HomepageBlock;
    projectUuid: string;
    personalPlaceholders: boolean;
    presentation?: BlockPresentation;
    itemSpan: number | null;
    standalone: boolean;
}> = ({
    block,
    projectUuid,
    personalPlaceholders,
    presentation,
    itemSpan,
    standalone,
}) => {
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
            standalone={standalone}
        />
    );
};

const RowRenderer: FC<{
    row: ResolvedRow;
    projectUuid: string;
    personalPlaceholders: boolean;
}> = ({ row, projectUuid, personalPlaceholders }) => {
    const { emptyBlockIds } = useRuntimeEmptyBlocks();
    // A row whose every block resolved to nothing takes no space and no gap —
    // the same guarantee the resolver gives config-empty blocks, applied to
    // blocks that can only know at runtime.
    //
    // Hidden, NOT unmounted: unmounting removes the block that reported the
    // emptiness, its cleanup clears the flag, the row comes back, the block
    // remounts and reports empty again — an infinite loop. `display: none`
    // takes it out of flow (so no gap either) while leaving the reporter
    // mounted and the state stable.
    const isRuntimeEmpty =
        row.columns.length > 0 &&
        row.columns.every((column) => emptyBlockIds.has(column.block.id));
    return (
        <Box
            className={`${layout.row} ${TIER_CLASS[row.widthTier]}`}
            data-gap={row.gap}
            data-role={row.role}
            data-align={row.align}
            data-fit={row.fit}
            data-runtime-empty={isRuntimeEmpty || undefined}
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
                        standalone={row.columns.length === 1}
                    />
                </Box>
            ))}
        </Box>
    );
};

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
        <RuntimeEmptyBlocksProvider>
            <div className={layout.page}>
                {topBar}
                {hero && (
                    <div
                        className={layout.heroSection}
                        data-presentation={hero.presentation}
                        data-density={hero.density}
                    >
                        {hero.companions.length > 0 && (
                            <div className={layout.heroCompanions}>
                                {hero.companions.map((row) => (
                                    <RowRenderer
                                        key={row.id}
                                        row={row}
                                        projectUuid={projectUuid}
                                        personalPlaceholders={
                                            personalPlaceholders
                                        }
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
                                standalone={hero.row.columns.length === 1}
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
        </RuntimeEmptyBlocksProvider>
    );
};
