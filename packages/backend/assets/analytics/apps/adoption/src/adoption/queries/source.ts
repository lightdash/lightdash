import { useLightdash, useLightdashClient } from '@lightdash/query-sdk';
import { useEffect, useMemo, useState } from 'react';
import { flowOf, toRoleKind, type Cell, type Recency, type TeamConfig } from '../model';
import {
    buildFixtureContent,
    buildFixturePeople,
    buildFixtureTeams,
    buildFixtureWeeks,
    FIXTURE_NAMES,
    toCounts,
} from './fixtures';
import {
    countsQuery,
    OVERVIEW_ROW_LIMIT,
    peopleQuery,
    PEOPLE_ROW_LIMIT,
    topContentQuery,
    totalQuery,
    weeklyActiveQuery,
    type PeopleFilter,
} from './queries';

export type { PeopleFilter };

export type Loadable<T> = {
    data: T;
    loading: boolean;
    error: string | null;
    // The query hit its row limit, so some people are missing
    truncated?: boolean;
    lineage?: Record<string, string | undefined>;
};

export type ContentItem = {
    name: string;
    type: string;
    viewers: number;
    views: number;
};
export type WeekPoint = { week: string; people: number };
export type Viewer = { isAdmin: boolean; loading: boolean };

export type AdoptionSource = {
    fixture: string | null;
    // Teams an invented organisation starts with; always null for the live app
    fixtureTeams: TeamConfig | null;
    useTotal: () => Loadable<number | null>;
    useCounts: (excludedUserIds: string[]) => Loadable<Cell[]>;
    usePeople: (filter: PeopleFilter) => Loadable<Cell[]>;
    useWeeklyActive: (userIds: string[]) => Loadable<WeekPoint[]>;
    useTopContent: (userIds: string[]) => Loadable<ContentItem[]>;
    useViewer: () => Viewer;
};

type Row = Record<string, string | number | boolean | null>;

const RECENCIES: Recency[] = ['d7', 'd30', 'older', 'never'];

const parseList = (value: unknown): string[] => {
    if (typeof value !== 'string' || value === '') return [];
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch {
        return [];
    }
};

const toNumber = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

// A step of ten days since last active ('never' and anything unreadable give null)
const toBin = (value: unknown): number | null => {
    const parsed = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN;
    return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), 0), 9) : null;
};

const toCell = (row: Row, withPerson: boolean): Cell => {
    const recency = RECENCIES.find((each) => each === row.last_seen) ?? 'never';
    const id = typeof row.user_id === 'string' ? row.user_id : null;
    return {
        groupIds: parseList(row.group_ids),
        groupNames: parseList(row.group_names),
        role: toRoleKind(
            typeof row.organization_role === 'string'
                ? row.organization_role
                : null,
        ),
        recency,
        seenBin: toBin(row.last_seen_bin),
        parts: toNumber(row.parts_used),
        flow: flowOf(toNumber(row.flow_bits)),
        count: withPerson ? 1 : toNumber(row.total_members),
        person:
            withPerson && id !== null
                ? {
                      id,
                      name:
                          typeof row.name === 'string' && row.name.trim() !== ''
                              ? row.name
                              : 'Unnamed person',
                      lastActive:
                          typeof row.last_seen_day === 'string'
                              ? row.last_seen_day
                              : null,
                      activeDays: toNumber(row.active_days_30d),
                  }
                : null,
    };
};

const message = (error: Error | null): string | null =>
    error === null ? null : error.message;

const liveSource: AdoptionSource = {
    fixture: null,
    fixtureTeams: null,
    useTotal: () => {
        const { data, loading, error, lineage } = useLightdash(totalQuery);
        return {
            data: data.length > 0 ? toNumber(data[0].total_members) : null,
            loading,
            error: message(error),
            lineage,
        };
    },
    useCounts: (excludedUserIds) => {
        const built = useMemo(
            () => countsQuery(excludedUserIds),
            [excludedUserIds],
        );
        const { data, loading, error, lineage } = useLightdash(built);
        const cells = useMemo(
            () => data.map((row) => toCell(row, false)),
            [data],
        );
        return {
            data: cells,
            loading,
            error: message(error),
            truncated: data.length >= OVERVIEW_ROW_LIMIT,
            lineage,
        };
    },
    usePeople: (filter) => {
        const built = useMemo(() => peopleQuery(filter), [filter]);
        const { data, loading, error, lineage } = useLightdash(built);
        const cells = useMemo(
            () => data.map((row) => toCell(row, true)),
            [data],
        );
        return {
            data: cells,
            loading,
            error: message(error),
            truncated: data.length >= PEOPLE_ROW_LIMIT,
            lineage,
        };
    },
    useWeeklyActive: (userIds) => {
        const built = useMemo(() => weeklyActiveQuery(userIds), [userIds]);
        const { data, loading, error, lineage } = useLightdash(built);
        const weeks = useMemo(
            () =>
                data.map((row) => ({
                    week: String(row.activity_date_week ?? '').slice(0, 10),
                    people: toNumber(row.unique_users),
                })),
            [data],
        );
        return { data: weeks, loading, error: message(error), lineage };
    },
    useTopContent: (userIds) => {
        const built = useMemo(() => topContentQuery(userIds), [userIds]);
        const { data, loading, error, lineage } = useLightdash(built);
        const items = useMemo(
            () =>
                data.map((row) => ({
                    name: String(row.content_name ?? 'Unnamed'),
                    type: String(row.content_type ?? ''),
                    viewers: toNumber(row.distinct_viewers),
                    views: toNumber(row.qualifying_views),
                })),
            [data],
        );
        return { data: items, loading, error: message(error), lineage };
    },
    useViewer: () => {
        const client = useLightdashClient();
        const [viewer, setViewer] = useState<Viewer>({
            isAdmin: false,
            loading: true,
        });
        useEffect(() => {
            let cancelled = false;
            if (!client) {
                setViewer({ isAdmin: false, loading: false });
                return undefined;
            }
            client.auth
                .getUser()
                .then((user) => {
                    if (!cancelled)
                        setViewer({
                            isAdmin: user.role === 'admin',
                            loading: false,
                        });
                })
                .catch(() => {
                    if (!cancelled)
                        setViewer({ isAdmin: false, loading: false });
                });
            return () => {
                cancelled = true;
            };
        }, [client]);
        return viewer;
    },
};

const ready = <T>(data: T): Loadable<T> => ({
    data,
    loading: false,
    error: null,
});

const matches = (cell: Cell, filter: PeopleFilter): boolean => {
    switch (filter.kind) {
        case 'everyone':
            return true;
        case 'groups':
            return cell.groupIds.some((id) => filter.groupIds.includes(id));
        case 'outsideGroups':
            return !cell.groupIds.some((id) => filter.groupIds.includes(id));
        case 'users':
            return (
                cell.person !== null && filter.userIds.includes(cell.person.id)
            );
        case 'search':
            return (
                cell.person !== null &&
                cell.person.name.toLowerCase().includes(filter.term.trim().toLowerCase())
            );
        default:
            return false;
    }
};

const createFixtureSource = (name: string, role: string, withTeams: boolean): AdoptionSource => {
    const people = buildFixturePeople(name);
    return {
        fixture: name,
        fixtureTeams: withTeams ? buildFixtureTeams(name) : null,
        useTotal: () => useMemo(() => ready(people.length), []),
        useCounts: (excludedUserIds) =>
            useMemo(
                () =>
                    ready(
                        toCounts(
                            people.filter(
                                (cell) =>
                                    cell.person === null ||
                                    !excludedUserIds.includes(cell.person.id),
                            ),
                        ),
                    ),
                [excludedUserIds],
            ),
        usePeople: (filter) =>
            useMemo(
                () => {
                    const found = people.filter((cell) => matches(cell, filter));
                    return ready(filter.kind === 'search' ? found.slice(0, 30) : found);
                },
                [filter],
            ),
        useWeeklyActive: (userIds) =>
            useMemo(() => {
                const ids = new Set(userIds);
                const active = people.filter(
                    (cell) =>
                        cell.person !== null &&
                        ids.has(cell.person.id) &&
                        (cell.recency === 'd7' || cell.recency === 'd30'),
                ).length;
                return ready(buildFixtureWeeks(active));
            }, [userIds]),
        useTopContent: (userIds) =>
            useMemo(
                () => ready(buildFixtureContent(userIds.length)),
                [userIds],
            ),
        useViewer: () => ({ isAdmin: role !== 'viewer', loading: false }),
    };
};

// Fixtures exist only in local development: `?fixture=small|medium|large`, `&teams=none` to start with no teams as a
// new organisation does, and `&role=viewer` to see the app as
// someone who cannot change teams
const getFixtureSource = (): AdoptionSource | null => {
    if (!import.meta.env.DEV) return null;
    const params = new URLSearchParams(window.location.search);
    const name = params.get('fixture');
    return name !== null && FIXTURE_NAMES.includes(name)
        ? createFixtureSource(name, params.get('role') ?? 'admin', params.get('teams') !== 'none')
        : null;
};

export const source: AdoptionSource = getFixtureSource() ?? liveSource;
