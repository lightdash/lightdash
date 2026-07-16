import { type HomepageBlock } from '@lightdash/common';

// Where a block view renders: the page's centred hero slot or an inline body
// row. Omission means 'inline'. Only ask-ai-hero currently differentiates.
export type BlockPresentation = 'hero' | 'inline';

export type BlockComponentProps = {
    block: HomepageBlock;
    projectUuid: string;
    presentation?: BlockPresentation;
};

export type BuildComponentProps = BlockComponentProps & {
    onChange: (block: HomepageBlock) => void;
};
