import type { ReactNode } from 'react';

/**
 * Wrap the content of a custom Recharts `<Tooltip content={...} />` in this
 * component. The chrome (background, border, shadow, radius) is supplied by
 * `.chart-tooltip-surface` in chart-overrides.css and adapts to whatever theme
 * the app uses. Layout and typography inside are yours.
 *
 *   <Tooltip content={({ payload, label }) => payload?.[0] ? (
 *       <ChartTooltipSurface>
 *           <div className="font-semibold">{label}</div>
 *           <div className="font-mono text-sm">{payload[0].value}</div>
 *       </ChartTooltipSurface>
 *   ) : null} />
 *
 * Sibling: shadcn's DropdownMenuContent / PopoverContent / DialogContent get
 * the same chrome automatically via Radix data attributes — see chart-overrides.css.
 */
export function ChartTooltipSurface({
    children,
    className = '',
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={`chart-tooltip-surface px-3 py-2 ${className}`}>
            {children}
        </div>
    );
}
