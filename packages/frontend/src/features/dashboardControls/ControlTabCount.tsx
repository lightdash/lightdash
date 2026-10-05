import { Badge, Box, Loader, Tooltip, VisuallyHidden } from '@mantine/core';
import { type FC } from 'react';
import { useDashboardControls, useMappableSummary } from './context';
import classes from './dashboardControls.module.css';
import { getTabSlot, type TabSlot } from './tabSlot';
import { DATA_APPS_LINE_ID } from './tiles';

type Filled = Extract<TabSlot, { kind: 'count' | 'shown' }>;

const SlotBadge: FC<{ slot: Filled }> = ({ slot }) => {
    // The clicked line's tiles: ink where the tab has some, quiet where none
    const isInk = slot.kind === 'shown' && slot.count > 0;
    return (
        <Tooltip label={slot.description}>
            <Badge
                size="xs"
                variant={isInk ? 'filled' : undefined}
                className={isInk ? classes.shownBadge : undefined}
                c={slot.kind === 'shown' && !isInk ? 'dimmed' : undefined}
            >
                {/* Read out as the sentence, not the bare number */}
                <span aria-hidden>{slot.text}</span>
                <VisuallyHidden>{slot.description}</VisuallyHidden>
            </Badge>
        </Tooltip>
    );
};

// A dashboard tab's one count, in room that is always there: tiles the open
// control applies to out of those that can take it, or, after a tile count
// is clicked in the popover, how many of that line's tiles are on the tab
const ControlTabCount: FC<{ tabUuid: string }> = ({ tabUuid }) => {
    const { model, shownItemId, shownItemName, shownTileUuids } =
        useDashboardControls();
    const summary = useMappableSummary(tabUuid);
    const slot = getTabSlot({
        control: model
            ? {
                  isLoading: model.isLoading,
                  tiles: model.overviewTiles,
                  summary,
              }
            : null,
        tabUuid,
        shown:
            shownItemId !== null && shownItemName !== null
                ? {
                      name: shownItemName,
                      isDataApps: shownItemId === DATA_APPS_LINE_ID,
                      tileUuids: shownTileUuids,
                  }
                : null,
    });

    return (
        <Box component="span" className={classes.tabSlot}>
            {slot.kind === 'loading' && <Loader size="xs" />}
            {(slot.kind === 'count' || slot.kind === 'shown') && (
                <SlotBadge slot={slot} />
            )}
        </Box>
    );
};

export default ControlTabCount;
