import { Box, Group } from '@mantine/core';
import { FC, memo, useEffect } from 'react';
import useDashboardStorage from '../../../hooks/dashboard/useDashboardStorage';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { Can } from '../../common/Authorization';
import ShareShortLinkButton from '../../common/ShareShortLinkButton';
import ExploreFromHereButton from '../../ExploreFromHereButton';
import RefreshDbtButton from '../../RefreshDbtButton';
import SaveChartButton from '../SaveChartButton';

const ExplorerHeader: FC = memo(() => {
    const isEditMode = useExplorerContext(
        (context) => context.state.isEditMode,
    );
    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );
    const isValidQuery = useExplorerContext(
        (context) => context.state.isValidQuery,
    );

    const { getHasDashboardChanges } = useDashboardStorage();

    useEffect(() => {
        const checkReload = (event: BeforeUnloadEvent) => {
            if (getHasDashboardChanges()) {
                const message =
                    'You have unsaved changes to your dashboard! Are you sure you want to leave without saving?';
                event.returnValue = message;
                return message;
            }
        };
        window.addEventListener('beforeunload', checkReload);
        return () => {
            window.removeEventListener('beforeunload', checkReload);
        };
    }, [getHasDashboardChanges]);

    if (isEditMode) {
        return (
            <Group position="apart">
                <Box>
                    <RefreshDbtButton />
                </Box>
                <Group spacing="xs">
                    {!savedChart && (
                        <Can I="manage" a="SavedChart">
                            <SaveChartButton isExplorer />
                        </Can>
                    )}
                    <ShareShortLinkButton disabled={!isValidQuery} />
                </Group>
            </Group>
        );
    }

    return (
        <Group position="right" spacing="xs">
            <ExploreFromHereButton />
            <ShareShortLinkButton disabled={!isValidQuery} />
        </Group>
    );
});

export default ExplorerHeader;
