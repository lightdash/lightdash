export type RankableSpace = {
    uuid: string;
    name: string;
    dashboardCount: number;
    chartCount: number;
    appCount: number;
    isPinned: boolean;
};

export type KeySpace = {
    uuid: string;
    name: string;
    itemCount: number;
    isPinned: boolean;
};

/**
 * Which spaces to put in front of someone who has just landed on the project.
 *
 * Ranked by, in order:
 *
 * 1. **Pinned.** An admin pinning a space has already answered the question.
 * 2. **Views of the content inside it.** Spaces carry no view count of their
 *    own (the content API selects `0 as views` for them), so usage is derived
 *    from where the project's most-viewed charts and dashboards actually live.
 * 3. **How much it holds.** A tiebreak for projects with no view history yet,
 *    so day-0 still leads with the spaces where the work is.
 * 4. **Name**, so the order is stable rather than incidental.
 */
export const rankKeySpaces = (
    spaces: RankableSpace[],
    viewsBySpaceUuid: Map<string, number>,
    limit: number,
): KeySpace[] =>
    spaces
        .map((space) => ({
            uuid: space.uuid,
            name: space.name,
            itemCount: space.dashboardCount + space.chartCount + space.appCount,
            isPinned: space.isPinned,
            views: viewsBySpaceUuid.get(space.uuid) ?? 0,
        }))
        // An empty space is never the place to send someone first.
        .filter((space) => space.itemCount > 0)
        .sort(
            (a, b) =>
                Number(b.isPinned) - Number(a.isPinned) ||
                b.views - a.views ||
                b.itemCount - a.itemCount ||
                a.name.localeCompare(b.name),
        )
        .slice(0, limit)
        .map(({ uuid, name, itemCount, isPinned }) => ({
            uuid,
            name,
            itemCount,
            isPinned,
        }));
