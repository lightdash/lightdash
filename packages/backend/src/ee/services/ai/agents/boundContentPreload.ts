import { DashboardTileTypes } from '@lightdash/common';
import { readContentText } from '../tools/readContent';
import type { AiAgentThreadBindingContext } from '../types/aiAgent';
import type { ReadContentFn } from '../types/aiAgentDependencies';

// ~6k tokens of YAML; past it, content is read on demand.
const MAX_PRELOAD_CHARS = 24_000;

const EDIT_HINT =
    'read at the start of this request. Edit it with editContent without reading it first.';

/** The bound dashboard (with the charts that fit) or chart as readContent shows it, so an edit needs no read step. */
export const getBoundContentPreload = async ({
    threadBinding,
    readContent,
    siteUrl,
}: {
    threadBinding: AiAgentThreadBindingContext | null;
    readContent: ReadContentFn;
    siteUrl: string;
}): Promise<string | null> => {
    const toText = (read: Awaited<ReturnType<ReadContentFn>>) =>
        readContentText(read, { siteUrl, note: null, format: 'yaml' });
    try {
        if (threadBinding?.type === 'chart' && threadBinding.chart) {
            const chart = toText(
                await readContent({
                    slug: threadBinding.chart.slug,
                    type: 'chart',
                }),
            );
            return chart.length <= MAX_PRELOAD_CHARS
                ? `Current content of the bound chart, ${EDIT_HINT}\n\n${chart}`
                : null;
        }
        if (threadBinding?.type !== 'dashboard' || !threadBinding.dashboard)
            return null;
        const dashboard = await readContent({
            slug: threadBinding.dashboard.slug,
            type: 'dashboard',
        });
        if (dashboard.type !== 'dashboard') return null;
        const parts = [toText(dashboard)];
        if (parts[0].length > MAX_PRELOAD_CHARS) return null;

        const chartSlugs = [
            ...new Set(
                dashboard.content.tiles.flatMap((tile) =>
                    tile.type === DashboardTileTypes.SAVED_CHART &&
                    tile.properties.chartSlug
                        ? [tile.properties.chartSlug]
                        : [],
                ),
            ),
        ];
        const charts = await Promise.all(
            chartSlugs.map((slug) =>
                readContent({ slug, type: 'chart' })
                    .then(toText)
                    .catch(() => null),
            ),
        );
        let size = parts[0].length;
        for (const chart of charts) {
            if (chart && size + chart.length + 2 <= MAX_PRELOAD_CHARS) {
                parts.push(chart);
                size += chart.length + 2;
            }
        }
        const shown = parts.length - 1;
        const scope =
            shown === chartSlugs.length
                ? 'the bound dashboard and its charts'
                : `the bound dashboard and ${shown} of its ${chartSlugs.length} charts (read the others before editing them)`;
        return `Current content of ${scope}, ${EDIT_HINT}\n\n${parts.join('\n\n')}`;
    } catch {
        return null;
    }
};
