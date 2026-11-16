import type { QueryBuilder } from '@lightdash/query-sdk';

export type PeopleFilter =
    | { kind: 'everyone' }
    | { kind: 'groups'; groupIds: string[] }
    | { kind: 'outsideGroups'; groupIds: string[] }
    | { kind: 'users'; userIds: string[] }
    | { kind: 'search'; term: string };

export const SEARCH_ROW_LIMIT: number;

export const OVERVIEW_ROW_LIMIT: number;
export const PEOPLE_ROW_LIMIT: number;
export const totalQuery: QueryBuilder;
export const countsQuery: (excludedUserIds: string[]) => QueryBuilder;
export const peopleQuery: (filter: PeopleFilter) => QueryBuilder;
export const weeklyActiveQuery: (userIds: string[]) => QueryBuilder;
export const topContentQuery: (userIds: string[]) => QueryBuilder;
