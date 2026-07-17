import { type HomepageBlock } from '@lightdash/common';

// How wide a single-block row of this type should render. Formalises the
// magic widths that used to live as ad-hoc maps in PublishedHomepage.
export type BlockWidthTier = 'reading' | 'composer' | 'content' | 'full';

// Vertical weight used to derive the gap *before* a block: a `grouped` block
// tucks under what precedes it; a `section` block starts a new section.
export type BlockRhythm = 'section' | 'grouped';

export type BlockLayoutTrait = {
    widthTier: BlockWidthTier;
    // Relative flex weight when this block shares a row with others.
    columnWeight: number;
    rhythm: BlockRhythm;
    // Full-row blocks can never share a row (enforced by configOps guards).
    fullRowOnly: boolean;
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
    },
    'quick-actions': {
        widthTier: 'content',
        columnWeight: 1,
        rhythm: 'grouped',
        fullRowOnly: false,
    },
    metrics: {
        widthTier: 'full',
        columnWeight: 2,
        rhythm: 'section',
        fullRowOnly: false,
    },
    collection: {
        widthTier: 'full',
        columnWeight: 2,
        rhythm: 'section',
        fullRowOnly: false,
    },
    resources: {
        widthTier: 'content',
        columnWeight: 1,
        rhythm: 'grouped',
        fullRowOnly: false,
    },
    announcements: {
        widthTier: 'reading',
        columnWeight: 1,
        rhythm: 'section',
        fullRowOnly: false,
    },
    favorites: {
        widthTier: 'content',
        columnWeight: 1,
        rhythm: 'grouped',
        fullRowOnly: false,
    },
    recent: {
        widthTier: 'content',
        columnWeight: 1,
        rhythm: 'grouped',
        fullRowOnly: false,
    },
    markdown: {
        widthTier: 'reading',
        columnWeight: 1,
        rhythm: 'grouped',
        fullRowOnly: false,
    },
};

export const traitFor = (type: HomepageBlock['type']): BlockLayoutTrait =>
    blockLayoutTraits[type];
