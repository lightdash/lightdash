import type { LearnCatalogueEntry, LearnEventInput } from '@lightdash/common';

// Pure derivations for the Learn section, ported from the Lightdash
// University academy so both surfaces order, group and lay out the catalogue
// identically. No DOM access — everything computes from catalogue entries,
// rollups and primitives.

export type CardState = 'open' | 'current' | 'done';

export type Rollup = {
    started: boolean;
    lessonsCompleted: Set<string>;
    bestScore: number | null;
    passed: boolean;
    completed: boolean;
};

export function emptyRollup(): Rollup {
    return {
        started: false,
        lessonsCompleted: new Set(),
        bestScore: null,
        passed: false,
        completed: false,
    };
}

export function rollupFromEvents(
    events: LearnEventInput[],
    courseId: string,
): Rollup {
    const rollup = emptyRollup();
    for (const ev of events) {
        if (ev.object.course !== courseId) continue;
        rollup.started = true;
        if (
            ev.verb === 'completed' &&
            ev.object.type === 'lesson' &&
            ev.object.lesson
        ) {
            rollup.lessonsCompleted.add(ev.object.lesson);
        }
        if (
            ev.object.type === 'quiz' &&
            (ev.verb === 'passed' || ev.verb === 'failed')
        ) {
            const score = ev.result?.score;
            if (
                typeof score === 'number' &&
                (rollup.bestScore === null || score > rollup.bestScore)
            ) {
                rollup.bestScore = score;
            }
            if (ev.verb === 'passed') rollup.passed = true;
        }
        if (ev.verb === 'completed' && ev.object.type === 'course') {
            rollup.completed = true;
        }
    }
    if (rollup.passed) rollup.completed = true;
    return rollup;
}

export function cardState(rollup: Rollup | undefined): CardState {
    if (!rollup) return 'open';
    if (rollup.completed || rollup.passed) return 'done';
    if (rollup.started) return 'current';
    return 'open';
}

export type PathName = 'analyst' | 'builder';

export type PathModel = {
    name: PathName;
    foundations: LearnCatalogueEntry[];
    courses: LearnCatalogueEntry[];
};

// The catalogue is contractually id-sorted; curriculum order is a rendering
// concern. Unknown ids append after ranked ones in catalogue order; ai's rank
// band > analyst's keeps ai course(s) last in the analyst path.
const CURRICULUM_RANK: Record<string, number> = {
    'viewer-fundamentals': 0,
    'metrics-and-dimensions': 1,
    'semantic-layer-essentials': 2,
    'exploring-data': 10,
    'building-charts': 11,
    'dashboards-and-sharing': 12,
    'advanced-analysis': 13,
    'ai-agents-essentials': 20,
    'metrics-as-code': 30,
    'advanced-modelling': 31,
    'governance-and-trust': 32,
};

function curriculumSort(
    entries: { entry: LearnCatalogueEntry; index: number }[],
): LearnCatalogueEntry[] {
    return entries
        .slice()
        .sort((a, b) => {
            const ra = CURRICULUM_RANK[a.entry.id] ?? 1000 + a.index;
            const rb = CURRICULUM_RANK[b.entry.id] ?? 1000 + b.index;
            return ra - rb || a.index - b.index;
        })
        .map((e) => e.entry);
}

export function pathsFromCatalogue(entries: LearnCatalogueEntry[]): {
    analyst: PathModel;
    builder: PathModel;
} {
    const foundations: { entry: LearnCatalogueEntry; index: number }[] = [];
    const analyst: { entry: LearnCatalogueEntry; index: number }[] = [];
    const builder: { entry: LearnCatalogueEntry; index: number }[] = [];
    entries.forEach((entry, index) => {
        if (entry.track === 'foundations') foundations.push({ entry, index });
        else if (entry.track === 'analyst' || entry.track === 'ai') {
            analyst.push({ entry, index });
        } else if (entry.track === 'builder') builder.push({ entry, index });
    });
    const sharedFoundations = curriculumSort(foundations);
    return {
        analyst: {
            name: 'analyst',
            foundations: sharedFoundations,
            courses: curriculumSort(analyst),
        },
        builder: {
            name: 'builder',
            foundations: sharedFoundations,
            courses: curriculumSort(builder),
        },
    };
}

export type PathProgress = {
    completed: number;
    total: number;
    pct: number;
};

export function pathProgress(
    path: PathModel,
    rollups: Map<string, Rollup>,
): PathProgress {
    const all = [...path.foundations, ...path.courses];
    const total = all.length;
    const completed = all.filter(
        (e) => cardState(rollups.get(e.id)) === 'done',
    ).length;
    return {
        completed,
        total,
        pct: total === 0 ? 0 : Math.round((completed / total) * 100),
    };
}

export type BadgeState = {
    id: string;
    name: string;
    earned: boolean;
    threshold: number;
    remaining: number;
};

export function badgeStates(
    path: PathModel,
    rollups: Map<string, Rollup>,
): BadgeState[] {
    const done = (e: LearnCatalogueEntry): boolean =>
        cardState(rollups.get(e.id)) === 'done';
    const { completed, total } = pathProgress(path, rollups);
    const pathTitle = path.name === 'analyst' ? 'Analyst' : 'Builder';
    const badges: BadgeState[] = [
        {
            id: 'first-steps',
            name: 'First steps',
            threshold: 1,
            earned: completed >= 1,
            remaining: Math.max(0, 1 - completed),
        },
    ];
    if (path.foundations.length > 0) {
        const foundationsLeft = path.foundations.filter((e) => !done(e)).length;
        badges.push({
            id: 'fundamentals',
            name: 'Fundamentals',
            threshold: path.foundations.length,
            earned: foundationsLeft === 0,
            remaining: foundationsLeft,
        });
    }
    const pathThreshold = Math.round((total * 2) / 3);
    badges.push({
        id: 'path',
        name: pathTitle,
        threshold: pathThreshold,
        earned: completed >= pathThreshold,
        remaining: Math.max(0, pathThreshold - completed),
    });
    badges.push({
        id: 'certified',
        name: `Certified ${pathTitle}`,
        threshold: total,
        earned: completed === total && total > 0,
        remaining: total - completed,
    });
    return badges;
}

const STOPWORDS = new Set([
    'a',
    'an',
    'the',
    'i',
    'my',
    'do',
    'how',
    'for',
    'to',
    'in',
    'of',
    'and',
    'need',
    'want',
    'with',
    'make',
    'give',
    'better',
    'more',
]);

function words(text: string): string[] {
    return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

export function askMatch(
    query: string,
    entries: LearnCatalogueEntry[],
): LearnCatalogueEntry | null {
    const tokens = words(query).filter(
        (t) => t.length >= 2 && !STOPWORDS.has(t),
    );
    if (tokens.length === 0) return null;
    const hits = (t: string, ws: string[]): boolean =>
        ws.some((w) => w === t || w.startsWith(t));
    let best: LearnCatalogueEntry | null = null;
    let bestScore = 0;
    for (const entry of entries) {
        const titleWords = words(entry.title);
        const tagWords = entry.tags.map(words);
        const descWords = words(entry.description);
        let score = 0;
        for (const t of tokens) {
            if (hits(t, titleWords)) score += 3;
            if (tagWords.some((ws) => hits(t, ws))) score += 2;
            if (hits(t, descWords)) score += 1;
        }
        if (score > bestScore) {
            bestScore = score;
            best = entry;
        }
    }
    return bestScore > 0 ? best : null;
}

export function resumeTarget(
    entries: LearnCatalogueEntry[],
    rollups: Map<string, Rollup>,
    lastCourseId: string | null,
): LearnCatalogueEntry | null {
    if (lastCourseId) {
        const last = entries.find((e) => e.id === lastCourseId);
        if (last && cardState(rollups.get(last.id)) === 'current') return last;
    }
    const current = entries.find(
        (e) => cardState(rollups.get(e.id)) === 'current',
    );
    if (current) return current;
    const hasProgress = entries.some(
        (e) => cardState(rollups.get(e.id)) !== 'open',
    );
    if (!hasProgress) return null;
    return entries.find((e) => cardState(rollups.get(e.id)) === 'open') ?? null;
}

// Graph layout: rank-per-column — the root foundation sits alone in column 0,
// remaining foundations fill the next column(s), then path courses pack up to
// MAX_ROWS per column, so prerequisite depth reads strictly left → right on a
// short canvas that scrolls horizontally. Short columns centre vertically.
export const CARD_W = 230;
export const CARD_H = 96;
const ROW_H = 150;
const COL_PITCH = 300;
const MAX_ROWS = 3;
const HEADER_H = 44;
export const PAD = 24;

export type GraphNode = {
    entry: LearnCatalogueEntry;
    x: number;
    y: number;
};

export type GraphEdge = {
    from: string;
    to: string;
};

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size)
        out.push(items.slice(i, i + size));
    return out;
}

export function graphLayout(path: PathModel): {
    nodes: GraphNode[];
    edges: GraphEdge[];
    width: number;
    height: number;
    pathLeft: number;
} {
    const F = path.foundations;
    const P = path.courses;
    const columns: LearnCatalogueEntry[][] = [];
    if (F.length > 0) {
        columns.push([F[0]]);
        if (F.length > 1) columns.push(...chunk(F.slice(1), MAX_ROWS));
    }
    const firstPathCol = columns.length;
    columns.push(...chunk(P, MAX_ROWS));
    const rows = Math.max(1, ...columns.map((c) => c.length));
    const nodes: GraphNode[] = [];
    columns.forEach((col, c) => {
        const top = HEADER_H + Math.round(((rows - col.length) * ROW_H) / 2);
        col.forEach((entry, r) =>
            nodes.push({ entry, x: PAD + c * COL_PITCH, y: top + r * ROW_H }),
        );
    });
    // Card i in a column hangs off card min(i, last) of the previous column:
    // every card gets exactly one incoming edge and no edge ever points left.
    const edges: GraphEdge[] = [];
    for (let c = 0; c + 1 < columns.length; c += 1) {
        const a = columns[c];
        const b = columns[c + 1];
        b.forEach((entry, i) =>
            edges.push({
                from: a[Math.min(i, a.length - 1)].id,
                to: entry.id,
            }),
        );
    }
    const cols = Math.max(1, columns.length);
    const width = PAD + (cols - 1) * COL_PITCH + CARD_W + PAD;
    const height = HEADER_H + (rows - 1) * ROW_H + CARD_H + PAD;
    return {
        nodes,
        edges,
        width,
        height,
        pathLeft: PAD + firstPathCol * COL_PITCH,
    };
}
