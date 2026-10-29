import { type HomepageBlock } from '@lightdash/common';
import {
    IconBolt,
    IconBook,
    IconChartDots,
    IconClock,
    IconLayoutGrid,
    IconMarkdown,
    IconMessageChatbot,
    IconRocket,
    IconSchool,
    IconSpeakerphone,
    IconStar,
    type Icon,
    IconSun,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    AnnouncementsBlockBuild,
    AnnouncementsBlockView,
} from './AnnouncementsBlock';
import { AskAiHeroBlockBuild, AskAiHeroBlockView } from './AskAiHeroBlock';
import { CollectionBlockBuild, CollectionBlockView } from './CollectionBlock';
import { CtaBlockBuild, CtaBlockView } from './CtaBlock';
import { FavoritesBlockBuild, FavoritesBlockView } from './FavoritesBlock';
import { GreetingBlockBuild, GreetingBlockView } from './GreetingBlock';
import { LearnBlockBuild, LearnBlockView } from './LearnBlock';
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
    /** Can only be added once per homepage. */
    singleton?: boolean;
    /** Renders per-viewer content, so admin previews show a placeholder. */
    personal?: boolean;
    create: () => HomepageBlock;
    View: FC<BlockComponentProps>;
    Build: FC<BuildComponentProps>;
};

export const blockLibrary: BlockDefinition[] = [
    {
        type: 'ask-ai-hero',
        label: 'Ask AI',
        description: 'Chat box with live suggestions.',
        icon: IconMessageChatbot,
        requiresAi: true,
        singleton: true,
        create: () => ({
            id: uuidv4(),
            type: 'ask-ai-hero',
            config: { showGreeting: true, showRecommendedActions: false },
        }),
        View: AskAiHeroBlockView,
        Build: AskAiHeroBlockBuild,
    },
    {
        type: 'greeting',
        label: 'Greeting',
        description: 'Time-of-day welcome per viewer.',
        icon: IconSun,
        create: () => ({
            id: uuidv4(),
            type: 'greeting',
            config: {
                subtitle: 'Pick up where you left off, or start something new.',
            },
        }),
        View: GreetingBlockView,
        Build: GreetingBlockBuild,
    },
    {
        type: 'quick-actions',
        label: 'Quick actions',
        description: 'Shortcut chips to common places.',
        icon: IconBolt,
        create: () => ({
            id: uuidv4(),
            type: 'quick-actions',
            config: { actions: getDefaultQuickActions() },
        }),
        View: QuickActionsBlockView,
        Build: QuickActionsBlockBuild,
    },
    {
        type: 'cta',
        label: 'Call to action',
        description: 'One banner with a single button.',
        icon: IconRocket,
        singleton: true,
        create: () => ({
            id: uuidv4(),
            type: 'cta',
            config: {
                buttonLabel: 'Run a query',
                target: { type: 'run-query' },
            },
        }),
        View: CtaBlockView,
        Build: CtaBlockBuild,
    },
    {
        type: 'metrics',
        label: 'Metrics',
        description: 'Headline numbers with trends.',
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
        description: 'Hand-picked or pinned content.',
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
        description: 'Apps, artifacts, videos and links.',
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
        description: 'News from the data team.',
        icon: IconSpeakerphone,
        singleton: true,
        create: () => ({
            id: uuidv4(),
            type: 'announcements',
            config: { title: 'From the data team' },
        }),
        View: AnnouncementsBlockView,
        Build: AnnouncementsBlockBuild,
    },
    {
        type: 'favorites',
        label: 'Favorites',
        description: 'Each viewer’s starred content.',
        icon: IconStar,
        personal: true,
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
        description: 'What each viewer opened last.',
        icon: IconClock,
        singleton: true,
        personal: true,
        create: () => ({
            id: uuidv4(),
            type: 'recent',
            config: { title: 'Recently viewed' },
        }),
        View: RecentBlockView,
        Build: RecentBlockBuild,
    },
    {
        type: 'learn',
        label: 'Learn',
        description:
            'Each viewer’s next Learn module and their progress, with a button to start it.',
        icon: IconSchool,
        singleton: true,
        personal: true,
        create: () => ({
            id: uuidv4(),
            type: 'learn',
            config: { title: 'Keep learning' },
        }),
        View: LearnBlockView,
        Build: LearnBlockBuild,
    },
    {
        type: 'markdown',
        label: 'Text / banner',
        description: 'Notes, headings or a banner.',
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
