import { type HomepageBlock } from '@lightdash/common';
import { IconMarkdown, type Icon } from '@tabler/icons-react';
import { type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MarkdownBlockBuild, MarkdownBlockView } from './MarkdownBlock';

export type BlockDefinition = {
    type: HomepageBlock['type'];
    label: string;
    description: string;
    icon: Icon;
    defaultConfig: () => HomepageBlock['config'];
    View: FC<{ block: HomepageBlock }>;
    Build: FC<{
        block: HomepageBlock;
        onChange: (config: HomepageBlock['config']) => void;
    }>;
};

export const blockLibrary: BlockDefinition[] = [
    {
        type: 'markdown',
        label: 'Text / banner',
        description: 'Markdown text, notes or a welcome banner.',
        icon: IconMarkdown,
        defaultConfig: () => ({ content: '## New section\n\nEdit me.' }),
        View: MarkdownBlockView,
        Build: MarkdownBlockBuild,
    },
];

export const getBlockDefinition = (type: string): BlockDefinition | undefined =>
    blockLibrary.find((def) => def.type === type);

export const createBlock = (definition: BlockDefinition): HomepageBlock => ({
    id: uuidv4(),
    type: definition.type,
    config: definition.defaultConfig(),
});
