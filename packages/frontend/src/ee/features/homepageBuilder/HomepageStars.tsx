import { assertUnreachable } from '@lightdash/common';
import { Box, Group, Text } from '@mantine-8/core';
import { useMediaQuery, useReducedMotion } from '@mantine-8/hooks';
import {
    IconChartArea,
    IconChartBar,
    IconChartLine,
    IconChartPie,
    IconFolder,
    IconLayoutDashboard,
    IconSparkles,
    IconTable,
    type Icon,
} from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type CSSProperties,
    type FC,
    type ReactElement,
} from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './HomepageStars.module.css';

const randomBetween = (min: number, max: number) =>
    min + Math.random() * (max - min);

// Stars drop into candidate slots either side of the centered hero. The slots
// are deliberately uneven and differ between the sides, so the sky reads as
// scattered rather than as two columns; spacing is enforced at spawn time
// instead of by a fixed pitch.
const MAX_STARS = 7;
const SLOT_TOP_JITTER_PCT = 1;
// Cards come in three sizes, the smaller ones slightly faded, which reads as
// depth and stops every card sharing an edge with its neighbours.
const SIZE_SCALES = [0.78, 0.88, 1];
// Only the mount gate needs these in JS — a media query cannot read the CSS
// variables that own the layout (--homepage-hero-width, --homepage-page-padding-x).
const CONTENT_HALF_WIDTH_PX = 360;
const PAGE_PADDING_X_PX = 24;

// Narrower viewports get narrower stars hugging the hero more closely, rather
// than no stars at all. A tier is used from the width where a star at its
// closest to the hero still clears the page padding, with breathing room:
// 2 * (hero half + clearance + star + padding) + 40. How far past the hero a
// star actually sits is spread across whatever space the viewport leaves,
// which the stylesheet works out from --star-slack.
type SkyTier = {
    starWidthPx: number;
    clearancePx: number;
    minHeightPx: number;
    cardHeightPx: number;
};

const tierMinWidth = (tier: SkyTier) =>
    2 *
        (CONTENT_HALF_WIDTH_PX +
            tier.clearancePx +
            tier.starWidthPx +
            PAGE_PADDING_X_PX) +
    40;

// cardHeightPx is the measured height of the tallest card at that width, as a
// rotated bounding box.
const WIDE_TIER: SkyTier = {
    starWidthPx: 220,
    clearancePx: 40,
    minHeightPx: 860,
    cardHeightPx: 137,
};
const COMPACT_TIER: SkyTier = {
    starWidthPx: 170,
    clearancePx: 20,
    minHeightPx: 800,
    cardHeightPx: 132,
};

const STAGE_CHROME_PX = 122; // --navbar-height + the 72px homepageLayout keeps

// Two stars on a side must be at least a card apart, measured against the
// shortest stage the tier allows, with room for the jitter at both ends.
const minSlotGapPct = (tier: SkyTier) =>
    (tier.cardHeightPx / (tier.minHeightPx - STAGE_CHROME_PX)) * 100 +
    2 * SLOT_TOP_JITTER_PCT;

const tierMediaQuery = (tier: SkyTier) =>
    `(min-width: ${tierMinWidth(tier)}px) and (min-height: ${
        tier.minHeightPx
    }px)`;

type Slot = { side: 'left' | 'right'; topPct: number };

const SLOTS: Slot[] = [
    { side: 'left', topPct: 3 },
    { side: 'left', topPct: 17 },
    { side: 'left', topPct: 29 },
    { side: 'left', topPct: 44 },
    { side: 'left', topPct: 58 },
    { side: 'left', topPct: 72 },
    { side: 'right', topPct: 9 },
    { side: 'right', topPct: 23 },
    { side: 'right', topPct: 37 },
    { side: 'right', topPct: 51 },
    { side: 'right', topPct: 65 },
    { side: 'right', topPct: 78 },
];

const PALETTE = [
    'var(--mantine-color-blue-6)',
    'var(--mantine-color-green-6)',
    'var(--mantine-color-violet-6)',
    'var(--mantine-color-teal-6)',
    'var(--mantine-color-orange-6)',
    'var(--mantine-color-red-6)',
];

// The cards are look-alikes, not the homepage's real content components: the
// decoration has no content to show, and borrowing those would tie it to the
// content domain model and mount a chart engine to draw scenery.
const MOCK_CHARTS: { name: string; icon: Icon; tint: string }[] = [
    {
        name: 'Monthly recurring revenue',
        icon: IconChartLine,
        tint: PALETTE[0],
    },
    { name: 'Signups by channel', icon: IconChartBar, tint: PALETTE[1] },
    { name: 'Orders per week', icon: IconChartBar, tint: PALETTE[3] },
    { name: 'Active workspaces', icon: IconChartArea, tint: PALETTE[2] },
    { name: 'Revenue by segment', icon: IconChartPie, tint: PALETTE[4] },
    { name: 'Churn rate over time', icon: IconChartLine, tint: PALETTE[5] },
];

const MOCK_DASHBOARD_NAMES = ['Company KPIs', 'Growth overview'];

const MOCK_KPIS: {
    label: string;
    value: string;
    color: string;
    variant: 'line' | 'bar';
}[] = [
    {
        label: 'Total revenue',
        value: '$128k',
        color: PALETTE[0],
        variant: 'line',
    },
    {
        label: 'Weekly active users',
        value: '4,209',
        color: PALETTE[1],
        variant: 'bar',
    },
    {
        label: 'Conversion rate',
        value: '3.8%',
        color: PALETTE[2],
        variant: 'line',
    },
    {
        label: 'Avg. order value',
        value: '$92',
        color: PALETTE[3],
        variant: 'bar',
    },
    { label: 'New signups', value: '312', color: PALETTE[4], variant: 'bar' },
    { label: 'Churn rate', value: '1.2%', color: PALETTE[5], variant: 'line' },
];

// Presentational copies of the homepage quick-action chips — no links, no
// hooks, no tracking, so the decoration never fires network requests or
// pollutes homepage analytics.
type ChipKey = 'ask-ai' | 'run-query' | 'browse-dashboards' | 'browse-spaces';

const CHIP_DEFS: Record<ChipKey, { icon: Icon; title: string }> = {
    'ask-ai': { icon: IconSparkles, title: 'Ask AI' },
    'run-query': { icon: IconTable, title: 'Run a query' },
    'browse-dashboards': {
        icon: IconLayoutDashboard,
        title: 'Browse dashboards',
    },
    'browse-spaces': { icon: IconFolder, title: 'Browse spaces' },
};

// Disjoint, so two chip stars on screen at once never repeat a label.
const MOCK_CHIP_SETS: ChipKey[][] = [
    ['ask-ai', 'run-query'],
    ['browse-dashboards', 'browse-spaces'],
];

const StaticChips: FC<{ types: ChipKey[] }> = ({ types }) => (
    <Group gap={8} justify="center">
        {types.map((type) => (
            <span key={type} className={classes.chip}>
                <MantineIcon
                    icon={CHIP_DEFS[type].icon}
                    size={14}
                    color="ldGray.6"
                />
                {CHIP_DEFS[type].title}
            </span>
        ))}
    </Group>
);

const StarCard: FC<{
    icon: Icon;
    tint: string;
    name: string;
    meta: string;
}> = ({ icon, tint, name, meta }) => (
    <Box className={classes.card} p={14}>
        <Box className={classes.cardIcon} mb={10}>
            <MantineIcon icon={icon} size={16} style={{ color: tint }} />
        </Box>
        <Text size="sm" fw={600} truncate mb={2}>
            {name}
        </Text>
        <Text size="xs" c="dimmed" truncate>
            {meta}
        </Text>
    </Box>
);

const SPARKLINE_WIDTH = 100;
const SPARKLINE_HEIGHT = 32;

// Hand-drawn rather than charted: these are 14 meaningless numbers, and a real
// chart engine would mount and dispose an instance per star.
const StarSparkline: FC<{
    values: number[];
    color: string;
    variant: 'line' | 'bar';
}> = ({ values, color, variant }) => {
    const max = Math.max(...values);
    const min = Math.min(...values);
    const span = max - min || 1;
    const step = SPARKLINE_WIDTH / (values.length - 1 || 1);
    const y = (value: number) =>
        SPARKLINE_HEIGHT - ((value - min) / span) * (SPARKLINE_HEIGHT - 4) - 2;

    return (
        <svg
            className={classes.sparkline}
            viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden
        >
            {variant === 'bar' ? (
                values.map((value, index) => (
                    <rect
                        key={index}
                        x={index * step + step * 0.2}
                        y={y(value)}
                        width={step * 0.6}
                        height={SPARKLINE_HEIGHT - y(value)}
                        rx={1}
                        fill={color}
                    />
                ))
            ) : (
                <>
                    <path
                        d={`M0,${SPARKLINE_HEIGHT} ${values
                            .map(
                                (value, index) =>
                                    `L${index * step},${y(value)}`,
                            )
                            .join(
                                ' ',
                            )} L${SPARKLINE_WIDTH},${SPARKLINE_HEIGHT} Z`}
                        fill={color}
                        opacity={0.12}
                    />
                    <polyline
                        points={values
                            .map(
                                (value, index) => `${index * step},${y(value)}`,
                            )
                            .join(' ')}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        strokeLinejoin="round"
                    />
                </>
            )}
        </svg>
    );
};

// Everything random about a star's content is captured in its seed, drawn
// before setState. Stars store descriptors (defKey + seed), not elements,
// so state updates stay pure and content is stable across renders.
type StarSeed = {
    values: number[];
    views: number;
};

const buildSparklineValues = (): number[] => {
    let value = randomBetween(40, 60);
    return Array.from({ length: 14 }, () => {
        value = Math.max(5, value + randomBetween(-8, 10));
        return Math.round(value);
    });
};

// Catalog of distinct star identities. A def only spawns while no visible
// star uses it, so the sky never shows duplicate cards, KPIs, or chips.
type StarDef = { key: string; render: (seed: StarSeed) => ReactElement };

const STAR_DEFS: StarDef[] = [
    ...MOCK_CHARTS.map(
        (chart): StarDef => ({
            key: `chart-${chart.name}`,
            render: (seed) => (
                <StarCard
                    icon={chart.icon}
                    tint={chart.tint}
                    name={chart.name}
                    meta={`Chart · ${seed.views} views`}
                />
            ),
        }),
    ),
    ...MOCK_DASHBOARD_NAMES.map(
        (name): StarDef => ({
            key: `dashboard-${name}`,
            render: (seed) => (
                <StarCard
                    icon={IconLayoutDashboard}
                    tint={PALETTE[2]}
                    name={name}
                    meta={`Dashboard · ${seed.views} views`}
                />
            ),
        }),
    ),
    ...MOCK_KPIS.map(
        (kpi): StarDef => ({
            key: `kpi-${kpi.label}`,
            render: (seed) => (
                <Box className={classes.card} p="sm">
                    <Text size="xs" c="dimmed" lineClamp={1}>
                        {kpi.label}
                    </Text>
                    <Text fw={700} size="xl" mb={4}>
                        {kpi.value}
                    </Text>
                    <StarSparkline
                        values={seed.values}
                        color={kpi.color}
                        variant={kpi.variant}
                    />
                </Box>
            ),
        }),
    ),
    ...MOCK_CHIP_SETS.map(
        (types, index): StarDef => ({
            key: `chips-${index}`,
            render: () => <StaticChips types={types} />,
        }),
    ),
];

const STAR_DEF_MAP = new Map(STAR_DEFS.map((def) => [def.key, def]));

// A star animates only while entering and leaving. In between it sits in a
// static transform so the browser paints it without a compositor layer —
// a permanently animating layer is resampled through the tilt and goes soft.
type StarPhase = 'entering' | 'settled' | 'leaving';

// Must match the starLeave animation duration in the stylesheet.
const LEAVE_MS = 500;

const phaseClass = (phase: StarPhase) => {
    switch (phase) {
        case 'entering':
            return classes.starEntering;
        case 'leaving':
            return classes.starLeaving;
        case 'settled':
            return '';
        default:
            return assertUnreachable(phase, 'Unknown star phase');
    }
};

type Star = {
    id: number;
    defKey: string;
    slot: Slot;
    className: string;
    style: CSSProperties;
    seed: StarSeed;
    phase: StarPhase;
    lifetimeMs: number;
};

type StarDraws = {
    lifetimeMs: number;
    slotPick: number;
    defPick: number;
    sizePick: number;
    gutterPick: number;
    topJitter: number;
    tilt: number;
    seed: StarSeed;
};

// All randomness for a star is drawn before setState so the state updaters
// below stay pure (StrictMode double-invokes them in dev).
const drawStar = (): StarDraws => ({
    lifetimeMs: randomBetween(5000, 9000),
    slotPick: Math.random(),
    defPick: Math.random(),
    sizePick: Math.random(),
    gutterPick: Math.random(),
    topJitter: randomBetween(-SLOT_TOP_JITTER_PCT, SLOT_TOP_JITTER_PCT),
    // Stars enter level and settle into a slight tilt, randomized
    // counter-clockwise (negative) or clockwise (positive).
    tilt: randomBetween(2, 5) * (Math.random() < 0.5 ? -1 : 1),
    seed: {
        values: buildSparklineValues(),
        views: Math.floor(randomBetween(3, 900)),
    },
});

// The side that has no star still on screen, ignoring stars already fading
// out. null when both sides are covered — or when neither is, in which case
// the caller is free to choose.
const emptySideOf = (stars: Star[]): 'left' | 'right' | null => {
    const visible = stars.filter((star) => star.phase !== 'leaving');
    const hasLeft = visible.some((star) => star.slot.side === 'left');
    const hasRight = visible.some((star) => star.slot.side === 'right');
    if (hasLeft === hasRight) return null;
    return hasLeft ? 'right' : 'left';
};

const appendStar = (
    current: Star[],
    id: number,
    draws: StarDraws,
    forcedSide: 'left' | 'right' | null,
    tier: SkyTier,
): Star[] => {
    // Stars fading out still hold their slot and def, but they no longer
    // count against the cap — otherwise a replacement can't take off while
    // its predecessor is still on screen.
    const visibleCount = current.filter(
        (star) => star.phase !== 'leaving',
    ).length;
    if (visibleCount >= MAX_STARS) return current;
    const minGapPct = minSlotGapPct(tier);
    const freeSlots = SLOTS.filter(
        (slot) =>
            !current.some(
                (star) =>
                    star.slot.side === slot.side &&
                    Math.abs(star.slot.topPct - slot.topPct) < minGapPct,
            ),
    );
    const busyDefs = new Set(current.map((s) => s.defKey));
    const freeDefs = STAR_DEFS.filter((def) => !busyDefs.has(def.key));
    if (freeSlots.length === 0 || freeDefs.length === 0) return current;
    const sideSlots = forcedSide
        ? freeSlots.filter((slot) => slot.side === forcedSide)
        : freeSlots;
    const candidateSlots = sideSlots.length > 0 ? sideSlots : freeSlots;
    const slot =
        candidateSlots[Math.floor(draws.slotPick * candidateSlots.length)];
    const def = freeDefs[Math.floor(draws.defPick * freeDefs.length)];
    const sizeScale =
        SIZE_SCALES[Math.floor(draws.sizePick * SIZE_SCALES.length)];
    return [
        ...current,
        {
            id,
            defKey: def.key,
            slot,
            className:
                slot.side === 'left' ? classes.starLeft : classes.starRight,
            style: {
                '--star-top': `${slot.topPct + draws.topJitter}%`,
                '--star-clearance': `${tier.clearancePx}px`,
                '--star-slack': `${draws.gutterPick.toFixed(3)}`,
                '--star-width': `${Math.round(tier.starWidthPx * sizeScale)}px`,
                '--star-opacity': `${(0.36 + 0.64 * sizeScale).toFixed(2)}`,
                '--star-tilt': `${draws.tilt}deg`,
            } as CSSProperties,
            seed: draws.seed,
            phase: 'entering',
            lifetimeMs: draws.lifetimeMs,
        },
    ];
};

const HomepageStars: FC = () => {
    const reducedMotion = useReducedMotion();
    // JS is the single kill switch: CSS-hidden stars would never fire
    // animationend, stranding their slots forever.
    const wideFits = useMediaQuery(tierMediaQuery(WIDE_TIER), false);
    const compactFits = useMediaQuery(tierMediaQuery(COMPACT_TIER), false);
    const tier = wideFits ? WIDE_TIER : compactFits ? COMPACT_TIER : null;
    const disabled = reducedMotion || tier === null;

    const [stars, setStars] = useState<Star[]>([]);
    const nextId = useRef(0);
    const starTimers = useRef(new Map<number, number>());
    const startLeavingRef = useRef<(id: number) => void>(() => {});
    const removeStarRef = useRef<(id: number) => void>(() => {});

    const setTimer = useCallback(
        (id: number, delayMs: number, run: () => void) => {
            const timers = starTimers.current;
            const existing = timers.get(id);
            if (existing !== undefined) window.clearTimeout(existing);
            timers.set(
                id,
                window.setTimeout(() => {
                    timers.delete(id);
                    run();
                }, delayMs),
            );
        },
        [],
    );

    const clearTimer = useCallback((id: number) => {
        const timers = starTimers.current;
        const timer = timers.get(id);
        if (timer !== undefined) {
            window.clearTimeout(timer);
            timers.delete(id);
        }
    }, []);

    // Declines to plant a replacement once the sky is gated off mid-flight.
    const appendIfFits = useCallback(
        (
            current: Star[],
            id: number,
            draws: StarDraws,
            side: 'left' | 'right',
        ) => (tier ? appendStar(current, id, draws, side, tier) : current),
        [tier],
    );

    const removeStar = useCallback(
        (id: number) => {
            clearTimer(id);
            // Backstop draw: startLeaving usually plants the replacement, but
            // it can be declined when every slot or def is taken.
            const draws = drawStar();
            const replacementId = nextId.current++;
            setStars((current) => {
                if (!current.some((star) => star.id === id)) return current;
                const next = current.filter((star) => star.id !== id);
                if (next.length === 0) return next;
                const emptySide = emptySideOf(next);
                if (!emptySide) return next;
                return appendIfFits(next, replacementId, draws, emptySide);
            });
        },
        [clearTimer, appendIfFits],
    );

    const startLeaving = useCallback(
        (id: number) => {
            // Pre-draw a replacement in case this star's exit empties a side.
            const draws = drawStar();
            const replacementId = nextId.current++;
            setStars((current) => {
                if (
                    !current.some(
                        (star) => star.id === id && star.phase !== 'leaving',
                    )
                ) {
                    return current;
                }
                const next = current.map((star) =>
                    star.id === id
                        ? { ...star, phase: 'leaving' as const }
                        : star,
                );
                const emptySide = emptySideOf(next);
                if (!emptySide) return next;
                // The replacement fades in while this star fades out, so the
                // side is never visually empty.
                return appendIfFits(next, replacementId, draws, emptySide);
            });
            // Belt-and-braces: if animationend never fires (hidden tab, HMR)
            // the star is removed anyway. No-op for an id already gone.
            setTimer(id, LEAVE_MS + 300, () => removeStarRef.current(id));
        },
        [setTimer, appendIfFits],
    );

    // Lifetime timers are armed from state, so an id the updaters declined to
    // add (cap reached, no free slot) never gets a timer — and never starts a
    // timer chain of its own.
    useEffect(() => {
        stars.forEach((star) => {
            if (star.phase === 'leaving') return;
            if (starTimers.current.has(star.id)) return;
            setTimer(star.id, star.lifetimeMs, () =>
                startLeavingRef.current(star.id),
            );
        });
    }, [stars, setTimer]);

    useEffect(() => {
        removeStarRef.current = removeStar;
        startLeavingRef.current = startLeaving;
    }, [removeStar, startLeaving]);

    const settleStar = useCallback((id: number) => {
        setStars((current) =>
            current.some((star) => star.id === id && star.phase === 'entering')
                ? current.map((star) =>
                      star.id === id
                          ? { ...star, phase: 'settled' as const }
                          : star,
                  )
                : current,
        );
    }, []);

    useEffect(() => {
        // Also resets when the tier changes, so no star keeps a width and
        // gutter drawn for a viewport that no longer applies.
        setStars((current) => (current.length > 0 ? [] : current));
        if (disabled || !tier) return undefined;

        let cancelled = false;
        let spawnTimer: number;
        const pendingTimers = starTimers.current;

        const spawn = () => {
            if (cancelled) return;

            const firstDraws = drawStar();
            const firstId = nextId.current++;
            const secondDraws = drawStar();
            const secondId = nextId.current++;

            setStars((current) => {
                if (current.length === 0) {
                    // Start balanced: one star on each side.
                    const withLeft = appendStar(
                        current,
                        firstId,
                        firstDraws,
                        'left',
                        tier,
                    );
                    return appendStar(
                        withLeft,
                        secondId,
                        secondDraws,
                        'right',
                        tier,
                    );
                }
                return appendStar(
                    current,
                    firstId,
                    firstDraws,
                    emptySideOf(current),
                    tier,
                );
            });
            spawnTimer = window.setTimeout(spawn, randomBetween(450, 1400));
        };

        spawnTimer = window.setTimeout(spawn, 500);
        return () => {
            cancelled = true;
            window.clearTimeout(spawnTimer);
            pendingTimers.forEach((timer) => window.clearTimeout(timer));
            pendingTimers.clear();
        };
    }, [tier, disabled]);

    if (disabled) return null;

    return (
        <Box className={classes.sky} inert aria-hidden>
            {stars.map((star) => (
                <Box
                    key={star.id}
                    className={`${classes.star} ${star.className} ${phaseClass(
                        star.phase,
                    )}`}
                    style={star.style}
                    data-side={star.slot.side}
                    data-star-def={star.defKey}
                    data-star-phase={star.phase}
                    onAnimationEnd={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (star.phase === 'leaving') {
                            removeStar(star.id);
                        } else if (star.phase === 'entering') {
                            // Drop the animation so the settled card is
                            // painted, not resampled from a compositor layer.
                            settleStar(star.id);
                        }
                    }}
                >
                    {STAR_DEF_MAP.get(star.defKey)?.render(star.seed) ?? null}
                </Box>
            ))}
        </Box>
    );
};

export default HomepageStars;
