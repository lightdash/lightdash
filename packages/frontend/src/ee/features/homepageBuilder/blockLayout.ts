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
};

// Declarative per-type layout. A resolver composes these for whatever
// arrangement an admin builds, so any permutation renders balanced without
// per-combination hardcoding.
const blockLayoutTraits: Record<HomepageBlock['type'], BlockLayoutTrait> = {
    hero: { widthTier: 'content', columnWeight: 2, rhythm: 'section' },
    'ask-ai-hero': {
        widthTier: 'composer',
        columnWeight: 2,
        rhythm: 'section',
    },
    'quick-actions': {
        widthTier: 'content',
        columnWeight: 1,
        rhythm: 'grouped',
    },
    metrics: { widthTier: 'full', columnWeight: 2, rhythm: 'section' },
    collection: { widthTier: 'full', columnWeight: 2, rhythm: 'section' },
    resources: { widthTier: 'content', columnWeight: 1, rhythm: 'grouped' },
    announcements: {
        widthTier: 'reading',
        columnWeight: 1,
        rhythm: 'section',
    },
    favorites: { widthTier: 'content', columnWeight: 1, rhythm: 'grouped' },
    recent: { widthTier: 'content', columnWeight: 1, rhythm: 'grouped' },
    markdown: { widthTier: 'reading', columnWeight: 1, rhythm: 'grouped' },
};

export const traitFor = (type: HomepageBlock['type']): BlockLayoutTrait =>
    blockLayoutTraits[type];
