import { type HomepageBlock } from '@lightdash/common';
import layout from './homepageLayout.module.css';

// How wide a single-block row of this type should render. Formalises the
// magic widths that used to live as ad-hoc maps in PublishedHomepage.
export type BlockWidthTier = 'reading' | 'composer' | 'content' | 'full';

// Vertical weight used to derive the gap *before* a block: a `grouped` block
// tucks under what precedes it; a `section` block starts a new section.
export type BlockRhythm = 'section' | 'grouped';

// The page is one 12-column grid (the track count lives in
// homepageLayout.module.css). A card-grid block declares how many of those
// columns a single item spans, so every block's card edges land on shared
// tracks instead of each block inventing its own width.
export type BlockItemSpan = {
    // Item span when the block owns a full-width row.
    full: number;
    // Item span at the narrower `content` tier.
    content: number;
    // Item span when the block shares a row with another block.
    narrow: number;
};

export type BlockLayoutTrait = {
    widthTier: BlockWidthTier;
    // Relative flex weight when this block shares a row with others.
    columnWeight: number;
    rhythm: BlockRhythm;
    // Full-row blocks can never share a row (enforced by configOps guards).
    fullRowOnly: boolean;
    // null for blocks that render as a list or prose rather than a card grid.
    itemSpan: BlockItemSpan | null;
};

// Declarative per-type layout. A resolver composes these for whatever
// arrangement an admin builds, so any permutation renders balanced without
// per-combination hardcoding.
const blockLayoutTraits: Record<HomepageBlock['type'], BlockLayoutTrait> = {
    'ask-ai-hero': {
        widthTier: 'composer',
        columnWeight: 2,
        rhythm: 'section',
        fullRowOnly: true,
        itemSpan: null,
    },
    'quick-actions': {
        widthTier: 'content',
        columnWeight: 1,
        rhythm: 'grouped',
        fullRowOnly: false,
        itemSpan: null,
    },
    metrics: {
        widthTier: 'full',
        columnWeight: 2,
        rhythm: 'section',
        fullRowOnly: false,
        itemSpan: { full: 3, content: 4, narrow: 6 },
    },
    collection: {
        widthTier: 'full',
        columnWeight: 2,
        rhythm: 'section',
        fullRowOnly: false,
        itemSpan: { full: 4, content: 4, narrow: 6 },
    },
    resources: {
        widthTier: 'content',
        columnWeight: 1,
        rhythm: 'grouped',
        fullRowOnly: false,
        itemSpan: { full: 4, content: 4, narrow: 6 },
    },
    announcements: {
        widthTier: 'content',
        columnWeight: 1,
        rhythm: 'section',
        fullRowOnly: true,
        itemSpan: null,
    },
    favorites: {
        widthTier: 'content',
        columnWeight: 1,
        rhythm: 'grouped',
        fullRowOnly: false,
        itemSpan: null,
    },
    recent: {
        widthTier: 'content',
        columnWeight: 1,
        rhythm: 'grouped',
        fullRowOnly: false,
        itemSpan: null,
    },
    markdown: {
        // Full width even alone: a text banner joins the page's card-grid
        // axis instead of floating as a narrow reading column.
        widthTier: 'full',
        columnWeight: 1,
        rhythm: 'grouped',
        fullRowOnly: false,
        itemSpan: null,
    },
};

export const traitFor = (type: HomepageBlock['type']): BlockLayoutTrait =>
    blockLayoutTraits[type];

// Width tier → shared layout class, used by both render surfaces.
export const TIER_CLASS: Record<BlockWidthTier, string> = {
    reading: layout.tierReading,
    composer: layout.tierComposer,
    content: layout.tierContent,
    full: layout.tierFull,
};
