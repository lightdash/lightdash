import {
    getScopes,
    getTrainingProjectScopes,
    ProjectMemberRole,
    ScopeGroup,
} from '@lightdash/common';
import { CURRICULUM } from '../scopeTours/curriculum';
import { tourFor } from '../scopeTours/tourFor';
import { ROLE_LABELS, ROLE_ORDER, SYSTEM_ROLE_SCOPES } from './access';
import { COMING_SOON_SCOPES } from './comingSoon';
import { SANDBOX_LESSONS } from './sandboxLessons';

/**
 * Foundations contains viewer lessons and is the first library section.
 * Other groups follow the scope registry.
 */
export const FOUNDATIONS = 'foundations' as const;
/** Docs-page lessons practised in the workspace of a training copy. */
export const DEVELOPER = 'developer' as const;
export type LearnGroup = ScopeGroup | typeof FOUNDATIONS | typeof DEVELOPER;
/**
 * What a learner must hold to see the docs lessons on their shelf: they
 * amend the dbt project's YAML, which Developer and above can do.
 */
export const DOCS_LESSON_SCOPE = 'manage:SourceCode';

/**
 * What an instance must have for a module's walkthrough to find its controls:
 * an Enterprise licence, or one of the product's own feature switches on top
 * of it. The library leaves a closed module out (see availability.ts).
 */
export type LearnGate =
    | 'enterprise'
    | 'dataApps'
    | 'aiAgents'
    | 'softDelete'
    | 'documents'
    | 'sandbox';

const SUBJECT_GATES: Record<string, LearnGate> = {
    DeletedContent: 'softDelete',
    Document: 'documents',
    DataApp: 'dataApps',
    AiAgent: 'aiAgents',
    AiAgentThread: 'aiAgents',
    AiAgentDocument: 'aiAgents',
    AiAgentSkill: 'aiAgents',
    EmbedAiAgent: 'aiAgents',
    EmbedAiAgentDebug: 'aiAgents',
    EmbedDataApps: 'dataApps',
    AiDeepResearch: 'aiAgents',
};

export const gateFor = (scope: {
    name: string;
    isEnterprise: boolean;
}): LearnGate | null =>
    SUBJECT_GATES[scope.name.split(':')[1]] ??
    (scope.isEnterprise ? 'enterprise' : null);

export type LearnModule = {
    /** A scope walkthrough over the product, or a docs-page lesson in the workspace. */
    kind: 'scope' | 'docs';
    scope: string;
    /**
     * Every scope the card stands for: `scope`, then the ones the same
     * lesson teaches with the same controls (data-tour-covers). One lesson
     * is one card, whatever it covers.
     */
    scopes: string[];
    title: string;
    group: LearnGroup;
    gate: LearnGate | null;
    /** The lowest project role that holds any of the scopes; null if none does. */
    minRole: ProjectMemberRole | null;
    available: boolean;
    blurb: string;
    stepCount: number;
};

export const GROUP_ORDER: LearnGroup[] = [
    FOUNDATIONS,
    ScopeGroup.CONTENT,
    ScopeGroup.SHARING,
    ScopeGroup.EMBED,
    ScopeGroup.DATA,
    ScopeGroup.AI,
    ScopeGroup.PROJECT_MANAGEMENT,
    ScopeGroup.SPOTLIGHT,
    ScopeGroup.ORGANIZATION_MANAGEMENT,
    DEVELOPER,
];

/** The library's one-line purpose per group, as on learn.lightdash.com. */
export const GROUP_DESCRIPTIONS: Record<LearnGroup, string> = {
    [FOUNDATIONS]: 'Become a knowledgeable Lightdash user',
    [ScopeGroup.CONTENT]: 'Create and maintain charts, dashboards, and spaces',
    [ScopeGroup.SHARING]: 'Send, schedule, and discuss trusted answers',
    [ScopeGroup.EMBED]: 'Put charts and dashboards inside other products',
    [ScopeGroup.DATA]:
        'Shape, inspect, and extend the data available in Lightdash',
    [ScopeGroup.AI]: 'Ask better questions and manage AI-powered workflows',
    [ScopeGroup.PROJECT_MANAGEMENT]: 'Keep project access and delivery healthy',
    [ScopeGroup.SPOTLIGHT]: 'Learn timely product areas and advanced workflows',
    [ScopeGroup.ORGANIZATION_MANAGEMENT]:
        'Administer people, roles, and organisation settings',
    [DEVELOPER]: 'Model the semantic layer and ship it with the CLI',
};

export const GROUP_LABELS: Record<LearnGroup, string> = {
    [FOUNDATIONS]: 'Foundations',
    [ScopeGroup.CONTENT]: 'Content',
    [ScopeGroup.SHARING]: 'Sharing',
    [ScopeGroup.EMBED]: 'Embedding',
    [ScopeGroup.DATA]: 'Data',
    [ScopeGroup.AI]: 'AI',
    [ScopeGroup.PROJECT_MANAGEMENT]: 'Project management',
    [ScopeGroup.SPOTLIGHT]: 'Spotlight',
    [ScopeGroup.ORGANIZATION_MANAGEMENT]: 'Organization',
    [DEVELOPER]: 'Developer',
};

const stripBold = (text: string) => text.replace(/\*\*/g, '');

const minRoleFor = (scope: string): ProjectMemberRole | null =>
    SYSTEM_ROLE_SCOPES.find((system) => system.held.has(scope))?.role ?? null;

/** The lowest of the roles that hold any of the scopes; null if none does. */
const lowestRoleFor = (scopes: string[]): ProjectMemberRole | null =>
    scopes
        .map(minRoleFor)
        .filter((role): role is ProjectMemberRole => role !== null)
        .sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b))[0] ??
    null;

/** One module per lesson, in declaration order; the tour under the lesson id names it. */
const docsModules = (): LearnModule[] =>
    SANDBOX_LESSONS.map((lesson) => {
        const tour = tourFor(lesson.id);
        return {
            kind: 'docs',
            scope: lesson.id,
            scopes: [lesson.id],
            title: tour?.title ?? lesson.id.replace(/^docs:/, ''),
            group: DEVELOPER,
            gate: 'sandbox',
            minRole: minRoleFor(DOCS_LESSON_SCOPE),
            available: tour !== undefined,
            blurb: tour ? stripBold(tour.steps[0]?.body ?? '') : '',
            stepCount: tour?.steps.length ?? 0,
        };
    });

/** Walkthroughs and explicit upcoming modules; permissions remain independent. */
export const buildLearnCatalogue = (): LearnModule[] => {
    const trainee = new Set([
        ...getTrainingProjectScopes(),
        ...COMING_SOON_SCOPES,
    ]);
    const comingSoon = new Set<string>(COMING_SOON_SCOPES);
    const scopeModules = getScopes({ isEnterprise: true })
        // Base scopes only: a modifier variant (`@self`, `@space`) is the
        // same feature with a narrower reach, not another lesson.
        .filter(
            (scope) =>
                trainee.has(scope.name) &&
                !scope.name.includes('@') &&
                (tourFor(scope.name) !== undefined ||
                    comingSoon.has(scope.name)) &&
                // A lesson that teaches several scopes with the same
                // controls is one card, under the scope it was declared
                // on; the copies under the scopes it covers draw nothing.
                tourFor(scope.name)?.coveredBy === undefined,
        )
        .map((scope) => {
            const tour = tourFor(scope.name);
            const scopes = [scope.name, ...(tour?.covers ?? [])];
            const minRole = lowestRoleFor(scopes);
            return {
                kind: 'scope' as const,
                scope: scope.name,
                scopes,
                // A built walkthrough names itself (data-tour-title); a
                // module still to come keeps the registry's words, minus
                // the "all" that reads as a threat on a card.
                title: tour?.title ?? scope.description.replace(/\ball\b /, ''),
                // What a viewer already holds is a Foundation; the rest
                // sit where the registry puts them.
                group:
                    minRole === ProjectMemberRole.VIEWER
                        ? FOUNDATIONS
                        : scope.group,
                gate: gateFor(scope),
                minRole,
                available: tour !== undefined,
                blurb: tour ? stripBold(tour.steps[0]?.body ?? '') : '',
                stepCount: tour?.steps.length ?? 0,
            };
        })
        .sort(
            (a, b) =>
                Number(b.available) - Number(a.available) ||
                taughtAt(a) - taughtAt(b) ||
                a.title.localeCompare(b.title),
        );
    return [...scopeModules, ...docsModules()];
};

/**
 * Where a module sits in the teaching order the docs sidebar sets
 * (scripts/scope-tours/order.ts). A module the order does not name, because
 * no walkthrough exists for it yet, sorts after every one that it does.
 */
const taughtAt = (module: LearnModule): number => {
    if (module.kind === 'docs') {
        // Lessons follow every walkthrough, in the order they are declared.
        return (
            CURRICULUM.length +
            SANDBOX_LESSONS.findIndex((lesson) => lesson.id === module.scope)
        );
    }
    // A lesson that covers several scopes is taught where the first of
    // them comes up.
    const at = Math.min(
        ...module.scopes.map((scope) => {
            const index = CURRICULUM.indexOf(scope);
            return index < 0 ? CURRICULUM.length : index;
        }),
    );
    return at;
};

/** Available first, then the modules the learner holds, then in teaching order. */
export const sortForLearner = (
    held: Set<string>,
    modules: LearnModule[],
): LearnModule[] =>
    [...modules].sort(
        (a, b) =>
            Number(b.available) - Number(a.available) ||
            Number(holds(held, b)) - Number(holds(held, a)) ||
            taughtAt(a) - taughtAt(b) ||
            a.title.localeCompare(b.title),
    );

/**
 * The library's two focus cards: the walkthrough left unfinished (Resume)
 * and the first unfinished one after it, held-by-role first (Recommended
 * next). The completion page offers the same recommendation, so the two
 * pages never disagree about what comes next.
 */
export const focusModules = (
    held: Set<string>,
    available: LearnModule[],
    completed: string[],
    lastStarted: string | null,
): { resume?: LearnModule; recommended?: LearnModule } => {
    const walkthroughs = available.filter((module) => module.available);
    const resume = walkthroughs.find(
        (m) =>
            lastStarted !== null &&
            m.scopes.includes(lastStarted) &&
            !isComplete(completed, m),
    );
    const recommended = sortForLearner(held, walkthroughs).find(
        (m) => m.scope !== resume?.scope && !isComplete(completed, m),
    );
    return { resume, recommended };
};

/**
 * Whether the learner has finished a module: any of the scopes its lesson
 * teaches is recorded as complete. Finishing the lesson records them all,
 * and progress recorded under a covered scope before that still counts.
 */
export const isComplete = (completed: string[], module: LearnModule) =>
    module.scopes.some((scope) => completed.includes(scope));

/** Whether the learner has started a module's lesson under any of its scopes. */
export const isStarted = (started: string[], module: LearnModule) =>
    module.scopes.some((scope) => started.includes(scope));

/**
 * Whether the learner holds a module's feature. Membership, not rank: their
 * access is a set of scopes gathered from every role they hold, and a custom
 * role sits nowhere on the system ladder. A docs lesson is held by whoever
 * can change the project's source code (DOCS_LESSON_SCOPE).
 */
export const holds = (held: Set<string>, module: LearnModule): boolean =>
    module.kind === 'docs'
        ? held.has(DOCS_LESSON_SCOPE)
        : module.scopes.some((scope) => held.has(scope));

/**
 * What a card says about a module the learner cannot practise yet: the
 * lowest system role that holds it, so they know what it would take. A
 * module no system role holds says nothing.
 */
export const accessNote = (
    held: Set<string>,
    module: LearnModule,
): string | null => {
    if (holds(held, module)) return null;
    return module.minRole ? `${ROLE_LABELS[module.minRole]} and above` : null;
};
