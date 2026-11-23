import { DashboardTileTypes } from '@lightdash/common';
import { agentReadOutput } from '../tools/readContent';
import type { AiAgentThreadBindingContext } from '../types/aiAgent';
import type { ReadContentFn } from '../types/aiAgentDependencies';

// ~6k tokens of YAML; larger dashboards keep the read-on-demand path for their charts.
const MAX_PRELOAD_CHARS = 24_000;

type Read = Awaited<ReturnType<ReadContentFn>>;

const render = (read: Read, siteUrl: string): string | null =>
    read.type === 'document' || read.type === 'data_app'
        ? null
        : agentReadOutput(
              {
                  type: read.type,
                  slug: read.content.slug,
                  name: read.content.name,
                  href: read.href,
                  content: read.content,
              } as Parameters<typeof agentReadOutput>[0],
              siteUrl,
          );

/** The bound dashboard (with its charts) or chart as readContent shows it, so an edit needs no read step. */
export const getBoundContentPreload = async ({
    threadBinding,
    readContent,
    siteUrl,
}: {
    threadBinding: AiAgentThreadBindingContext | null;
    readContent: ReadContentFn;
    siteUrl: string;
}): Promise<string | null> => {
    try {
        let reads: Read[] = [];
        if (threadBinding?.type === 'dashboard' && threadBinding.dashboard) {
            const dashboard = await readContent({
                slug: threadBinding.dashboard.slug,
                type: 'dashboard',
            });
            const chartSlugs =
                dashboard.type === 'dashboard'
                    ? dashboard.content.tiles.flatMap((tile) =>
                          tile.type === DashboardTileTypes.SAVED_CHART &&
                          tile.properties.chartSlug
                              ? [tile.properties.chartSlug]
                              : [],
                      )
                    : [];
            const charts = await Promise.all(
                [...new Set(chartSlugs)].map((slug) =>
                    readContent({ slug, type: 'chart' }).catch(() => null),
                ),
            );
            reads = [
                dashboard,
                ...charts.filter((chart): chart is Read => chart !== null),
            ];
        } else if (threadBinding?.type === 'chart' && threadBinding.chart) {
            reads = [
                await readContent({
                    slug: threadBinding.chart.slug,
                    type: 'chart',
                }),
            ];
        }
        const parts: string[] = [];
        for (const read of reads) {
            const text = render(read, siteUrl);
            if (
                text &&
                [...parts, text].join('\n\n').length <= MAX_PRELOAD_CHARS
            ) {
                parts.push(text);
            }
        }
        return parts.length > 0
            ? `Current content of the bound ${threadBinding?.type}, read at the start of this request. Edit it with editContent without reading it first.\n\n${parts.join('\n\n')}`
            : null;
    } catch {
        return null;
    }
};
