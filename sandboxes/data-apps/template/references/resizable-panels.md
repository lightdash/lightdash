# Resizable panels (shadcn Resizable)

> Read this only when the user asks for adjustable/split panel sizing, or the layout genuinely benefits from user-rebalanced panes.

Use the pre-installed shadcn `Resizable` component (built on `react-resizable-panels`) when the layout has **two or more sibling areas the user benefits from rebalancing in-place** — typical cases:

- A chart next to a detail/inspector panel ("see the bar I clicked").
- A dashboard split between filters/sidebar and the main grid.
- A table beside a chart that visualizes the same query.
- A document/explanation panel next to a live data view.

**Don't reach for it by default.** If panels have a fixed information ratio (KPI row above a grid, header above content), use plain Tailwind flex/grid. Resizable is for layouts where the user has a real preference between "give me more chart" and "give me more detail."

```tsx
import {
    ResizablePanelGroup,
    ResizablePanel,
    ResizableHandle,
} from '@/components/ui/resizable';

export function SplitDashboard() {
    return (
        <ResizablePanelGroup
            direction="horizontal"
            className="h-[calc(100vh-3rem)] rounded-md border"
            autoSaveId="dashboard-split"   // remembers user sizing in localStorage
        >
            <ResizablePanel defaultSize={65} minSize={35}>
                <RevenueByMonth />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={35} minSize={20}>
                <SegmentBreakdown />
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}
```

Rules:

- **Set `autoSaveId`** so user sizing persists across reloads. The id is the localStorage key — keep it stable per layout.
- **Always set `minSize`** on every panel. Without it, users can collapse a panel to zero and lose the chart inside.
- **Use `withHandle` on `ResizableHandle`** for visible drag affordance. Without it, the divider is a 1-pixel hover target.
- **Nest groups for grid layouts.** A 3-pane "filters | chart | detail" goes one `ResizablePanelGroup direction="horizontal"`. A "chart over table" goes `direction="vertical"`. Combine by nesting.
- **Don't use it inside a card.** Resizable wants a parent with a definite height (`h-screen`, `h-[600px]`, etc.). Inside a `Card` with content-sized height it collapses.
- **Charts inside resizable panels must use `viewBox` or Recharts' `<ResponsiveContainer>`.** Hard-coded pixel widths won't reflow on resize.

When users explicitly ask for "drag to resize" or "let me adjust the panel sizes," that's the trigger. Otherwise prefer fixed proportions.
