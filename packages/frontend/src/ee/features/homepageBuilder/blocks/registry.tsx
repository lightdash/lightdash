import { type HomepageBlock } from '@lightdash/common';
import {
    IconBolt,
    IconBook,
    IconChartDots,
    IconClock,
    IconLayoutGrid,
    IconMarkdown,
    IconSparkles,
    IconSpeakerphone,
    IconStar,
    IconTypography,
    type Icon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AiBlockBuild, AiBlockView } from './AiBlock';
import {
    AnnouncementsBlockBuild,
    AnnouncementsBlockView,
} from './AnnouncementsBlock';
import { CollectionBlockBuild, CollectionBlockView } from './CollectionBlock';
import { FavoritesBlockBuild, FavoritesBlockView } from './FavoritesBlock';
import { HeroBlockBuild, HeroBlockView } from './HeroBlock';
import { MarkdownBlockBuild, MarkdownBlockView } from './MarkdownBlock';
import { MetricsBlockBuild, MetricsBlockView } from './MetricsBlock';
import { getDefaultQuickActions } from './quickActionDefaults';
import {
    QuickActionsBlockBuild,
    QuickActionsBlockView,
} from './QuickActionsBlock';
import { RecentBlockBuild, RecentBlockView } from './RecentBlock';
import { ResourcesBlockBuild, ResourcesBlockView } from './ResourcesBlock';
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
        type: 'quick-actions',
        label: 'Quick actions',
        description: 'Primary CTA cards — tailor the main action per audience.',
        icon: IconBolt,
        create: () => ({
            id: uuidv4(),
            type: 'quick-actions',
            config: { actions: getDefaultQuickActions(true) },
        }),
        View: QuickActionsBlockView,
        Build: QuickActionsBlockBuild,
    },
    {
        type: 'metrics',
        label: 'Metrics',
        description: 'KPI cards from the metrics catalog, with deltas.',
        icon: IconChartDots,
        create: () => ({
            id: uuidv4(),
            type: 'metrics',
            config: { title: 'This month', items: [] },
        }),
        View: MetricsBlockView,
        Build: MetricsBlockBuild,
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
        type: 'resources',
        label: 'Resources',
        description: 'Curated links — docs, videos, request forms.',
        icon: IconBook,
        create: () => ({
            id: uuidv4(),
            type: 'resources',
            config: { title: 'Getting started', items: [] },
        }),
        View: ResourcesBlockView,
        Build: ResourcesBlockBuild,
    },
    {
        type: 'announcements',
        label: 'Announcements',
        description: 'Updates from the data team, newest first.',
        icon: IconSpeakerphone,
        create: () => ({
            id: uuidv4(),
            type: 'announcements',
            config: { title: 'From the data team', items: [] },
        }),
        View: AnnouncementsBlockView,
        Build: AnnouncementsBlockBuild,
    },
    {
        type: 'favorites',
        label: 'Favorites',
        description: 'Each viewer’s starred content, only visible to them.',
        icon: IconStar,
        create: () => ({
            id: uuidv4(),
            type: 'favorites',
            config: { title: 'My favorites' },
        }),
        View: FavoritesBlockView,
        Build: FavoritesBlockBuild,
    },
    {
        type: 'recent',
        label: 'Recently viewed',
        description: 'Each viewer’s recently opened charts and dashboards.',
        icon: IconClock,
        create: () => ({
            id: uuidv4(),
            type: 'recent',
            config: { title: 'Recently viewed' },
        }),
        View: RecentBlockView,
        Build: RecentBlockBuild,
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
