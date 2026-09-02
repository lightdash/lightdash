// Shared by the in-app Learn section and learn.lightdash.com via @lightdash/learn-ui.

import {
    OrganizationMemberRole,
    ProjectMemberRole,
    ScopeGroup,
    type Scope,
    type ScopeSource,
} from '../scope/types';
import { type LearnCatalogueEntry } from '../types';
import type { Rollup } from './rollup';

export type BoardGroup = 'foundations' | ScopeGroup;

export const GROUP_ORDER: BoardGroup[] = [
    'foundations',
    ScopeGroup.CONTENT,
    ScopeGroup.SHARING,
    ScopeGroup.DATA,
    ScopeGroup.AI,
    ScopeGroup.PROJECT_MANAGEMENT,
    ScopeGroup.ORGANIZATION_MANAGEMENT,
    ScopeGroup.SPOTLIGHT,
];

export const GROUP_LABEL: Record<BoardGroup, string> = {
    foundations: 'Foundations',
    [ScopeGroup.CONTENT]: 'Content',
    [ScopeGroup.SHARING]: 'Sharing',
    [ScopeGroup.DATA]: 'Data',
    [ScopeGroup.AI]: 'AI',
    [ScopeGroup.PROJECT_MANAGEMENT]: 'Project management',
    [ScopeGroup.ORGANIZATION_MANAGEMENT]: 'Organization',
    [ScopeGroup.SPOTLIGHT]: 'Spotlight',
};

export const SYSTEM_ROLES: ProjectMemberRole[] = [
    ProjectMemberRole.VIEWER,
    ProjectMemberRole.INTERACTIVE_VIEWER,
    ProjectMemberRole.EDITOR,
    ProjectMemberRole.DEVELOPER,
    ProjectMemberRole.ADMIN,
];

export const ROLE_LABEL: Record<ProjectMemberRole, string> = {
    [ProjectMemberRole.VIEWER]: 'viewer',
    [ProjectMemberRole.INTERACTIVE_VIEWER]: 'interactive viewer',
    [ProjectMemberRole.EDITOR]: 'editor',
    [ProjectMemberRole.DEVELOPER]: 'developer',
    [ProjectMemberRole.ADMIN]: 'admin',
};

const GLOBAL_SUFFIX = '@global';
const FOUNDATION_SCOPE = 'view:Project';

export const parseScopeTag = (
    tag: string,
): { base: string; global: boolean } => {
    const global = tag.endsWith(GLOBAL_SUFFIX);
    return {
        base: global ? tag.slice(0, -GLOBAL_SUFFIX.length) : tag,
        global,
    };
};

const baseOf = (scopeName: string): string => scopeName.split('@')[0];

export const holds = (held: Iterable<string>, tag: string): boolean => {
    const { base, global } = parseScopeTag(tag);
    for (const name of held) {
        if (baseOf(name) !== base) continue;
        if (!global || !name.includes('@')) return true;
    }
    return false;
};

const ORG_TO_BOARD_ROLE: Record<OrganizationMemberRole, ProjectMemberRole> = {
    [OrganizationMemberRole.MEMBER]: ProjectMemberRole.VIEWER,
    [OrganizationMemberRole.VIEWER]: ProjectMemberRole.VIEWER,
    [OrganizationMemberRole.INTERACTIVE_VIEWER]:
        ProjectMemberRole.INTERACTIVE_VIEWER,
    [OrganizationMemberRole.EDITOR]: ProjectMemberRole.EDITOR,
    [OrganizationMemberRole.DEVELOPER]: ProjectMemberRole.DEVELOPER,
    [OrganizationMemberRole.ADMIN]: ProjectMemberRole.ADMIN,
};

export const defaultRoleFor = (
    orgRole: OrganizationMemberRole | undefined,
): ProjectMemberRole =>
    orgRole === undefined
        ? ProjectMemberRole.VIEWER
        : ORG_TO_BOARD_ROLE[orgRole];

export const lessonsDone = (
    entry: LearnCatalogueEntry,
    rollup: Rollup | undefined,
): number => {
    if (!rollup) return 0;
    if (rollup.completed) return entry.lessonCount;
    return Math.min(rollup.lessonsCompleted.size, entry.lessonCount);
};

export const moduleDone = (rollup: Rollup | undefined): boolean =>
    rollup?.completed === true;

export const moduleProgress = (
    entry: LearnCatalogueEntry,
    rollup: Rollup | undefined,
): number => {
    if (!rollup) return 0;
    if (rollup.completed) return 1;
    if (entry.lessonCount <= 0) return 0;
    // The quiz is the last step, so reading every lesson stops one step short
    // of 1; only a passed quiz (`completed`) reaches full.
    return Math.min(
        lessonsDone(entry, rollup) / entry.lessonCount,
        entry.lessonCount / (entry.lessonCount + 1),
    );
};

export type BoardModule = {
    entry: LearnCatalogueEntry;
    group: BoardGroup;
    progress: number;
    lessonsDone: number;
    done: boolean;
};

export type RailModel = {
    mine: BoardModule[];
    nextUpId: string | null;
    overall: {
        pct: number;
        doneLessons: number;
        totalLessons: number;
        modulesComplete: number;
    };
    queue: BoardModule[];
    completed: BoardModule[];
};

const QUEUE_LIMIT = 4;
const COMPLETED_LIMIT = 3;

export const ctaLabel = (
    done: boolean,
    progress: number,
): 'Start module' | 'Continue module' | 'Review module' => {
    if (done) return 'Review module';
    if (progress > 0) return 'Continue module';
    return 'Start module';
};

export const plural = (n: number, word: string): string =>
    `${n} ${word}${n === 1 ? '' : 's'}`;

export type BoardModel = {
    scopeKnown: (base: string) => boolean;
    roleScopes: (role: ProjectMemberRole) => string[];
    isUnlocked: (entry: LearnCatalogueEntry, held: Iterable<string>) => boolean;
    groupOf: (entry: LearnCatalogueEntry) => BoardGroup;
    courseFor: (
        entries: LearnCatalogueEntry[],
        held: Iterable<string>,
    ) => LearnCatalogueEntry[];
    heldBy: (entry: LearnCatalogueEntry) => ProjectMemberRole[];
    scopePermits: (entry: LearnCatalogueEntry) => string | null;
    railModel: (
        entries: LearnCatalogueEntry[],
        held: Iterable<string>,
        rollups: Map<string, Rollup>,
    ) => RailModel;
};

export const createBoardModel = (source: ScopeSource): BoardModel => {
    const scopeMap = source.getAllScopeMap({ isEnterprise: true }) as Record<
        string,
        Scope | undefined
    >;
    const roleScopeCache = new Map<ProjectMemberRole, string[]>();

    const scopeKnown = (base: string): boolean => scopeMap[base] !== undefined;

    const roleScopes = (role: ProjectMemberRole): string[] => {
        const cached = roleScopeCache.get(role);
        if (cached) return cached;
        const scopes = source.getAllScopesForRole(role);
        roleScopeCache.set(role, scopes);
        return scopes;
    };

    const isUnlocked = (
        entry: LearnCatalogueEntry,
        held: Iterable<string>,
    ): boolean => {
        if (entry.scope === null) return true;
        const { base } = parseScopeTag(entry.scope);
        if (scopeMap[base] === undefined) return true;
        return holds(held, entry.scope);
    };

    const groupOf = (entry: LearnCatalogueEntry): BoardGroup => {
        if (entry.scope === null) return 'foundations';
        const { base } = parseScopeTag(entry.scope);
        if (base === FOUNDATION_SCOPE) return 'foundations';
        return scopeMap[base]?.group ?? 'foundations';
    };

    const courseFor = (
        entries: LearnCatalogueEntry[],
        held: Iterable<string>,
    ): LearnCatalogueEntry[] => {
        const heldList = Array.from(held);
        return entries.filter((entry) => isUnlocked(entry, heldList));
    };

    const heldBy = (entry: LearnCatalogueEntry): ProjectMemberRole[] =>
        SYSTEM_ROLES.filter((role) => isUnlocked(entry, roleScopes(role)));

    const scopePermits = (entry: LearnCatalogueEntry): string | null => {
        if (entry.scope === null) return null;
        return scopeMap[parseScopeTag(entry.scope).base]?.description ?? null;
    };

    const railModel = (
        entries: LearnCatalogueEntry[],
        held: Iterable<string>,
        rollups: Map<string, Rollup>,
    ): RailModel => {
        // Every module is scored; the held course filters the board, queue and
        // totals, but completion is never revoked by a role change.
        const everything: BoardModule[] = entries
            .map((entry) => {
                const rollup = rollups.get(entry.id);
                return {
                    entry,
                    group: groupOf(entry),
                    progress: moduleProgress(entry, rollup),
                    lessonsDone: lessonsDone(entry, rollup),
                    done: moduleDone(rollup),
                };
            })
            .sort(
                (a, b) =>
                    GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group),
            );
        const heldIds = new Set(
            courseFor(entries, held).map((entry) => entry.id),
        );
        const mine = everything.filter((m) => heldIds.has(m.entry.id));

        const inFlight = mine
            .filter((m) => !m.done && m.progress > 0)
            .sort((a, b) => b.progress - a.progress);
        const notStarted = mine.filter((m) => !m.done && m.progress === 0);
        const completed = everything.filter((m) => m.done);
        const nextUp = inFlight[0] ?? notStarted[0] ?? null;

        const doneLessons = mine.reduce((sum, m) => sum + m.lessonsDone, 0);
        const totalLessons = mine.reduce(
            (sum, m) => sum + m.entry.lessonCount,
            0,
        );

        return {
            mine,
            nextUpId: nextUp ? nextUp.entry.id : null,
            overall: {
                pct: totalLessons
                    ? Math.round((doneLessons / totalLessons) * 100)
                    : 0,
                doneLessons,
                totalLessons,
                modulesComplete: mine.filter((m) => m.done).length,
            },
            queue: [...inFlight, ...notStarted].slice(0, QUEUE_LIMIT),
            completed: completed.slice(0, COMPLETED_LIMIT),
        };
    };

    return {
        scopeKnown,
        roleScopes,
        isUnlocked,
        groupOf,
        courseFor,
        heldBy,
        scopePermits,
        railModel,
    };
};
