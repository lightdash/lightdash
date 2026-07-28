import { type PinnedItems } from '@lightdash/common';
import { Box, Stack, Text } from '@mantine-8/core';
import { IconClock, IconPin } from '@tabler/icons-react';
import { type FC } from 'react';
import useApp from '../../../providers/App/useApp';
import { AskAiHero } from './blocks/AskAiHeroBlock';
import { BlockHeader } from './blocks/BlockShell';
import { ContentCard } from './blocks/ContentCard';
import { PersonalFavoritesBar } from './blocks/FavoritesBlock';
import { getDefaultQuickActions } from './blocks/quickActionDefaults';
import { QuickActionCards } from './blocks/QuickActionsBlock';
import { RecentList } from './blocks/RecentBlock';
import classes from './DayOneHomepage.module.css';
import { getGreeting } from './greeting';
import layout from './homepageLayout.module.css';
import { useCollectionContent } from './hooks/useCollectionContent';
import { useHomepageAiState } from './hooks/useHomepageAiState';

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

export const DayOneHomepage: FC<Props> = ({ projectUuid, pinnedItems }) => {
    const { user } = useApp();
    const { canAskAi } = useHomepageAiState(projectUuid);

    return (
        <div className={layout.page}>
            {/* Same favourites strip the published homepage puts above its
                blocks — day-0 opens the same way */}
            <PersonalFavoritesBar projectUuid={projectUuid} />
            {/* Without a composer to hold the fold, the hero yields part of
                the viewport so Recently viewed peeks above it */}
            <div
                className={layout.heroSection}
                data-presentation={canAskAi ? undefined : 'shared'}
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
                                fz={23}
                                fw={600}
                                lts="-0.02em"
                                lh={1.2}
                                m={0}
                            >
                                {getGreeting(user.data?.firstName)}
                            </Text>
                            <Text c="dimmed" fz={15} mt={8}>
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
                    {!canAskAi && (
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
