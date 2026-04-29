# D3 Reference

This document is loaded only when an app needs D3. The skill ships with `d3`, `d3-sankey`, and `d3-cloud` pre-installed. Sunburst, treemap, pack, icicle, force, geo, hexbin, and chord all use d3 core (`d3.hierarchy`, `d3.partition`, `d3.tree`, `d3.forceSimulation`, etc.) — no extra packages required.

## The React 19 + D3 pattern

D3 owns the SVG. React owns when to redraw. Use a `ref` and a `useEffect` keyed on data + dimensions. Always clear before re-rendering.

```tsx
useEffect(() => {
    if (!svgRef.current || !data?.length) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    // ... build scales, layouts, render ...
}, [data, /* anything else that should trigger a redraw */]);
```

## Rules that always apply

These are the same rules as for Recharts charts — they don't relax just because D3 is in charge of pixels.

- **Series colors come from `CHART_COLORS`** (`@/lib/theme`). Cycle by index for multi-series; never hand-pick palettes.
- **Apply global filters via `filtersFor(EXPLORE)`** — same rule as every other `useLightdash()` call. Wrap the filtered query in `useMemo`.
- **Click → `addFilter({ ..., explore: EXPLORE })`** — the action menu requirement carries over. Wire it directly into `.on('click', ...)`. If you want a multi-option menu (Filter by / Drill into …) wrap the click in a state-driven `<DropdownMenu>` opened at the click coordinates, exactly like the Recharts example in the main skill.
- **Drive D3 only against the SVG ref.** Don't `d3.select('body')` or attach listeners to `document`. The iframe has strict CSP and a small DOM — don't reach outside your component.
- **Always clear before redrawing** with `svg.selectAll('*').remove()` at the top of the effect. Without this, every data update appends a new copy of the chart on top of the old one.
- **Format display values via `format(row, fieldName)`** — even inside D3 callbacks. Don't reimplement currency / percent / date formatting.
- **Loading and error states are still mandatory.** D3 only runs in the effect; the surrounding component must show a spinner while `loading` is true (see "Loading states" in `skill.md`).
- **Never animate transitions across data refetches.** A chart re-rendering after a filter change should snap, not slide — animations look like the data is still loading.
- **Use `viewBox` for responsive sizing.** Set `svg.attr('viewBox', \`0 0 ${width} ${height}\`)` once, then style the `<svg>` element with `className="w-full h-auto"`. Don't measure container width imperatively unless the chart genuinely depends on it.

## Example 1 — Bar chart (the basic pattern)

The simplest case: read data, build scales inside the effect, render rects, wire click → `addFilter`. This is the template you copy when you need a chart Recharts can almost-but-not-quite produce.

```tsx
import { useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { Loader2 } from 'lucide-react';
import { query, useLightdash } from '@lightdash/query-sdk';
import { useGlobalFilters } from '@/lib/filters';
import { CHART_COLORS } from '@/lib/theme';

const EXPLORE = 'orders';

const baseQuery = query(EXPLORE)
    .label('Revenue by Segment (D3 bar)')
    .dimensions(['customer_segment'])
    .metrics(['total_revenue']);

export function RevenueBars() {
    const { filtersFor, addFilter } = useGlobalFilters();
    const q = useMemo(
        () => baseQuery.filters(filtersFor(EXPLORE)),
        [filtersFor],
    );
    const { data, loading } = useLightdash(q);
    const svgRef = useRef<SVGSVGElement | null>(null);

    useEffect(() => {
        if (!svgRef.current || !data?.length) return;
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const width = 600;
        const height = 360;
        const margin = { top: 20, right: 20, bottom: 40, left: 60 };

        const x = d3
            .scaleBand()
            .domain(data.map((d) => String(d.customer_segment)))
            .range([margin.left, width - margin.right])
            .padding(0.15);

        const y = d3
            .scaleLinear()
            .domain([0, d3.max(data, (d) => Number(d.total_revenue)) ?? 0])
            .nice()
            .range([height - margin.bottom, margin.top]);

        svg.attr('viewBox', `0 0 ${width} ${height}`);

        svg.append('g')
            .attr('transform', `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x))
            .selectAll('text')
            .attr('fill', 'currentColor');

        svg.append('g')
            .attr('transform', `translate(${margin.left},0)`)
            .call(d3.axisLeft(y))
            .selectAll('text')
            .attr('fill', 'currentColor');

        svg.append('g')
            .selectAll('rect')
            .data(data)
            .join('rect')
            .attr('x', (d) => x(String(d.customer_segment))!)
            .attr('y', (d) => y(Number(d.total_revenue)))
            .attr('width', x.bandwidth())
            .attr('height', (d) => y(0) - y(Number(d.total_revenue)))
            .attr('fill', (_, i) => CHART_COLORS[i % CHART_COLORS.length])
            .style('cursor', 'pointer')
            .on('click', (_event, d) => {
                addFilter({
                    field: 'customer_segment',
                    operator: 'equals',
                    value: d.customer_segment,
                    explore: EXPLORE,
                });
            });
    }, [data, addFilter]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[360px]">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }
    return <svg ref={svgRef} className="w-full h-auto" />;
}
```

## Example 2 — Sankey (flows between stages)

Sankey diagrams visualize quantities flowing between named nodes — funnel stages, customer-segment transitions, region-to-region revenue. Use `d3-sankey` for the layout and render with `d3.linkHorizontal()` for the curved paths.

The data model is `{ nodes: Array<{ name }>, links: Array<{ source, target, value }> }`. Build it from your query rows. Click a node to filter on that node's name.

```tsx
import { useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal, type SankeyGraph } from 'd3-sankey';
import { Loader2 } from 'lucide-react';
import { query, useLightdash } from '@lightdash/query-sdk';
import { useGlobalFilters } from '@/lib/filters';
import { CHART_COLORS } from '@/lib/theme';

const EXPLORE = 'orders';
const NODE_FIELD = 'source_segment';   // adjust to actual dimension fields
const TARGET_FIELD = 'target_segment';

type Node = { name: string };
type Link = { source: number; target: number; value: number };

const baseQuery = query(EXPLORE)
    .label('Segment transitions (Sankey)')
    .dimensions([NODE_FIELD, TARGET_FIELD])
    .metrics(['total_revenue']);

export function SegmentSankey() {
    const { filtersFor, addFilter } = useGlobalFilters();
    const q = useMemo(
        () => baseQuery.filters(filtersFor(EXPLORE)),
        [filtersFor],
    );
    const { data, loading } = useLightdash(q);
    const svgRef = useRef<SVGSVGElement | null>(null);

    useEffect(() => {
        if (!svgRef.current || !data?.length) return;
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const width = 720;
        const height = 460;
        svg.attr('viewBox', `0 0 ${width} ${height}`);

        // Build the graph: dedupe node names, then index links into them.
        const names = Array.from(
            new Set(
                data.flatMap((d) => [
                    String(d[NODE_FIELD]),
                    String(d[TARGET_FIELD]),
                ]),
            ),
        );
        const nodes: Node[] = names.map((name) => ({ name }));
        const links: Link[] = data.map((d) => ({
            source: names.indexOf(String(d[NODE_FIELD])),
            target: names.indexOf(String(d[TARGET_FIELD])),
            value: Number(d.total_revenue),
        }));

        const layout = sankey<Node, Link>()
            .nodeWidth(14)
            .nodePadding(10)
            .extent([
                [10, 10],
                [width - 10, height - 10],
            ]);

        const graph = layout({
            nodes: nodes.map((d) => ({ ...d })),
            links: links.map((d) => ({ ...d })),
        }) as SankeyGraph<Node, Link>;

        // Links
        svg.append('g')
            .attr('fill', 'none')
            .selectAll('path')
            .data(graph.links)
            .join('path')
            .attr('d', sankeyLinkHorizontal())
            .attr('stroke', (_, i) => CHART_COLORS[i % CHART_COLORS.length])
            .attr('stroke-opacity', 0.4)
            .attr('stroke-width', (d) => Math.max(1, d.width ?? 0));

        // Nodes (filterable)
        svg.append('g')
            .selectAll('rect')
            .data(graph.nodes)
            .join('rect')
            .attr('x', (d) => d.x0!)
            .attr('y', (d) => d.y0!)
            .attr('width', (d) => d.x1! - d.x0!)
            .attr('height', (d) => d.y1! - d.y0!)
            .attr('fill', (_, i) => CHART_COLORS[i % CHART_COLORS.length])
            .style('cursor', 'pointer')
            .on('click', (_event, d) => {
                addFilter({
                    field: NODE_FIELD,
                    operator: 'equals',
                    value: d.name,
                    explore: EXPLORE,
                });
            });

        // Labels
        svg.append('g')
            .style('font-size', '11px')
            .selectAll('text')
            .data(graph.nodes)
            .join('text')
            .attr('x', (d) => (d.x0! < width / 2 ? d.x1! + 4 : d.x0! - 4))
            .attr('y', (d) => (d.y0! + d.y1!) / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', (d) => (d.x0! < width / 2 ? 'start' : 'end'))
            .attr('fill', 'currentColor')
            .text((d) => d.name);
    }, [data, addFilter]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[460px]">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }
    return <svg ref={svgRef} className="w-full h-auto" />;
}
```

**Sankey-specific notes:**
- `nodeWidth` and `nodePadding` are the two layout knobs you'll tune. Wider nodes for fewer/larger entities; tighter padding when there are many.
- `sankey-circular` exists for cyclic graphs; the standard `d3-sankey` only handles DAGs. If your data has cycles, the layout will silently produce wrong positions.
- Don't filter on the link itself — filter on the node a user clicked. Filtering on a `(source, target)` pair is rarely what the user wants.

## Example 3 — Sunburst (hierarchical part-of-whole)

Sunburst is a radial treemap: nested rings showing the share of each child within its parent. Good for category → subcategory → product hierarchies. Built from `d3.hierarchy` + `d3.partition` + `d3.arc`.

Your data needs to be hierarchical. If your query returns a flat tabular result, build the hierarchy by grouping. Click an arc to filter on the leaf-most dimension.

```tsx
import { useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { Loader2 } from 'lucide-react';
import { query, useLightdash } from '@lightdash/query-sdk';
import { useGlobalFilters } from '@/lib/filters';
import { CHART_COLORS } from '@/lib/theme';

const EXPLORE = 'orders';
const LEVELS = ['region', 'customer_segment'] as const;

type SunburstNode = { name: string; field?: string; value?: number; children?: SunburstNode[] };

const baseQuery = query(EXPLORE)
    .label('Revenue Sunburst')
    .dimensions([...LEVELS])
    .metrics(['total_revenue']);

function buildHierarchy(rows: Array<Record<string, unknown>>): SunburstNode {
    const root: SunburstNode = { name: 'root', children: [] };
    for (const row of rows) {
        let node = root;
        LEVELS.forEach((field, depth) => {
            const name = String(row[field]);
            node.children = node.children ?? [];
            let child = node.children.find((c) => c.name === name);
            if (!child) {
                child = { name, field };
                node.children.push(child);
            }
            if (depth === LEVELS.length - 1) child.value = Number(row.total_revenue);
            node = child;
        });
    }
    return root;
}

export function RevenueSunburst() {
    const { filtersFor, addFilter } = useGlobalFilters();
    const q = useMemo(
        () => baseQuery.filters(filtersFor(EXPLORE)),
        [filtersFor],
    );
    const { data, loading } = useLightdash(q);
    const svgRef = useRef<SVGSVGElement | null>(null);

    useEffect(() => {
        if (!svgRef.current || !data?.length) return;
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const size = 480;
        const radius = size / 2;
        svg.attr('viewBox', `${-radius} ${-radius} ${size} ${size}`);

        const root = d3
            .hierarchy(buildHierarchy(data as Array<Record<string, unknown>>))
            .sum((d) => d.value ?? 0)
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

        const partition = d3.partition<SunburstNode>().size([2 * Math.PI, radius]);
        partition(root);

        const arc = d3
            .arc<d3.HierarchyRectangularNode<SunburstNode>>()
            .startAngle((d) => d.x0)
            .endAngle((d) => d.x1)
            .padAngle(0.005)
            .innerRadius((d) => d.y0)
            .outerRadius((d) => d.y1 - 1);

        svg.append('g')
            .selectAll('path')
            .data(root.descendants().filter((d) => d.depth > 0))
            .join('path')
            .attr('d', (d) => arc(d as d3.HierarchyRectangularNode<SunburstNode>))
            .attr(
                'fill',
                (_, i) => CHART_COLORS[i % CHART_COLORS.length],
            )
            .attr('fill-opacity', (d) => 0.4 + 0.2 * d.depth)
            .style('cursor', 'pointer')
            .on('click', (_event, d) => {
                const field = d.data.field;
                if (!field) return;
                addFilter({
                    field,
                    operator: 'equals',
                    value: d.data.name,
                    explore: EXPLORE,
                });
            });

        // Labels for arcs big enough to show one
        svg.append('g')
            .attr('pointer-events', 'none')
            .style('font-size', '10px')
            .style('text-anchor', 'middle')
            .attr('fill', 'currentColor')
            .selectAll('text')
            .data(
                root
                    .descendants()
                    .filter(
                        (d) =>
                            d.depth > 0 &&
                            (d as d3.HierarchyRectangularNode<SunburstNode>).x1 -
                                (d as d3.HierarchyRectangularNode<SunburstNode>).x0 >
                                0.04,
                    ),
            )
            .join('text')
            .attr('transform', (d) => {
                const node = d as d3.HierarchyRectangularNode<SunburstNode>;
                const angle = (node.x0 + node.x1) / 2;
                const r = (node.y0 + node.y1) / 2;
                return `rotate(${(angle * 180) / Math.PI - 90}) translate(${r},0) rotate(${
                    angle > Math.PI ? 180 : 0
                })`;
            })
            .text((d) => d.data.name);
    }, [data, addFilter]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[480px]">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }
    return <svg ref={svgRef} className="w-full h-auto" />;
}
```

**Sunburst-specific notes:**
- The `field` you tagged onto each node is what `addFilter` uses. Hierarchies with mixed-meaning levels need it; without it, a click on "North America" (region) and "Enterprise" (segment) would be indistinguishable.
- `padAngle` is what gives the rings their separated-slice look. Don't drop it — slices touching pixel-to-pixel makes the chart look like one solid disk at small sizes.
- Skip labels under ~0.04 radians of arc width. Otherwise you get unreadable overlapping text.

## Example 4 — Word cloud (term frequency)

Word clouds are the right tool when the user has a metric that's a count over a free-text dimension (search terms, error messages, product names) and wants to see relative size at a glance. Use `d3-cloud` for the asynchronous layout — it computes positions in a worker-like loop and calls back when done.

```tsx
import { useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import cloud from 'd3-cloud';
import { Loader2 } from 'lucide-react';
import { query, useLightdash } from '@lightdash/query-sdk';
import { useGlobalFilters } from '@/lib/filters';
import { CHART_COLORS } from '@/lib/theme';

const EXPLORE = 'feedback';
const TERM_FIELD = 'feedback_term';

type Word = { text: string; size: number; x?: number; y?: number; rotate?: number };

const baseQuery = query(EXPLORE)
    .label('Top feedback terms')
    .dimensions([TERM_FIELD])
    .metrics(['mention_count'])
    .sorts([{ field: 'mention_count', direction: 'desc' }])
    .limit(80);

export function FeedbackWordCloud() {
    const { filtersFor, addFilter } = useGlobalFilters();
    const q = useMemo(
        () => baseQuery.filters(filtersFor(EXPLORE)),
        [filtersFor],
    );
    const { data, loading } = useLightdash(q);
    const svgRef = useRef<SVGSVGElement | null>(null);

    useEffect(() => {
        if (!svgRef.current || !data?.length) return;
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const width = 600;
        const height = 380;
        svg.attr('viewBox', `0 0 ${width} ${height}`);

        const counts = data.map((d) => Number(d.mention_count));
        const fontScale = d3
            .scaleSqrt()
            .domain([d3.min(counts) ?? 1, d3.max(counts) ?? 1])
            .range([12, 56]);

        const words: Word[] = data.map((d) => ({
            text: String(d[TERM_FIELD]),
            size: fontScale(Number(d.mention_count)),
        }));

        // d3-cloud computes positions iteratively and calls .on('end', ...) when done.
        const layout = cloud<Word>()
            .size([width, height])
            .words(words)
            .padding(2)
            .rotate(() => (Math.random() < 0.5 ? 0 : 90))
            .font('sans-serif')
            .fontSize((d) => d.size!)
            .on('end', (placed) => {
                svg.append('g')
                    .attr('transform', `translate(${width / 2},${height / 2})`)
                    .selectAll('text')
                    .data(placed)
                    .join('text')
                    .style('font-family', 'sans-serif')
                    .style('font-size', (d) => `${d.size}px`)
                    .style('cursor', 'pointer')
                    .attr('text-anchor', 'middle')
                    .attr(
                        'transform',
                        (d) => `translate(${d.x ?? 0},${d.y ?? 0}) rotate(${d.rotate ?? 0})`,
                    )
                    .attr('fill', (_, i) => CHART_COLORS[i % CHART_COLORS.length])
                    .text((d) => d.text)
                    .on('click', (_event, d) => {
                        addFilter({
                            field: TERM_FIELD,
                            operator: 'equals',
                            value: d.text,
                            explore: EXPLORE,
                        });
                    });
            });

        layout.start();

        // Cancel on cleanup so we don't paint into a stale svg.
        return () => {
            layout.stop();
        };
    }, [data, addFilter]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[380px]">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }
    return <svg ref={svgRef} className="w-full h-auto" />;
}
```

**Word-cloud-specific notes:**
- `d3-cloud` is **async**. The layout's `.on('end', ...)` callback fires after positions are computed. Never paint synchronously; always paint inside the callback. If the user changes filters mid-layout, your cleanup `layout.stop()` prevents a paint into a stale SVG.
- Use `scaleSqrt`, not `scaleLinear`, for font size — area scales with font size squared, so a sqrt scale gives roughly proportional perceived weight.
- Cap input rows (`.limit(80)`-ish). The layout is `O(n²)` in placement attempts; a 500-word cloud will hang the iframe for several seconds.
- Don't rotate to arbitrary angles. Stick to `0` and `90` (or `0`, `-30`, `30`). Mixed-angle clouds look chaotic and labels become unreadable.

## Common D3 mistakes

| Mistake | Fix |
|---|---|
| Forgetting `svg.selectAll('*').remove()` | Add it as the first line inside `useEffect`. Stale layers stack otherwise. |
| Building `d3.scale*` outside the effect with stale `data` | Construct scales **inside** the effect so they re-derive when data changes. |
| Hand-picking colors | Use `CHART_COLORS[i % CHART_COLORS.length]`. |
| Using `d3.select(document.querySelector(...))` | Use the ref. The sandbox iframe has strict CSP and the document graph isn't yours. |
| Ignoring `addFilter`/`filtersFor` because "D3 owns the chart" | Action menu rule still applies. Wire `.on('click', d => addFilter({ ..., explore: EXPLORE }))`. |
| Animating transitions on every refetch | Snap, don't slide. A 500 ms transition looks like a loading state. |
| Sankey: filtering on a `(source, target)` link | Filter on the node a user clicked. Pair filters are rarely what users want. |
| Sunburst: clicking an arc with no `field` tag | Tag each node with the dimension field it came from when you build the hierarchy. |
| Word cloud: painting synchronously | `d3-cloud` is async — paint inside `.on('end', ...)` only. Return `() => layout.stop()` from the effect for cleanup. |
| Word cloud: not capping rows | `O(n²)` layout. Cap with `.limit(80)`-ish on the query. |
| Measuring container width with `getBoundingClientRect` | Set `viewBox` once and let CSS scale via `className="w-full h-auto"`. |
