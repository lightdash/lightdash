import type { ReactNode } from 'react';
import { getSharedDotShape } from '../map/geometry';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCount, GROWTH_HINTS, KIND_LABELS, KIND_ORDER, markAttr, type ColourBy, type FlowKind, type MarkKind } from '../model';

const OUTLINED = new Set(['usage-f0', 'activity-never', 'role-viewer', 'growth-never']);
const EDGED = new Set<string>();

// A person's dot as the map draws it; the panel keys its bars with the same ones
export const DotSwatch = ({ colourBy, kind }: { colourBy: ColourBy; kind: MarkKind }) => {
    const attr = markAttr(colourBy, kind);
    return (
        <svg className="ad-swatch" width={10} height={10} aria-hidden>
            <g className="ad-dots">
                <circle
                    data-kind={attr}
                    cx={5}
                    cy={5}
                    r={attr.endsWith('-never') || attr === 'usage-f0' ? 3.5 : 4.2}
                    strokeWidth={OUTLINED.has(attr) ? 1.6 : EDGED.has(attr) ? 1 : undefined}
                />
            </g>
        </svg>
    );
};

// The ring the map draws around the dot of a person who is in another team too
const SharedSwatch = ({ colourBy }: { colourBy: ColourBy }) => {
    const { dotRadius, ringRadius, ringWidth } = getSharedDotShape(5.5);
    return (
        <svg className="ad-swatch" width={12} height={12} aria-hidden>
            <g className="ad-dots">
                <circle data-kind={markAttr(colourBy, KIND_ORDER[colourBy][0])} cx={6} cy={6} r={dotRadius - 0.5} strokeWidth={1} />
            </g>
            <circle className="ad-shared" cx={6} cy={6} r={ringRadius} strokeWidth={ringWidth} />
        </svg>
    );
};

type Props = {
    colourBy: ColourBy;
    counts: Map<MarkKind, number>;
    notes: string[];
    hasSharedMarks: boolean;
    // A control that belongs to this colouring, shown at the end of the legend's row
    action?: ReactNode;
};

// Just the idea: solid is more, see-through is less. The colour is the one the map's dots use.
// `solidFirst` turns it round, solid on the left, to match bars below that run from recent to long ago
const FadeScale = ({ colour, low, high, solidFirst }: { colour: string; low: string; high: string; solidFirst?: boolean }) => (
    // The scale sits first in the legend at a fixed width, so it is in the same place for every colouring whatever the
    // length of the words. Only the bar takes room in the row, so it and the entries beside it sit on the same line as
    // the entries of the other colourings; the names of its two ends hang beneath it.
    <li className="relative w-52 shrink-0 text-xs">
        <span
            className="ad-scale block h-3 w-full rounded-sm"
            style={{
                ['--scale-colour' as string]: colour,
                ...(solidFirst && { backgroundImage: 'linear-gradient(to left, color-mix(in srgb, var(--scale-colour) 15%, transparent), var(--scale-colour))' }),
            }}
        />
        <span className="absolute inset-x-0 top-full mt-1 flex justify-between text-[11px] leading-none text-muted-foreground">
            <span>{solidFirst ? high : low}</span>
            <span>{solidFirst ? low : high}</span>
        </span>
    </li>
);

// The people the scale leaves out, who the map draws as an open ring
// With a `hint`, hovering or focusing the entry says what it means, so the legend itself stays short
const NoneItem = ({ colourBy, kind, counts, hint }: { colourBy: ColourBy; kind: MarkKind; counts?: Map<MarkKind, number>; hint?: string }) => {
    const entry = (
        <>
            <DotSwatch colourBy={colourBy} kind={kind} />
            <span className={hint ? 'underline decoration-dotted decoration-muted-foreground underline-offset-4' : undefined}>{KIND_LABELS[colourBy][kind]}</span>
            {counts && <span className="ad-count text-muted-foreground">{formatCount(counts.get(kind) ?? 0)}</span>}
        </>
    );
    return (
        <li className="whitespace-nowrap text-xs">
            {hint ? (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="flex cursor-help items-center gap-1.5" tabIndex={0}>
                            {entry}
                        </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-64 whitespace-normal">{hint}</TooltipContent>
                </Tooltip>
            ) : (
                <span className="flex items-center gap-1.5">{entry}</span>
            )}
        </li>
    );
};

export const Legend = ({ colourBy, counts, notes, hasSharedMarks, action }: Props) => (
    <div className="space-y-2 border-t px-4 py-4">
        <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-8 gap-y-3">
        <ul className="m-0 flex list-none flex-wrap items-center gap-x-8 gap-y-3 p-0" aria-label="Legend">
            {colourBy === 'usage' ? (
                <>
                    <FadeScale colour="var(--ad-most)" low="Fewer features" high="More features" />
                    <NoneItem colourBy="usage" kind="f0" />
                </>
            ) : colourBy === 'activity' ? (
                <>
                    <FadeScale colour="var(--ad-recent)" low="Longer ago" high="Recently" solidFirst />
                    <NoneItem colourBy="activity" kind="never" />
                </>
            ) : (
                <TooltipProvider delayDuration={150}>
                    {KIND_ORDER[colourBy].map((kind) => (
                        <NoneItem key={kind} colourBy={colourBy} kind={kind} counts={counts} hint={colourBy === 'growth' ? GROWTH_HINTS[kind as FlowKind] : undefined} />
                    ))}
                </TooltipProvider>
            )}
            {hasSharedMarks && (
                <li className="flex items-center gap-1.5 whitespace-nowrap text-xs">
                    <SharedSwatch colourBy={colourBy} />
                    <span>In more than one team</span>
                </li>
            )}
        </ul>
        {action}
        </div>
        {notes.map((note) => (
            <p key={note} className="m-0 text-xs text-muted-foreground">
                {note}
            </p>
        ))}
    </div>
);
