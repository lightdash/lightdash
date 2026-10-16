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
    IconSpeakerphone,
    IconStar,
    type Icon,
    IconSun,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import i18n from '../../../../i18n/i18n';
import { getDefaultGreetingSubtitle } from '../greeting';
import {
    AnnouncementsBlockBuild,
    AnnouncementsBlockView,
} from './AnnouncementsBlock';
import { AskAiHeroBlockBuild, AskAiHeroBlockView } from './AskAiHeroBlock';
import { CollectionBlockBuild, CollectionBlockView } from './CollectionBlock';
import { CtaBlockBuild, CtaBlockView } from './CtaBlock';
import { FavoritesBlockBuild, FavoritesBlockView } from './FavoritesBlock';
import { GreetingBlockBuild, GreetingBlockView } from './GreetingBlock';
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

const ns = 'homepageBuilder';

export type BlockDefinition = {
    type: HomepageBlock['type'];
    labelKey: string;
    descriptionKey: string;
    /** Stable English value for `data-tour-value`; not user-facing copy. */
    tourValue: string;
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
        labelKey: 'blockLibrary.askAiHero.label',
        descriptionKey: 'blockLibrary.askAiHero.description',
        tourValue: 'Ask AI',
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
        labelKey: 'blockLibrary.greeting.label',
        descriptionKey: 'blockLibrary.greeting.description',
        tourValue: 'Greeting',
        icon: IconSun,
        create: () => ({
            id: uuidv4(),
            type: 'greeting',
            config: {
                subtitle: getDefaultGreetingSubtitle(),
            },
        }),
        View: GreetingBlockView,
        Build: GreetingBlockBuild,
    },
    {
        type: 'quick-actions',
        labelKey: 'blockLibrary.quickActions.label',
        descriptionKey: 'blockLibrary.quickActions.description',
        tourValue: 'Quick actions',
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
        labelKey: 'blockLibrary.cta.label',
        descriptionKey: 'blockLibrary.cta.description',
        tourValue: 'Call to action',
        icon: IconRocket,
        singleton: true,
        create: () => ({
            id: uuidv4(),
            type: 'cta',
            config: {
                buttonLabel: i18n.t('blockDefaults.ctaButtonLabel', { ns }),
                target: { type: 'run-query' },
            },
        }),
        View: CtaBlockView,
        Build: CtaBlockBuild,
    },
    {
        type: 'metrics',
        labelKey: 'blockLibrary.metrics.label',
        descriptionKey: 'blockLibrary.metrics.description',
        tourValue: 'Metrics',
        icon: IconChartDots,
        singleton: true,
        create: () => ({
            id: uuidv4(),
            type: 'metrics',
            config: {
                title: i18n.t('blockDefaults.metricsTitle', { ns }),
                items: [],
            },
        }),
        View: MetricsBlockView,
        Build: MetricsBlockBuild,
    },
    {
        type: 'collection',
        labelKey: 'blockLibrary.collection.label',
        descriptionKey: 'blockLibrary.collection.description',
        tourValue: 'Collection',
        icon: IconLayoutGrid,
        create: () => ({
            id: uuidv4(),
            type: 'collection',
            config: {
                title: i18n.t('blockDefaults.collectionTitle', { ns }),
                items: [],
            },
        }),
        View: CollectionBlockView,
        Build: CollectionBlockBuild,
    },
    {
        type: 'resources',
        labelKey: 'blockLibrary.resources.label',
        descriptionKey: 'blockLibrary.resources.description',
        tourValue: 'Resources',
        icon: IconBook,
        create: () => ({
            id: uuidv4(),
            type: 'resources',
            config: {
                title: i18n.t('blockDefaults.resourcesTitle', { ns }),
                items: [],
                layout: 'card',
            },
        }),
        View: ResourcesBlockView,
        Build: ResourcesBlockBuild,
    },
    {
        type: 'announcements',
        labelKey: 'blockLibrary.announcements.label',
        descriptionKey: 'blockLibrary.announcements.description',
        tourValue: 'Announcements',
        icon: IconSpeakerphone,
        singleton: true,
        create: () => ({
            id: uuidv4(),
            type: 'announcements',
            config: {
                title: i18n.t('blockDefaults.announcementsTitle', { ns }),
            },
        }),
        View: AnnouncementsBlockView,
        Build: AnnouncementsBlockBuild,
    },
    {
        type: 'favorites',
        labelKey: 'blockLibrary.favorites.label',
        descriptionKey: 'blockLibrary.favorites.description',
        tourValue: 'Favorites',
        icon: IconStar,
        personal: true,
        create: () => ({
            id: uuidv4(),
            type: 'favorites',
            config: {
                title: i18n.t('blockDefaults.favoritesTitle', { ns }),
            },
        }),
        View: FavoritesBlockView,
        Build: FavoritesBlockBuild,
    },
    {
        type: 'recent',
        labelKey: 'blockLibrary.recent.label',
        descriptionKey: 'blockLibrary.recent.description',
        tourValue: 'Recently viewed',
        icon: IconClock,
        singleton: true,
        personal: true,
        create: () => ({
            id: uuidv4(),
            type: 'recent',
            config: {
                title: i18n.t('blockDefaults.recentTitle', { ns }),
            },
        }),
        View: RecentBlockView,
        Build: RecentBlockBuild,
    },
    {
        type: 'markdown',
        labelKey: 'blockLibrary.markdown.label',
        descriptionKey: 'blockLibrary.markdown.description',
        tourValue: 'Text / banner',
        icon: IconMarkdown,
        create: () => ({
            id: uuidv4(),
            type: 'markdown',
            config: {
                content: i18n.t('blockDefaults.markdownContent', { ns }),
            },
        }),
        View: MarkdownBlockView,
        Build: MarkdownBlockBuild,
    },
];

export const getBlockDefinition = (type: string): BlockDefinition | undefined =>
    blockLibrary.find((def) => def.type === type);
