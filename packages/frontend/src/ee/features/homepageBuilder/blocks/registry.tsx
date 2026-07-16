import { type HomepageBlock } from '@lightdash/common';
import {
    IconBolt,
    IconBook,
    IconChartDots,
    IconChecklist,
    IconClock,
    IconLayoutGrid,
    IconMarkdown,
    IconMessageChatbot,
    IconSpeakerphone,
    IconStar,
    type Icon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    AnnouncementsBlockBuild,
    AnnouncementsBlockView,
} from './AnnouncementsBlock';
import { AskAiHeroBlockBuild, AskAiHeroBlockView } from './AskAiHeroBlock';
import { CollectionBlockBuild, CollectionBlockView } from './CollectionBlock';
import { FavoritesBlockBuild, FavoritesBlockView } from './FavoritesBlock';
import { MarkdownBlockBuild, MarkdownBlockView } from './MarkdownBlock';
import { MetricsBlockBuild, MetricsBlockView } from './MetricsBlock';
import { getDefaultQuickActions } from './quickActionDefaults';
import {
    QuickActionsBlockBuild,
    QuickActionsBlockView,
} from './QuickActionsBlock';
import { RecentBlockBuild, RecentBlockView } from './RecentBlock';
import { RECOMMENDED_ACTION_KEYS } from './recommendedActionDefaults';
import {
    RecommendedActionsBlockBuild,
    RecommendedActionsBlockView,
} from './RecommendedActionsBlock';
import { ResourcesBlockBuild, ResourcesBlockView } from './ResourcesBlock';
import { type BlockComponentProps, type BuildComponentProps } from './types';

export type BlockDefinition = {
    type: HomepageBlock['type'];
    label: string;
    description: string;
    icon: Icon;
    requiresAi?: boolean;
    /** Can only be added once per homepage. */
    singleton?: boolean;
    create: () => HomepageBlock;
    View: FC<BlockComponentProps>;
    Build: FC<BuildComponentProps>;
};

export const blockLibrary: BlockDefinition[] = [
    {
        type: 'ask-ai-hero',
        label: 'Ask AI',
        description: 'AI chat composer with live suggestions, and a greeting.',
        icon: IconMessageChatbot,
        requiresAi: true,
        singleton: true,
        create: () => ({
            id: uuidv4(),
            type: 'ask-ai-hero',
            config: { showGreeting: true },
        }),
        View: AskAiHeroBlockView,
        Build: AskAiHeroBlockBuild,
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
        singleton: true,
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
        description: 'Rich cards — Claude artifacts, YouTube, docs, links.',
        icon: IconBook,
        create: () => ({
            id: uuidv4(),
            type: 'resources',
            config: { title: 'Getting started', items: [], layout: 'card' },
        }),
        View: ResourcesBlockView,
        Build: ResourcesBlockBuild,
    },
    {
        type: 'announcements',
        label: 'Announcements',
        description: 'Updates from the data team, newest first.',
        icon: IconSpeakerphone,
        singleton: true,
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
        singleton: true,
        create: () => ({
            id: uuidv4(),
            type: 'recent',
            config: { title: 'Recently viewed' },
        }),
        View: RecentBlockView,
        Build: RecentBlockBuild,
    },
    {
        type: 'recommended-actions',
        label: 'Recommended actions',
        description:
            'Setup checklist — what’s left to connect, with live status.',
        icon: IconChecklist,
        singleton: true,
        create: () => ({
            id: uuidv4(),
            type: 'recommended-actions',
            config: {
                title: 'Finish setting up',
                actions: [...RECOMMENDED_ACTION_KEYS],
            },
        }),
        View: RecommendedActionsBlockView,
        Build: RecommendedActionsBlockBuild,
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
