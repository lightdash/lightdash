import { type FavoriteItems, type PinnedItems } from '@lightdash/common';
import { Box, Button, Group, Stack, Text } from '@mantine-8/core';
import { IconSquareRoundedPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import FavoritesPanel from '../../../components/FavoritesPanel';
import PinnedItemsPanel from '../../../components/PinnedItemsPanel';
import useApp from '../../../providers/App/useApp';
import { useAiAgentButtonVisibility } from '../aiCopilot/hooks/useAiAgentsButtonVisibility';
import { AskAiHero } from './blocks/AskAiHeroBlock';
import { getDefaultQuickActions } from './blocks/quickActionDefaults';
import { QuickActionCards } from './blocks/QuickActionsBlock';
import classes from './DayOneHomepage.module.css';
import layout from './homepageLayout.module.css';

type Props = {
    projectUuid: string;
    projectName: string;
    pinnedItems: PinnedItems;
    favoriteItems: FavoriteItems;
    pinnedIsEnabled: boolean;
};

export const DayOneHomepage: FC<Props> = ({
    projectUuid,
    projectName,
    pinnedItems,
    favoriteItems,
    pinnedIsEnabled,
}) => {
    const { user } = useApp();
    const isAiEnabled = useAiAgentButtonVisibility();

    return (
        <div className={layout.page}>
            <div className={layout.heroSection}>
                {isAiEnabled ? (
                    <div className={layout.hero}>
                        <AskAiHero projectUuid={projectUuid} showGreeting />
                    </div>
                ) : (
                    <div className={classes.welcome}>
                        <Group
                            justify="space-between"
                            align="flex-end"
                            wrap="nowrap"
                            mb={26}
                        >
                            <Box>
                                <Text
                                    component="h1"
                                    fz={30}
                                    fw={600}
                                    lts="-0.02em"
                                    m={0}
                                >
                                    Welcome to {projectName},{' '}
                                    {user.data?.firstName}
                                </Text>
                                <Text c="dimmed" fz={15} mt={6}>
                                    Nothing’s here yet — start exploring, or
                                    your data team can curate this page.
                                </Text>
                            </Box>
                            <Button
                                component={Link}
                                to={`/projects/${projectUuid}/tables`}
                                leftSection={
                                    <MantineIcon icon={IconSquareRoundedPlus} />
                                }
                                flex="0 0 auto"
                            >
                                New
                            </Button>
                        </Group>
                        <QuickActionCards
                            actions={getDefaultQuickActions(false)}
                            projectUuid={projectUuid}
                        />
                    </div>
                )}
            </div>

            <div className={classes.secondary}>
                <Stack gap="xl">
                    <FavoritesPanel
                        favoriteItems={favoriteItems}
                        showEmptyState
                    />
                    <PinnedItemsPanel
                        pinnedItems={pinnedItems}
                        isEnabled={pinnedIsEnabled}
                    />
                </Stack>
            </div>
        </div>
    );
};
