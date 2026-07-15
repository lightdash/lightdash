import { type HomepageBlock } from '@lightdash/common';

export type BlockComponentProps = {
    block: HomepageBlock;
    projectUuid: string;
};

export type BuildComponentProps = BlockComponentProps & {
    onChange: (block: HomepageBlock) => void;
};
