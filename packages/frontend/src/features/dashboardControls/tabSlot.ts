import { getShownTabCount, getTabCount, type OverviewTile } from './overview';

// The line whose tile count was clicked in the open control's popover
export type ShownLine = {
    // As the popover names it
    name: string;
    // The line of tiles that take the control through their switch
    isDataApps: boolean;
    tileUuids: string[];
};

// What a dashboard tab's count slot holds. Its room is always there, so no
// tab changes width when a control opens or a tile count is clicked.
export type TabSlot =
    | { kind: 'empty' }
    | { kind: 'loading' }
    // Tiles on the tab the control applies to, out of those that can take it
    | { kind: 'count'; text: string; description: string }
    // How many of the clicked line's tiles are on the tab
    | { kind: 'shown'; text: string; count: number; description: string };

const describeShown = (count: number, line: ShownLine): string => {
    const isOne = count === 1;
    if (line.isDataApps) {
        return `${count} data app ${isOne ? 'tile' : 'tiles'} on this tab`;
    }
    return `${count} ${isOne ? 'tile' : 'tiles'} on this tab ${
        isOne ? 'uses' : 'use'
    } ${line.name}`;
};

export const getTabSlot = ({
    control,
    tabUuid,
    shown,
}: {
    // The open control as its tiles see it; null with no control open
    control: {
        isLoading: boolean;
        tiles: OverviewTile[];
        // What "M" counts on this tab, as a sentence
        summary: string;
    } | null;
    tabUuid: string;
    shown: ShownLine | null;
}): TabSlot => {
    if (control === null) return { kind: 'empty' };
    // A partial count would mislead
    if (control.isLoading) return { kind: 'loading' };
    if (shown !== null) {
        const count = getShownTabCount(control.tiles, tabUuid, shown.tileUuids);
        return {
            kind: 'shown',
            text: String(count),
            count,
            description: describeShown(count, shown),
        };
    }
    const { mapped, mappable } = getTabCount(control.tiles, tabUuid);
    return {
        kind: 'count',
        text: `${mapped} of ${mappable}`,
        description: control.summary,
    };
};
