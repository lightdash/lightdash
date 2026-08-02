import { type PinnedItems } from '@lightdash/common';
import { Box, Stack, Text } from '@mantine-8/core';
import { IconClock, IconPin } from '@tabler/icons-react';
import { type FC } from 'react';
import useApp from '../../../providers/App/useApp';
import { AskAiHero } from './blocks/AskAiHeroBlock';
import { BlockHeader } from './blocks/BlockShell';
import { ContentCard } from './blocks/ContentCard';
import { PersonalFavoritesBar } from './blocks/FavoritesBlock';
import { KeySpaces } from './blocks/KeySpaces';
import { getDefaultQuickActions } from './blocks/quickActionDefaults';
import { QuickActionCards } from './blocks/QuickActionsBlock';
import { RecentList } from './blocks/RecentBlock';
import classes from './DayOneHomepage.module.css';
import { getGreeting } from './greeting';
import layout from './homepageLayout.module.css';
import { useCollectionContent } from './hooks/useCollectionContent';
import { useHomepageAiState } from './hooks/useHomepageAiState';
import { useKeySpaces } from './hooks/useKeySpaces';
import { useRecentContents } from './hooks/useRecentContents';

type Props = {
    projectUuid: string;
    pinnedItems: PinnedItems;
};

/** Pinned content rendered in the same card language as the collection block,
 * so day-0 doesn't mix a legacy panel in with the builder's blocks. */
const PinnedCollection: FC<{
    projectUuid: string;
    pinnedItems: PinnedItems;
}> = ({ projectUuid, pinnedItems }) => {
    const uuids = pinnedItems.map((item) => item.data.uuid);
    const { data: contents } = useCollectionContent(projectUuid, uuids);

    if (!contents || contents.length === 0) return null;

    return (
        <Box>
            <BlockHeader icon={IconPin} title="Pinned" />
            <Stack gap={8}>
                {contents.map((content) => (
                    <ContentCard
                        key={content.uuid}
                        content={content}
                        projectUuid={projectUuid}
                    />
                ))}
            </Stack>
        </Box>
    );
};

// Four fits one grid row at the page's 3-column span, which is the point: a
// starting set, not a directory.
const MAX_KEY_SPACES = 4;

export const DayOneHomepage: FC<Props> = ({ projectUuid, pinnedItems }) => {
    const { user } = useApp();
    const { canAskAi } = useHomepageAiState(projectUuid);
    const { spaces: keySpaces } = useKeySpaces(projectUuid, MAX_KEY_SPACES);
    const recent = useRecentContents(projectUuid);
    // Keep the header while loading so the section doesn't pop in under the
    // fold once it resolves.
    const hasRecentlyViewed = recent.isLoading || recent.contents.length > 0;

    return (
        <div className={layout.page}>
            {/* Same favourites strip the published homepage puts above its
                blocks — day-0 opens the same way */}
            <PersonalFavoritesBar projectUuid={projectUuid} />
            {/* Body rows always follow — Recently viewed and Pinned are the
                point of day-0 — so the hero stays compact and they're on
                screen. Same shell for both the AI and non-AI openings. */}
            <div
                className={layout.heroSection}
                data-presentation="shared"
                data-density="compact"
            >
                {canAskAi ? (
                    <div className={layout.hero}>
                        <AskAiHero
                            projectUuid={projectUuid}
                            showGreeting
                            showRecommendedActions={false}
                        />
                    </div>
                ) : (
                    // Same hero shell and type scale as the Ask AI variant, so
                    // both day-0 openings sit identically in the fold
                    <Stack className={layout.hero} gap={16} align="center">
                        <Box ta="center">
                            <Text
                                component="h1"
                                className={layout.heroGreeting}
                            >
                                {getGreeting(user.data?.firstName)}
                            </Text>
                            <Text className={layout.heroGreetingSub}>
                                Pick up where you left off, or start something
                                new.
                            </Text>
                        </Box>
                        <QuickActionCards
                            actions={getDefaultQuickActions(false)}
                            projectUuid={projectUuid}
                        />
                    </Stack>
                )}
            </div>

            <div className={classes.secondary}>
                <Stack gap="xl">
                    {/* Spaces lead the body: they're the one section that has
                        content in any real project. Recently viewed is empty
                        for a first-time viewer and Pinned is empty until
                        someone curates, so neither can be the thing a new
                        viewer is sent to first. */}
                    <KeySpaces
                        spaces={keySpaces}
                        projectUuid={projectUuid}
                        title="Start here"
                    />
                    {hasRecentlyViewed && (
                        <Box>
                            <BlockHeader
                                icon={IconClock}
                                title="Recently viewed"
                            />
                            <RecentList projectUuid={projectUuid} />
                        </Box>
                    )}
                    <PinnedCollection
                        projectUuid={projectUuid}
                        pinnedItems={pinnedItems}
                    />
                </Stack>
            </div>
        </div>
    );
};
