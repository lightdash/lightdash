import { type HomepageBlock, type HomepageConfig } from '@lightdash/common';
import { type BlockWidthTier, traitFor } from './blockLayout';

// Only a single-block leading row of one of these types gets the day-0 style
// vertically-centred hero treatment.
const LEADING_HERO_TYPES: HomepageBlock['type'][] = ['ask-ai-hero'];

// Gap before a row, as a token resolved to px in CSS. The first row of a
// section has no gap (the section's own spacing separates it).
export type RowGap = 'none' | 'grouped' | 'section';

export type ResolvedColumn = {
    block: HomepageBlock;
    weight: number;
};

export type ResolvedRow = {
    id: string;
    gap: RowGap;
    // Max-width tier for the whole row. Single-block rows use their block's
    // tier; multi-column rows always span full width.
    widthTier: BlockWidthTier;
    columns: ResolvedColumn[];
};

export type ResolvedLayout = {
    // The leading hero, rendered vertically-centred above everything, or null.
    heroRow: ResolvedRow | null;
    // Every other row, in order, with gaps derived from adjacency.
    rows: ResolvedRow[];
};

const isLeadingHero = (blocks: HomepageBlock[]): boolean =>
    blocks.length === 1 && LEADING_HERO_TYPES.includes(blocks[0].type);

const resolveRow = (
    row: HomepageConfig['rows'][number],
    isFirst: boolean,
): ResolvedRow => {
    const columns: ResolvedColumn[] = row.blocks.map((block) => ({
        block,
        weight: traitFor(block.type).columnWeight,
    }));
    const single = row.blocks.length === 1;
    const widthTier: BlockWidthTier = single
        ? traitFor(row.blocks[0].type).widthTier
        : 'full';
    const gap: RowGap = (() => {
        if (isFirst) return 'none';
        // The incoming block's rhythm drives the gap: a grouped block tucks
        // tight under whatever precedes it; a section block breaks away.
        return traitFor(row.blocks[0].type).rhythm === 'grouped'
            ? 'grouped'
            : 'section';
    })();
    return { id: row.id, gap, widthTier, columns };
};

export const resolveHomepageLayout = (
    config: HomepageConfig,
): ResolvedLayout => {
    const [first, ...rest] = config.rows;
    const hasLeadingHero = !!first && isLeadingHero(first.blocks);
    const heroRow = hasLeadingHero ? resolveRow(first, true) : null;
    const bodyRows = hasLeadingHero ? rest : config.rows;
    const rows = bodyRows.map((row, index) => resolveRow(row, index === 0));
    return { heroRow, rows };
};
