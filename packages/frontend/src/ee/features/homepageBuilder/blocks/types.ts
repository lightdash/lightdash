import { type HomepageBlock } from '@lightdash/common';

// Where a block view renders: the page's centred hero slot or an inline body
// row. Omission means 'inline'. Only ask-ai-hero currently differentiates.
export type BlockPresentation = 'hero' | 'inline';

export type BlockComponentProps = {
    block: HomepageBlock;
    projectUuid: string;
    presentation?: BlockPresentation;
    // Page-grid columns one of this block's cards spans, from the resolver.
    // null for blocks that don't render a card grid, or that render outside a
    // resolved row (the hero slot). Required, not optional: a call site that
    // silently omits it renders every card full width, and that failed once
    // already — the compiler now catches it instead of a reviewer.
    itemSpan: number | null;
};

export type BuildComponentProps = BlockComponentProps & {
    onChange: (block: HomepageBlock) => void;
};
