import {
    assertUnreachable,
    type HomepageBlock,
    type HomepageConfig,
} from '@lightdash/common';
import { type BlockWidthTier, traitFor } from './blockLayout';

// Only a single-block leading row of one of these types gets the day-0 style
// vertically-centred hero treatment.
const LEADING_HERO_TYPES: HomepageBlock['type'][] = ['ask-ai-hero'];

// Chrome-like rows that may sit above the composer without demoting it — they
// join the hero composition instead (day-0 has its chips above the hero too).
const HERO_COMPANION_TYPES: HomepageBlock['type'][] = ['quick-actions'];

// Gap before a row, as a token resolved to px in CSS. The first row of a
// section has no gap (the section's own spacing separates it).
export type RowGap = 'none' | 'grouped' | 'section';

// 'viewport' = the hero is the only content, centred in the full viewport
// (day-0 feel). 'shared' = body rows follow, so the hero yields part of the
// viewport and the first row peeks above the fold.
export type HeroPresentation = 'viewport' | 'shared';

// 'intro' = a lone leading text block that opens the page and gets breathing
// room; everything else is 'body'.
export type RowRole = 'intro' | 'body';

export type ResolvedColumn = {
    block: HomepageBlock;
    weight: number;
    // Intrinsic width in card units for hug rows. Card-grid blocks are
    // container-relative (SimpleGrid / percentage tracks), so they have no
    // natural width — this assigns one from their item count. null = the
    // block's own content width (lists, pills, text).
    hugUnits: 1 | 2 | 3 | 4 | null;
};

// 'hug' = the row's cluster sizes to its content and centres as one unit
// (multi-column rows); 'fill' = the row stretches to its width tier.
export type RowFit = 'hug' | 'fill';

export type ResolvedRow = {
    id: string;
    gap: RowGap;
    // Max-width tier for the whole row. Single-block rows use their block's
    // tier; multi-column rows always span full width.
    widthTier: BlockWidthTier;
    role: RowRole;
    fit: RowFit;
    columns: ResolvedColumn[];
};

export type ResolvedLayout = {
    // The leading hero composition, rendered vertically-centred above
    // everything: optional chrome rows (quick-actions) + the composer row.
    hero: {
        companions: ResolvedRow[];
        row: ResolvedRow;
        presentation: HeroPresentation;
    } | null;
    // Every other row, in order, with gaps derived from adjacency.
    rows: ResolvedRow[];
};

const isLeadingHero = (blocks: HomepageBlock[]): boolean =>
    blocks.length === 1 && LEADING_HERO_TYPES.includes(blocks[0].type);

// Blocks whose config makes them provably render nothing (their Views return
// null). The layout reasons about what will actually paint: an invisible block
// must not demote the hero, leave a phantom row gap, or hold a ghost column.
const isConfigEmptyBlock = (block: HomepageBlock): boolean => {
    switch (block.type) {
        case 'announcements':
        case 'collection':
        case 'resources':
        case 'metrics':
            return block.config.items.length === 0;
        case 'quick-actions':
            return block.config.actions.length === 0;
        case 'markdown':
            return block.config.content.trim() === '';
        // Visibility depends on runtime data (viewer, AI availability), not
        // config — always treat as visible.
        case 'ask-ai-hero':
        case 'favorites':
        case 'recent':
            return false;
        default:
            return assertUnreachable(block, 'Unknown homepage block type');
    }
};

const toVisibleRows = (rows: HomepageConfig['rows']): HomepageConfig['rows'] =>
    rows
        .map((row) => ({
            ...row,
            blocks: row.blocks.filter((block) => !isConfigEmptyBlock(block)),
        }))
        .filter((row) => row.blocks.length > 0);

// A collection's trait weight (2) assumes it has enough cards to fill a wide
// column with its centred 3-col grid. With only 1-2 items the extra width is
// just empty margin around a centred card, and it starves whatever it shares
// the row with — so weight follows actual item count, not just block type.
const columnWeightFor = (block: HomepageBlock): number => {
    if (block.type === 'collection') {
        return block.config.items.length >= 3 ? 2 : 1;
    }
    return traitFor(block.type).columnWeight;
};

const clampUnits = (count: number, max: 1 | 2 | 3 | 4): 1 | 2 | 3 | 4 => {
    const clamped = Math.min(Math.max(count, 1), max);
    return clamped as 1 | 2 | 3 | 4;
};

const hugUnitsFor = (block: HomepageBlock): ResolvedColumn['hugUnits'] => {
    switch (block.type) {
        case 'metrics':
            return clampUnits(block.config.items.length, 4);
        case 'collection':
            return clampUnits(block.config.items.length, 3);
        // Resources render as a self-sizing list/media grid — natural width.
        case 'resources':
        case 'announcements':
        case 'favorites':
        case 'recent':
        case 'markdown':
        case 'quick-actions':
        case 'ask-ai-hero':
            return null;
        default:
            return assertUnreachable(block, 'Unknown homepage block type');
    }
};

const resolveRow = (
    row: HomepageConfig['rows'][number],
    isFirst: boolean,
): ResolvedRow => {
    const columns: ResolvedColumn[] = row.blocks.map((block) => ({
        block,
        weight: columnWeightFor(block),
        hugUnits: hugUnitsFor(block),
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
    return {
        id: row.id,
        gap,
        widthTier,
        role: 'body',
        fit: single ? 'fill' : 'hug',
        columns,
    };
};

// Width smoothing keeps the page to two visual axes. Focal rows (reading /
// composer) are never widened — line length is sacred. Content rows join the
// page's wide axis when any full row exists, so card-grid edges align instead
// of zigzagging between four different widths.
const smoothWidthTiers = (rows: ResolvedRow[]): ResolvedRow[] => {
    if (!rows.some((row) => row.widthTier === 'full')) return rows;
    return rows.map((row) =>
        row.widthTier === 'content' ? { ...row, widthTier: 'full' } : row,
    );
};

// A page that opens with a lone text block reads as a page intro: it gets
// breathing room above, and the next row breaks away as its own section.
const applyIntroRole = (rows: ResolvedRow[]): ResolvedRow[] => {
    const [first, second, ...rest] = rows;
    if (
        !first ||
        first.columns.length !== 1 ||
        first.columns[0].block.type !== 'markdown'
    ) {
        return rows;
    }
    return [
        { ...first, role: 'intro' as const },
        ...(second ? [{ ...second, gap: 'section' as const }] : []),
        ...rest,
    ];
};

// 'view' hides config-empty blocks and hoists the leading hero; 'build' keeps
// every config row/block 1:1 (empty blocks stay editable) and leaves the hero
// in flow, while sharing all width/fit/hug math — so the edit canvas and the
// published page cannot drift.
export type LayoutSurface = 'view' | 'build';

export const resolveHomepageLayout = (
    config: HomepageConfig,
    opts: { surface: LayoutSurface } = { surface: 'view' },
): ResolvedLayout => {
    const isBuild = opts.surface === 'build';
    const visibleRows = isBuild ? config.rows : toVisibleRows(config.rows);
    // Leading chrome rows join the hero rather than demoting it: the composer
    // is still "leading" with a quick-actions strip above it.
    const composerIdx = visibleRows.findIndex(
        (row) =>
            !row.blocks.every((b) => HERO_COMPANION_TYPES.includes(b.type)),
    );
    const composerRow = composerIdx >= 0 ? visibleRows[composerIdx] : undefined;
    const hasLeadingHero =
        !isBuild && !!composerRow && isLeadingHero(composerRow.blocks);
    const bodyRows = hasLeadingHero
        ? visibleRows.slice(composerIdx + 1)
        : visibleRows;
    const resolved = bodyRows.map((row, index) => resolveRow(row, index === 0));
    const smoothed = smoothWidthTiers(resolved);
    const rows = hasLeadingHero ? smoothed : applyIntroRole(smoothed);
    // A hero keeps the whole viewport only when it's alone; with body rows it
    // yields so the first row peeks above the fold.
    const hero = hasLeadingHero
        ? {
              companions: visibleRows
                  .slice(0, composerIdx)
                  .map((row) => resolveRow(row, true)),
              row: resolveRow(composerRow, true),
              presentation:
                  rows.length > 0 ? ('shared' as const) : ('viewport' as const),
          }
        : null;
    return { hero, rows };
};
