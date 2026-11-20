// What the app knows about people, teams and how they are drawn. Pure functions only.

export type Recency = 'd7' | 'd30' | 'older' | 'never';
export type RoleKind = 'admin' | 'editor' | 'interactiveViewer' | 'viewer';
export type UsageKind = 'most' | 'some' | 'left' | 'never';
export type ColourBy = 'usage' | 'activity' | 'role' | 'growth';
// Features: one step for each number of parts used, 'f8' the most and 'f0' none
export type FeatureStep = 'f0' | 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6' | 'f7' | 'f8';
// Recency: how long ago someone was last active, in ten-day steps from 'a0' (the last ten days) to 'a9' (ninety or more)
export type AgeStep = 'a0' | 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6' | 'a7' | 'a8' | 'a9';
// Growth: what happened to someone between the four weeks before and the last four weeks
export type FlowKind = 'stayed' | 'new' | 'back' | 'dropped' | 'lapsed' | 'never';
export type MarkKind = UsageKind | Recency | RoleKind | FeatureStep | AgeStep | FlowKind;

// The parts of Lightdash the data can tell apart. A person's `parts` number has one bit per part, in this order.
export const PARTS = [
    { key: 'dashboards', label: 'Dashboards', hint: 'Opened a dashboard' },
    { key: 'charts', label: 'Charts', hint: 'Opened a saved chart' },
    {
        key: 'exploring',
        label: 'Exploring data',
        hint: 'Ran their own query in an explore, the metrics explorer or the SQL runner',
    },
    { key: 'ai', label: 'AI agents', hint: 'Asked an AI agent a question' },
    { key: 'mcp', label: 'MCP', hint: 'Used MCP from an AI tool' },
    { key: 'apps', label: 'Viewing apps', hint: 'Opened a data app' },
    { key: 'building', label: 'Building apps', hint: 'Created or changed a data app' },
    { key: 'downloads', label: 'Downloads', hint: 'Downloaded results' },
] as const;

export const PART_COUNT = PARTS.length;
// Using this many parts or more in the last 30 days is "uses most of it"
export const MOST_THRESHOLD = 5;

export const USAGE_RULE = `In the last 30 days: someone who used ${MOST_THRESHOLD} or more of the ${PART_COUNT} tracked features used most of them. People with prior activity may have gone inactive. No recorded activity means none was found in the available history.`;

export const ACTIVE_RULE =
    'Using the app, AI agents and MCP count as activity. API calls, the CLI and scheduled deliveries do not.';

export type Person = {
    id: string;
    name: string;
    // ISO day of their last activity, or null
    lastActive: string | null;
    activeDays: number;
};

// One person, or a count of people who share groups, role, recency and parts
export type Cell = {
    groupIds: string[];
    groupNames: string[];
    role: RoleKind;
    recency: Recency;
    // Ten-day steps since last active, 0 to 9 (9 is ninety days or more); null when never
    seenBin: number | null;
    parts: number;
    flow: FlowKind;
    count: number;
    person: Person | null;
};

// `memberIds` are people an admin added by name, on top of everyone in the team's groups
export type Team = { id: string; name: string; groupIds: string[]; memberIds?: string[] };

// Saved for every viewer. `teams: null` means no team has been made yet.
export type TeamConfig = {
    teams: Team[] | null;
    // Person id to the one team they are drawn in
    primary: Record<string, string>;
};

export const DEFAULT_TEAM_CONFIG: TeamConfig = { teams: null, primary: {} };
export const NO_TEAM_ID = 'no-team';

export type GroupInfo = { id: string; name: string; people: number };

export type TeamItem = { cell: Cell; shared: boolean };
export type TeamBucket = {
    team: Team;
    isNoTeam: boolean;
    items: TeamItem[];
    people: number;
};

export type Organisation = {
    buckets: TeamBucket[];
    groups: GroupInfo[];
    // Everyone, each counted once
    cells: Cell[];
    total: number;
    // People drawn in more than one team
    sharedPeople: number;
};

export const popcount = (value: number): number => {
    let bits = 0;
    for (let rest = value; rest > 0; rest >>= 1) bits += rest & 1;
    return bits;
};

export const hasPart = (parts: number, index: number): boolean =>
    ((parts >> index) & 1) === 1;

export const usageOf = (cell: Pick<Cell, 'recency' | 'parts'>): UsageKind => {
    if (cell.recency === 'never') return 'never';
    if (cell.recency === 'older') return 'left';
    return popcount(cell.parts) >= MOST_THRESHOLD ? 'most' : 'some';
};

// How many parts of Lightdash someone used in the last 30 days, as a step; people who were not active in them used none
export const featureStepOf = (cell: Pick<Cell, 'recency' | 'parts'>): FeatureStep =>
    cell.recency === 'never' || cell.recency === 'older'
        ? 'f0'
        : (`f${Math.min(popcount(cell.parts), PART_COUNT)}` as FeatureStep);

export const ageStepOf = (cell: Pick<Cell, 'seenBin'>): AgeStep | 'never' =>
    cell.seenBin === null ? 'never' : (`a${Math.min(Math.max(cell.seenBin, 0), 9)}` as AgeStep);

export const kindOf = (cell: Cell, colourBy: ColourBy): MarkKind => {
    if (colourBy === 'usage') return featureStepOf(cell);
    if (colourBy === 'activity') return ageStepOf(cell);
    if (colourBy === 'growth') return cell.flow;
    return cell.role;
};

const FEATURE_STEPS: FeatureStep[] = ['f8', 'f7', 'f6', 'f5', 'f4', 'f3', 'f2', 'f1', 'f0'];
const AGE_STEPS: AgeStep[] = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9'];

// Legend order, which is also the order marks are laid out: from the centre of a circle, and from the top left of a block
export const KIND_ORDER: Record<ColourBy, MarkKind[]> = {
    usage: FEATURE_STEPS,
    activity: [...AGE_STEPS, 'never'],
    role: ['admin', 'editor', 'interactiveViewer', 'viewer'],
    growth: ['stayed', 'new', 'back', 'dropped', 'lapsed', 'never'],
};

// The days past which someone counts as gone quiet, the end of the recency scale
export const AGE_LIMIT_DAYS = 90;

export const KIND_LABELS: Record<ColourBy, Record<string, string>> = {
    usage: Object.fromEntries(
        FEATURE_STEPS.map((step) => {
            const used = Number(step.slice(1));
            return [step, used === 0 ? 'No features' : used === 1 ? '1 feature' : `${used} features`];
        }),
    ),
    activity: {
        ...Object.fromEntries(
            AGE_STEPS.map((step, index) => [
                step,
                index === AGE_STEPS.length - 1 ? `${AGE_LIMIT_DAYS} or more days ago` : `${index * 10}–${index * 10 + 9} days ago`,
            ]),
        ),
        never: 'No recorded activity',
    },
    role: {
        admin: 'Admin',
        editor: 'Editor',
        interactiveViewer: 'Interactive viewer',
        viewer: 'Viewer',
    },
    growth: { stayed: 'Stayed', new: 'New', back: 'Returned', dropped: 'Dropped', lapsed: 'Lapsed', never: 'No recorded activity' },
};

export const COLOUR_BY_LABELS: Record<ColourBy, string> = {
    usage: 'Features',
    activity: 'Recency',
    role: 'Role',
    growth: 'Growth',
};

// The same look can mean two things ("never" in usage and in activity), so CSS keys on the colouring too
export const markAttr = (colourBy: ColourBy, kind: MarkKind): string =>
    `${colourBy}-${kind}`;

export const toRoleKind = (role: string | null | undefined): RoleKind => {
    switch (role) {
        case 'admin':
            return 'admin';
        case 'editor':
        case 'developer':
            return 'editor';
        case 'interactive_viewer':
            return 'interactiveViewer';
        default:
            return 'viewer';
    }
};

export const sumCounts = (cells: { count: number }[]): number =>
    cells.reduce((sum, cell) => sum + cell.count, 0);

export const getGroups = (cells: Cell[]): GroupInfo[] => {
    const groups = new Map<string, GroupInfo>();
    cells.forEach((cell) => {
        cell.groupIds.forEach((id, index) => {
            const known = groups.get(id);
            if (known) known.people += cell.count;
            else
                groups.set(id, {
                    id,
                    name: cell.groupNames[index] ?? 'Unnamed group',
                    people: cell.count,
                });
        });
    });
    return [...groups.values()].sort(
        (a, b) => b.people - a.people || a.name.localeCompare(b.name),
    );
};

// Until an admin makes teams there are none, so everyone is in "No team"
export const resolveTeams = (config: TeamConfig): Team[] => config.teams ?? [];

// Puts everyone in the teams their groups map to. A person in several teams is in each of them unless a primary
// team is set for them; a person in none is in "No team". Totals count each person once.
export const buildOrganisation = (
    cells: Cell[],
    config: TeamConfig,
): Organisation => {
    const groups = getGroups(cells);
    const teams = resolveTeams(config);
    const teamsByGroup = new Map<string, Team[]>();
    teams.forEach((team) =>
        team.groupIds.forEach((groupId) => {
            const list = teamsByGroup.get(groupId);
            if (list) list.push(team);
            else teamsByGroup.set(groupId, [team]);
        }),
    );
    const teamsByMember = new Map<string, Team[]>();
    teams.forEach((team) =>
        team.memberIds?.forEach((personId) => {
            const list = teamsByMember.get(personId);
            if (list) list.push(team);
            else teamsByMember.set(personId, [team]);
        }),
    );
    const buckets = new Map<string, TeamBucket>(
        teams.map((team) => [
            team.id,
            { team, isNoTeam: false, items: [], people: 0 },
        ]),
    );
    const noTeam: TeamBucket = {
        team: { id: NO_TEAM_ID, name: 'No team', groupIds: [] },
        isNoTeam: true,
        items: [],
        people: 0,
    };
    let sharedPeople = 0;
    cells.forEach((cell) => {
        const found = new Set<Team>();
        cell.groupIds.forEach((groupId) =>
            teamsByGroup.get(groupId)?.forEach((team) => found.add(team)),
        );
        if (cell.person) teamsByMember.get(cell.person.id)?.forEach((team) => found.add(team));
        let mine = [...found];
        const primary = cell.person ? config.primary[cell.person.id] : undefined;
        if (primary && mine.some((team) => team.id === primary)) {
            mine = mine.filter((team) => team.id === primary);
        }
        if (mine.length === 0) {
            noTeam.items.push({ cell, shared: false });
            noTeam.people += cell.count;
            return;
        }
        if (mine.length > 1) sharedPeople += cell.count;
        mine.forEach((team) => {
            const bucket = buckets.get(team.id);
            if (!bucket) return;
            bucket.items.push({ cell, shared: mine.length > 1 });
            bucket.people += cell.count;
        });
    });
    const ordered = [...buckets.values()].sort(
        (a, b) =>
            b.people - a.people || a.team.name.localeCompare(b.team.name),
    );
    return {
        buckets: noTeam.people > 0 ? [...ordered, noTeam] : ordered,
        groups,
        cells,
        total: sumCounts(cells),
        sharedPeople,
    };
};

export const countByKind = (
    cells: Cell[],
    colourBy: ColourBy,
): Map<MarkKind, number> => {
    const counts = new Map<MarkKind, number>();
    cells.forEach((cell) => {
        const kind = kindOf(cell, colourBy);
        counts.set(kind, (counts.get(kind) ?? 0) + cell.count);
    });
    return counts;
};

export const bucketCells = (bucket: TeamBucket): Cell[] =>
    bucket.items.map((item) => item.cell);

// How many people in these cells used each part in the last 30 days
export const countByPart = (cells: Cell[]): number[] =>
    PARTS.map((_, index) =>
        cells.reduce(
            (sum, cell) => sum + (hasPart(cell.parts, index) ? cell.count : 0),
            0,
        ),
    );

export const countActive = (cells: Cell[]): number =>
    cells.reduce(
        (sum, cell) =>
            sum +
            (cell.recency === 'd7' || cell.recency === 'd30' ? cell.count : 0),
        0,
    );

// Names are shown, and one mark is one named person, up to this many people in view
export const NAMED_PEOPLE_LIMIT = 150;
// Above this many people in view one mark stands for several, so the drawing stays quick and readable
const MAX_MARKS = 1200;
const NICE_UNITS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

export const getMarkUnit = (peopleInView: number): number =>
    NICE_UNITS.find((unit) => peopleInView / unit <= MAX_MARKS) ??
    Math.ceil(peopleInView / MAX_MARKS);

export type Mark = {
    kind: MarkKind;
    // Set when the mark is one named person
    person: Person | null;
    // The person is drawn in another team too
    shared: boolean;
};

// Whole marks from counts that keep the total honest: each kind rounded down, and the marks left over go to the
// kinds that lost the most
const apportion = (counts: number[], unit: number): number[] => {
    const total = counts.reduce((sum, count) => sum + count, 0);
    if (total === 0) return counts.map(() => 0);
    const target = Math.max(Math.round(total / unit), 1);
    const shares = counts.map((count) => count / unit);
    const whole = shares.map((share) => Math.floor(share));
    const left = target - whole.reduce((sum, value) => sum + value, 0);
    shares
        .map((share, index) => ({ index, lost: share - whole[index] }))
        .sort((a, b) => b.lost - a.lost || a.index - b.index)
        .slice(0, Math.max(left, 0))
        .forEach(({ index }) => {
            whole[index] += 1;
        });
    return whole;
};

// A team's marks for a colouring, in legend order. With a unit of one every person has a mark of their own.
export const buildMarks = (
    bucket: TeamBucket,
    colourBy: ColourBy,
    unit: number,
): Mark[] => {
    const order = KIND_ORDER[colourBy];
    if (unit <= 1) {
        const marks: Mark[] = [];
        bucket.items.forEach(({ cell, shared }) => {
            const kind = kindOf(cell, colourBy);
            for (let index = 0; index < cell.count; index += 1) {
                marks.push({ kind, person: cell.person, shared });
            }
        });
        return marks.sort(
            (a, b) =>
                order.indexOf(a.kind) - order.indexOf(b.kind) ||
                Number(a.shared) - Number(b.shared) ||
                (a.person?.name ?? '').localeCompare(b.person?.name ?? ''),
        );
    }
    const counts = countByKind(bucketCells(bucket), colourBy);
    const marks = apportion(
        order.map((kind) => counts.get(kind) ?? 0),
        unit,
    );
    return order.flatMap((kind, index) =>
        Array.from({ length: marks[index] }, () => ({
            kind,
            person: null,
            shared: false,
        })),
    );
};

// The two periods Growth compares, in days: the last four weeks and the four weeks before them
export const FLOW_PERIOD_DAYS = 28;

// What each Growth state means, shown on hovering it in the legend
export const GROWTH_HINTS: Record<FlowKind, string> = {
    stayed: 'Active in the last four weeks and in the four weeks before.',
    new: 'Active in the last four weeks for the first time.',
    back: 'Active in the last four weeks and at some time earlier, but not in the four weeks before.',
    dropped: 'Active in the four weeks before, but not in the last four weeks.',
    lapsed: 'Active at some time, but not in the last eight weeks.',
    never: 'No recorded activity.',
};

// From three yes-or-no answers as bits: 1 active in the last four weeks, 2 in the four before, 4 at any time earlier
export const flowOf = (bits: number): FlowKind => {
    const now = (bits & 1) !== 0;
    const previous = (bits & 2) !== 0;
    if (now && previous) return 'stayed';
    if (now) return (bits & 4) !== 0 ? 'back' : 'new';
    if (previous) return 'dropped';
    return (bits & 4) !== 0 ? 'lapsed' : 'never';
};

export type FlowSummary = {
    people: number;
    counts: Record<FlowKind, number>;
    gained: number;
    lost: number;
    net: number;
    // People gained for each one lost; null when nobody was lost
    ratio: number | null;
};

export const summariseFlow = (cells: Cell[]): FlowSummary => {
    const counts: Record<FlowKind, number> = { stayed: 0, new: 0, back: 0, dropped: 0, lapsed: 0, never: 0 };
    cells.forEach((cell) => {
        counts[cell.flow] += cell.count;
    });
    const gained = counts.new + counts.back;
    const lost = counts.dropped;
    return { people: sumCounts(cells), counts, gained, lost, net: gained - lost, ratio: lost > 0 ? gained / lost : null };
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// An ISO day as it was written ("2025-03-17" gives "17 Mar 2025"), with no time zone applied
export const formatDay = (day: string | null): string => {
    if (day === null) return 'No activity';
    const [year, month, date] = day.slice(0, 10).split('-').map(Number);
    return month >= 1 && month <= 12 && date >= 1 ? `${date} ${MONTHS[month - 1]} ${year}` : day;
};

// How long ago an ISO day was, in plain words: "Today", "Yesterday", "12 days ago", or "Never" for no day
export const formatDaysAgo = (day: string | null, now: Date = new Date()): string => {
    if (day === null) return 'No activity';
    const then = Date.parse(`${day.slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(then)) return day;
    const days = Math.max(Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - then) / 86_400_000), 0);
    return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${formatCount(days)} days ago`;
};

export const formatCount = (value: number): string =>
    value.toLocaleString('en-GB');

export const formatPeople = (value: number): string =>
    value === 1 ? '1 person' : `${formatCount(value)} people`;

export const formatShare = (part: number, whole: number): string =>
    whole <= 0 ? '0%' : `${Math.round((part / whole) * 100)}%`;
