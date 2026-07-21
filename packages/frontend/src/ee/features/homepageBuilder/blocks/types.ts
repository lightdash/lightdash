import { type HomepageBlock } from '@lightdash/common';

// Where a block view renders: the page's centred hero slot or an inline body
// row. Omission means 'inline'. Only ask-ai-hero currently differentiates.
export type BlockPresentation = 'hero' | 'inline';

export type BlockComponentProps = {
    block: HomepageBlock;
    projectUuid: string;
    presentation?: BlockPresentation;
    // Page-grid columns one of this block's cards spans, from the resolver.
    // null for blocks that don't render a card grid; omitted by call sites
    // that render a block outside a resolved row (e.g. the hero slot).
    itemSpan?: number | null;
};

export type BuildComponentProps = BlockComponentProps & {
    onChange: (block: HomepageBlock) => void;
};
