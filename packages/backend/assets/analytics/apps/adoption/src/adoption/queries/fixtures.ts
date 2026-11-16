import { type Cell, type FlowKind, type Recency, type RoleKind, type Team, type TeamConfig } from '../model';

// Invented organisations for local development and screenshots. Nothing here comes from a real instance.

const mulberry32 = (seed: number) => {
    let state = seed;
    return () => {
        state += 0x6d2b79f5;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

const FIRST = ['Ada', 'Bram', 'Cleo', 'Dov', 'Esme', 'Finn', 'Gita', 'Hugo', 'Ines', 'Jory', 'Kaia', 'Lev', 'Mika', 'Nell', 'Otis', 'Pia', 'Quin', 'Rhea', 'Sol', 'Tove', 'Uma', 'Vik', 'Wren', 'Xan', 'Yara', 'Zeb'];
const LAST = ['Alder', 'Birch', 'Cedar', 'Dune', 'Elm', 'Fenn', 'Gorse', 'Heath', 'Iris', 'Juniper', 'Kelp', 'Larch', 'Moss', 'Nettle', 'Oak', 'Pine', 'Quill', 'Reed', 'Sedge', 'Thorn', 'Umber', 'Vale', 'Wold', 'Yew'];

// How a team behaves: the share that never came, the share that left, and how many parts the rest use
type Profile = { never: number; left: number; depth: number };
const PROFILES: Record<string, Profile> = {
    strong: { never: 0.05, left: 0.03, depth: 0.85 },
    steady: { never: 0.15, left: 0.08, depth: 0.6 },
    shallow: { never: 0.2, left: 0.1, depth: 0.25 },
    lapsed: { never: 0.15, left: 0.55, depth: 0.4 },
    dormant: { never: 0.8, left: 0.1, depth: 0.2 },
};

type TeamSpec = { name: string; share: number; profile: keyof typeof PROFILES };

const TEAMS: Record<string, TeamSpec[]> = {
    small: [
        { name: 'Harbour desk', share: 0.4, profile: 'strong' },
        { name: 'Lantern studio', share: 0.3, profile: 'shallow' },
        { name: 'Orchard crew', share: 0.2, profile: 'dormant' },
    ],
    medium: [
        { name: 'Harbour desk', share: 0.2, profile: 'strong' },
        { name: 'Lantern studio', share: 0.16, profile: 'steady' },
        { name: 'Orchard crew', share: 0.14, profile: 'shallow' },
        { name: 'Quarry works', share: 0.12, profile: 'lapsed' },
        { name: 'Tidal lab', share: 0.1, profile: 'strong' },
        { name: 'Meadow office', share: 0.1, profile: 'dormant' },
        { name: 'Kiln room', share: 0.06, profile: 'steady' },
        { name: 'Signal hut', share: 0.04, profile: 'shallow' },
    ],
    large: [
        { name: 'Harbour desk', share: 0.16, profile: 'steady' },
        { name: 'Lantern studio', share: 0.13, profile: 'strong' },
        { name: 'Orchard crew', share: 0.11, profile: 'shallow' },
        { name: 'Quarry works', share: 0.1, profile: 'dormant' },
        { name: 'Tidal lab', share: 0.08, profile: 'strong' },
        { name: 'Meadow office', share: 0.07, profile: 'lapsed' },
        { name: 'Kiln room', share: 0.06, profile: 'steady' },
        { name: 'Signal hut', share: 0.05, profile: 'shallow' },
        { name: 'Copper yard', share: 0.045, profile: 'steady' },
        { name: 'Glasshouse', share: 0.04, profile: 'dormant' },
        { name: 'Ferry point', share: 0.035, profile: 'strong' },
        { name: 'Mill race', share: 0.03, profile: 'shallow' },
        { name: 'Salt store', share: 0.025, profile: 'lapsed' },
        { name: 'Beacon post', share: 0.02, profile: 'steady' },
        { name: 'Loom shed', share: 0.015, profile: 'dormant' },
        { name: 'Weir cabin', share: 0.01, profile: 'strong' },
        { name: 'Tack room', share: 0.006, profile: 'shallow' },
        { name: 'Bell loft', share: 0.002, profile: 'steady' },
    ],
};

// A steady pick between 0 and 1 from some text, so invented growth does not disturb the other invented values
const pick = (text: string): number => {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 10_000) / 10_000;
};

// Each team gains new people and wins people back at its own rate
const pickFlow = (id: string, team: string, recency: Recency, daysAgo: number | null): FlowKind => {
    if (recency === 'never' || daysAgo === null) return 'never';
    if (recency === 'older') return daysAgo <= 56 ? 'dropped' : 'lapsed';
    const fresh = 0.04 + pick(`${team}:new`) * 0.3;
    const back = 0.02 + pick(`${team}:back`) * 0.14;
    const roll = pick(`${id}:flow`);
    return roll < fresh ? 'new' : roll < fresh + back ? 'back' : 'stayed';
};

const SIZES: Record<string, number> = { small: 15, medium: 100, large: 2000 };

export const FIXTURE_NAMES = Object.keys(SIZES);

const isoDay = (daysAgo: number): string => {
    const day = new Date(Date.UTC(2026, 9, 30));
    day.setUTCDate(day.getUTCDate() - daysAgo);
    return day.toISOString().slice(0, 10);
};

const pickRole = (roll: number): RoleKind =>
    roll < 0.06 ? 'admin' : roll < 0.3 ? 'editor' : roll < 0.6 ? 'interactiveViewer' : 'viewer';

// Viewers cannot build or explore, so their parts are drawn from fewer of them
const PART_WEIGHTS = [0.95, 0.85, 0.6, 0.55, 0.3, 0.7, 0.35, 0.3];

export const buildFixturePeople = (name: string): Cell[] => {
    const specs = TEAMS[name] ?? TEAMS.medium;
    const size = SIZES[name] ?? SIZES.medium;
    const random = mulberry32(size * 7919 + 17);
    const groupId = (index: number) => `fixture-group-${index + 1}`;
    const people: Cell[] = [];
    const teamFor = (roll: number): number => {
        let edge = 0;
        for (let index = 0; index < specs.length; index += 1) {
            edge += specs[index].share;
            if (roll < edge) return index;
        }
        return -1;
    };
    for (let index = 0; index < size; index += 1) {
        const team = teamFor(random());
        const groups = team < 0 ? [] : [team];
        // About one in twelve people is in a second team too
        if (team >= 0 && random() < 0.08) {
            const other = Math.floor(random() * specs.length);
            if (other !== team) groups.push(other);
        }
        groups.sort((a, b) => a - b);
        const profile = PROFILES[team < 0 ? 'shallow' : specs[team].profile];
        const role = pickRole(random());
        const roll = random();
        let recency: Recency;
        let parts = 0;
        let daysAgo: number | null = null;
        if (roll < profile.never) {
            recency = 'never';
        } else if (roll < profile.never + profile.left) {
            recency = 'older';
            daysAgo = 31 + Math.floor(random() * 80);
        } else {
            recency = random() < 0.78 ? 'd7' : 'd30';
            daysAgo = recency === 'd7' ? Math.floor(random() * 7) : 7 + Math.floor(random() * 23);
            PART_WEIGHTS.forEach((weight, part) => {
                const limited = role === 'viewer' && (part === 2 || part === 6);
                const chance = Math.min(weight * (0.35 + profile.depth), 0.97);
                if (!limited && random() < chance) parts |= 1 << part;
            });
            if (parts === 0) parts = 1;
        }
        const first = FIRST[Math.floor(random() * FIRST.length)];
        const last = LAST[Math.floor(random() * LAST.length)];
        people.push({
            groupIds: groups.map(groupId),
            groupNames: groups.map((group) => specs[group].name),
            role,
            recency,
            seenBin: daysAgo === null ? null : Math.min(Math.floor(daysAgo / 10), 9),
            parts,
            flow: pickFlow(`fixture-person-${index + 1}`, team < 0 ? 'none' : specs[team].name, recency, daysAgo),
            count: 1,
            person: {
                id: `fixture-person-${index + 1}`,
                name: `${first} ${last}`,
                lastActive: daysAgo === null ? null : isoDay(daysAgo),
                activeDays:
                    recency === 'never' || recency === 'older'
                        ? 0
                        : 1 + Math.floor(random() * (recency === 'd7' ? 20 : 5)),
            },
        });
    }
    return people;
};

// Teams for an invented organisation, so a fixture opens with its views filled: one team for each group, the last
// groups joined in pairs (one pair for medium, two for large), and the first few people who are in two teams shown in
// one of them only. Used in local development only; the live app starts from whatever is saved.
export const buildFixtureTeams = (name: string): TeamConfig => {
    const specs = TEAMS[name] ?? TEAMS.medium;
    const pairs = specs.length >= 20 ? 2 : specs.length >= 6 ? 1 : 0;
    const single = specs.length - pairs * 2;
    const teams: Team[] = specs.slice(0, single).map((spec, index) => ({
        id: `fixture-team-${index + 1}`,
        name: spec.name,
        groupIds: [`fixture-group-${index + 1}`],
    }));
    for (let pair = 0; pair < pairs; pair += 1) {
        const first = single + pair * 2;
        teams.push({
            id: `fixture-team-${first + 1}`,
            name: `${specs[first].name} and ${specs[first + 1].name.toLowerCase()}`,
            groupIds: [`fixture-group-${first + 1}`, `fixture-group-${first + 2}`],
        });
    }
    const teamOf = new Map(teams.flatMap((team) => team.groupIds.map((groupId) => [groupId, team.id] as const)));
    const primary: Record<string, string> = {};
    buildFixturePeople(name)
        .filter((cell) => new Set(cell.groupIds.map((groupId) => teamOf.get(groupId))).size > 1)
        .slice(0, 3)
        .forEach((cell) => {
            const team = teamOf.get(cell.groupIds[0]);
            if (cell.person && team) primary[cell.person.id] = team;
        });
    return { teams, primary };
};

// The same people as counts, with no names, as the overview query gives them for a large organisation
export const toCounts = (people: Cell[]): Cell[] => {
    const counts = new Map<string, Cell>();
    people.forEach((cell) => {
        const key = [cell.groupIds.join(','), cell.role, cell.recency, cell.seenBin, cell.parts, cell.flow].join('|');
        const known = counts.get(key);
        if (known) known.count += 1;
        else counts.set(key, { ...cell, person: null, count: 1 });
    });
    return [...counts.values()];
};

const CONTENT = ['Weekly trading summary', 'Pipeline by region', 'Customer health', 'Support backlog', 'Product usage', 'Forecast against plan', 'Campaign results', 'Stock levels'];

export const buildFixtureContent = (people: number) =>
    CONTENT.slice(0, Math.min(CONTENT.length, Math.max(people, 1))).map((name, index) => ({
        name,
        type: index % 3 === 1 ? 'chart' : 'dashboard',
        viewers: Math.max(Math.round((people * (0.7 - index * 0.08)) / 1.6), 1),
        views: Math.max(Math.round(people * (9 - index)), 1),
    }));

export const buildFixtureWeeks = (active: number) =>
    Array.from({ length: 12 }, (_, index) => ({
        week: isoDay((11 - index) * 7),
        people: Math.max(Math.round(active * (0.55 + 0.04 * index + 0.06 * Math.sin(index * 1.7))), 0),
    }));
