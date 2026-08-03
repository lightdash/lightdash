import {
    type HomepageHeroDensity,
    type HomepageOpening,
} from '@lightdash/common';
import {
    Box,
    SegmentedControl,
    Skeleton,
    Stack,
    Switch,
    Text,
} from '@mantine-8/core';
import { type FC } from 'react';
import useApp from '../../../../providers/App/useApp';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import { DayOneAskInput } from '../DayOneAskInput';
import { DEFAULT_GREETING_SUBTITLE, getGreeting } from '../greeting';
import layout from '../homepageLayout.module.css';
import { useHomepageAiState } from '../hooks/useHomepageAiState';
import { useHomepageConfigFacts } from '../hooks/useHomepageConfigFacts';
import { GreetingHero } from './GreetingHero';
import { getDefaultQuickActions } from './quickActionDefaults';
import { QuickActionCards } from './QuickActionsBlock';
import {
    RecommendedActionsChecklist,
    RecommendedActionsChecklistPlaceholder,
} from './RecommendedActionsChecklist';
import { type BlockComponentProps, type BuildComponentProps } from './types';
import { useRecommendedActions } from './useRecommendedActions';

// The day-0 hero, as a reusable unit: greeting + the real agent chat
// composer with live suggestions. Shared between DayOneHomepage (always
// greets) and this block (greeting is a per-homepage toggle). The setup
// checklist replaces the suggestion chips when enabled.
export const AskAiHero: FC<{
    projectUuid: string;
    showGreeting: boolean;
    showRecommendedActions: boolean;
    // In the builder the composer is shown as a preview: it looks real but is
    // inert, so editing admins can't accidentally start a conversation.
    preview?: boolean;
}> = ({
    projectUuid,
    showGreeting,
    showRecommendedActions,
    preview = false,
}) => {
    const { user } = useApp();
    const actions = useRecommendedActions(projectUuid);
    // One answer for the whole hero: the greeting's wording and whether there
    // is a checklist at all come from the same statuses, so they arrive
    // together or not at all. The composer holds its own slot from the first
    // render — gating its mount here would stop it fetching until the reveal
    // and land it a beat late.
    const isReady = !actions.isLoading;
    const isWarehouseConnected =
        actions.statuses['connect-warehouse'].isComplete;
    return (
        <Stack gap={16} align="center" w="100%">
            {showGreeting &&
                (isReady ? (
                    <Text component="h1" className={layout.heroGreeting}>
                        {isWarehouseConnected
                            ? `${getGreeting(user.data?.firstName)}. What do you want to know?`
                            : "Let's get started"}
                    </Text>
                ) : (
                    <Skeleton h={34} w={320} radius="sm" />
                ))}
            <Box w="100%">
                <DayOneAskInput projectUuid={projectUuid} preview={preview} />
            </Box>
            {showRecommendedActions &&
                (isReady ? (
                    actions.hasPendingActions && (
                        <RecommendedActionsChecklist actions={actions} />
                    )
                ) : (
                    <RecommendedActionsChecklistPlaceholder
                        actionCount={actions.visibleActions.length}
                    />
                ))}
        </Stack>
    );
};

// Shared by both hero-capable blocks. 'auto' clears the stored choice and
// lets the layout decide (compact when content follows, full when alone) —
// the right default for most pages, so it stays the first option.
export const HeroDensityControl: FC<{
    value: HomepageHeroDensity | undefined;
    onChange: (density: HomepageHeroDensity | undefined) => void;
}> = ({ value, onChange }) => (
    <Stack gap={4}>
        <Text size="xs" fw={500}>
            Opening size
        </Text>
        <SegmentedControl
            size="xs"
            value={value ?? 'auto'}
            onChange={(next) =>
                onChange(
                    next === 'auto' ? undefined : (next as HomepageHeroDensity),
                )
            }
            data={[
                { value: 'auto', label: 'Auto' },
                { value: 'compact', label: 'Compact' },
                { value: 'full', label: 'Full screen' },
            ]}
        />
        <Text size="xs" c="dimmed">
            {value === 'full'
                ? 'Fills the opening view — content below starts under the fold.'
                : 'Sized to its own content, so what you add below stays visible.'}
        </Text>
    </Stack>
);

// Shared by both hero-capable blocks: swaps the block type in place (id and
// density survive), so switching the opening never touches the rows below.
export const HeroOpeningControl: FC<{
    projectUuid: string;
    value: HomepageOpening;
    onSwap: (opening: HomepageOpening) => void;
}> = ({ projectUuid, value, onSwap }) => {
    const { canAskAi } = useHomepageAiState(projectUuid);
    const { track } = useTracking();
    // Without a working composer there's no choice to offer.
    if (!canAskAi) return null;
    return (
        <Stack gap={4}>
            <Text size="xs" fw={500}>
                Opening
            </Text>
            <SegmentedControl
                size="xs"
                value={value}
                onChange={(next) => {
                    if (next === value) return;
                    track({
                        name: EventName.HOMEPAGE_OPENING_SWAPPED,
                        properties: {
                            from: value,
                            to: next as HomepageOpening,
                        },
                    });
                    onSwap(next as HomepageOpening);
                }}
                data={[
                    { value: 'ask-first', label: 'Ask AI' },
                    { value: 'content-first', label: 'Greeting' },
                ]}
            />
            <Text size="xs" c="dimmed">
                Swaps just this opening block. Everything below stays put.
            </Text>
        </Stack>
    );
};

export const AskAiHeroBlockView: FC<BlockComponentProps> = ({
    block,
    projectUuid,
}) => {
    // Stored configs are rewritten when an org chooses content-first, so a
    // surviving ask-ai-hero block only degrades when AI can't answer: the
    // hero slot becomes the greeting opening instead of a hole in the page.
    const { canAskAi } = useHomepageAiState(projectUuid);
    const { hasQuickActionsBlock } = useHomepageConfigFacts();
    if (block.type !== 'ask-ai-hero') return null;
    if (!canAskAi) {
        // The full content-first hero, matching day-0: quick actions belong
        // right under the greeting, unless the page already has its own
        // quick-actions block (which would duplicate them).
        return (
            <GreetingHero subtitle={DEFAULT_GREETING_SUBTITLE}>
                {!hasQuickActionsBlock && (
                    <QuickActionCards
                        actions={getDefaultQuickActions()}
                        projectUuid={projectUuid}
                    />
                )}
            </GreetingHero>
        );
    }
    // The greeting follows its toggle regardless of the block's position; it
    // still renders inline mid-page rather than only in the hero slot.
    return (
        <AskAiHero
            projectUuid={projectUuid}
            showGreeting={block.config.showGreeting}
            showRecommendedActions={
                block.config.showRecommendedActions === true
            }
        />
    );
};

export const AskAiHeroBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
    onChange,
}) => {
    if (block.type !== 'ask-ai-hero') return null;
    return (
        <Stack gap="sm">
            <AskAiHero
                projectUuid={projectUuid}
                showGreeting={block.config.showGreeting}
                showRecommendedActions={
                    block.config.showRecommendedActions === true
                }
                preview
            />
            <HeroOpeningControl
                projectUuid={projectUuid}
                value="ask-first"
                onSwap={() =>
                    onChange({
                        id: block.id,
                        type: 'greeting',
                        config: {
                            subtitle: DEFAULT_GREETING_SUBTITLE,
                            density: block.config.density,
                        },
                    })
                }
            />
            <Switch
                label="Show greeting"
                checked={block.config.showGreeting}
                onChange={(e) =>
                    onChange({
                        ...block,
                        config: {
                            ...block.config,
                            showGreeting: e.currentTarget.checked,
                        },
                    })
                }
            />
            <HeroDensityControl
                value={block.config.density}
                onChange={(density) =>
                    onChange({ ...block, config: { ...block.config, density } })
                }
            />
        </Stack>
    );
};
