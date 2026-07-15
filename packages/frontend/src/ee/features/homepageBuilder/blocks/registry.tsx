import { type HomepageBlock } from '@lightdash/common';
import {
    IconLayoutGrid,
    IconMarkdown,
    IconSparkles,
    IconTypography,
    type Icon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AiBlockBuild, AiBlockView } from './AiBlock';
import { CollectionBlockBuild, CollectionBlockView } from './CollectionBlock';
import { HeroBlockBuild, HeroBlockView } from './HeroBlock';
import { MarkdownBlockBuild, MarkdownBlockView } from './MarkdownBlock';
import { type BlockComponentProps, type BuildComponentProps } from './types';

export type BlockDefinition = {
    type: HomepageBlock['type'];
    label: string;
    description: string;
    icon: Icon;
    requiresAi?: boolean;
    create: () => HomepageBlock;
    View: FC<BlockComponentProps>;
    Build: FC<BuildComponentProps>;
};

export const blockLibrary: BlockDefinition[] = [
    {
        type: 'hero',
        label: 'Greeting',
        description:
            'Personalized welcome headline — {name} becomes the viewer.',
        icon: IconTypography,
        create: () => ({
            id: uuidv4(),
            type: 'hero',
            config: {
                title: 'Good morning, {name}',
                subtitle: 'Everything your team needs, in one place.',
            },
        }),
        View: HeroBlockView,
        Build: HeroBlockBuild,
    },
    {
        type: 'ai',
        label: 'Ask AI',
        description: 'Natural-language ask box with curated suggestions.',
        icon: IconSparkles,
        requiresAi: true,
        create: () => ({
            id: uuidv4(),
            type: 'ai',
            config: { chips: ['What drove revenue last month?'] },
        }),
        View: AiBlockView,
        Build: AiBlockBuild,
    },
    {
        type: 'collection',
        label: 'Collection',
        description: 'A curated set of dashboards and charts.',
        icon: IconLayoutGrid,
        create: () => ({
            id: uuidv4(),
            type: 'collection',
            config: { title: 'Key dashboards', items: [] },
        }),
        View: CollectionBlockView,
        Build: CollectionBlockBuild,
    },
    {
        type: 'markdown',
        label: 'Text / banner',
        description: 'Markdown text, notes or a welcome banner.',
        icon: IconMarkdown,
        create: () => ({
            id: uuidv4(),
            type: 'markdown',
            config: { content: '## New section\n\nEdit me.' },
        }),
        View: MarkdownBlockView,
        Build: MarkdownBlockBuild,
    },
];

export const getBlockDefinition = (type: string): BlockDefinition | undefined =>
    blockLibrary.find((def) => def.type === type);
