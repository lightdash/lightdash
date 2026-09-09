import {
    getScopes,
    getTrainingProjectScopes,
    ProjectMemberRole,
    ScopeGroup,
} from '@lightdash/common';
import { CURRICULUM } from '../scopeTours/curriculum';
import { SCOPE_TOURS } from '../scopeTours/generated';
import { ROLE_LABELS, SYSTEM_ROLE_SCOPES } from './access';
import { conceptProgressKey } from './conceptLesson';
import { CONCEPT_LESSONS } from './conceptLessons.generated';

/**
 * Foundations, as on learn.lightdash.com: what a viewer can already do,
 * taught in the same format, and the first section of the library. Every
 * other group is the scope registry's own.
 */
export const FOUNDATIONS = 'foundations' as const;
export type LearnGroup = ScopeGroup | typeof FOUNDATIONS;

/**
 * What an instance must have for a module's walkthrough to find its controls:
 * an Enterprise licence, or one of the product's own feature switches on top
 * of it. The library leaves a closed module out (see availability.ts).
 */
export type LearnGate = 'enterprise' | 'dataApps' | 'aiAgents' | 'softDelete';

const SUBJECT_GATES: Record<string, LearnGate> = {
    DeletedContent: 'softDelete',
    DataApp: 'dataApps',
    AiAgent: 'aiAgents',
    AiAgentThread: 'aiAgents',
    AiAgentDocument: 'aiAgents',
    EmbedAiAgent: 'aiAgents',
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
    scope: string;
    title: string;
    group: LearnGroup;
    gate: LearnGate | null;
    /** The lowest project role that holds the scope; null if none does. */
    minRole: ProjectMemberRole | null;
    available: boolean;
    format: 'walkthrough' | 'concept';
    blurb: string;
    stepCount: number;
};

export const moduleProgressKey = (
    module: Pick<LearnModule, 'scope' | 'format'>,
): string =>
    module.format === 'concept'
        ? conceptProgressKey(module.scope)
        : module.scope;

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
};

const stripBold = (text: string) => text.replace(/\*\*/g, '');

/** Available walkthroughs and documentation lessons; permissions remain independent. */
export const buildLearnCatalogue = (): LearnModule[] => {
    const trainee = new Set([
        ...getTrainingProjectScopes(),
        ...Object.keys(CONCEPT_LESSONS),
    ]);
    return (
        getScopes({ isEnterprise: true })
            // Base scopes only: a modifier variant (`@self`, `@space`) is the
            // same feature with a narrower reach, not another lesson.
            .filter(
                (scope) =>
                    trainee.has(scope.name) &&
                    !scope.name.includes('@') &&
                    (SCOPE_TOURS[scope.name] !== undefined ||
                        CONCEPT_LESSONS[scope.name] !== undefined),
            )
            .map((scope) => {
                const tour = SCOPE_TOURS[scope.name];
                const concept = CONCEPT_LESSONS[scope.name];
                const minRole =
                    SYSTEM_ROLE_SCOPES.find((system) =>
                        system.held.has(scope.name),
                    )?.role ?? null;
                return {
                    scope: scope.name,
                    // A built walkthrough names itself (data-tour-title); a
                    // module still to come keeps the registry's words, minus
                    // the "all" that reads as a threat on a card.
                    title:
                        tour?.title ??
                        concept?.title ??
                        scope.description.replace(/\ball\b /, ''),
                    // What a viewer already holds is a Foundation; the rest
                    // sit where the registry puts them.
                    group:
                        minRole === ProjectMemberRole.VIEWER
                            ? FOUNDATIONS
                            : scope.group,
                    gate: gateFor(scope),
                    minRole,
                    available: tour !== undefined || concept !== undefined,
                    format: tour
                        ? ('walkthrough' as const)
                        : ('concept' as const),
                    blurb: tour
                        ? stripBold(tour.steps[0]?.body ?? '')
                        : 'Read the documented workflow and acknowledge your understanding.',
                    stepCount: tour?.steps.length ?? 0,
                };
            })
            .sort(
                (a, b) =>
                    Number(b.available) - Number(a.available) ||
                    taughtAt(a) - taughtAt(b) ||
                    a.title.localeCompare(b.title),
            )
    );
};

/**
 * Where a module sits in the teaching order the docs imply
 * (scripts/scope-tours/order.ts). A module the order does not name, because
 * no walkthrough exists for it yet, sorts after every one that it does.
 */
const taughtAt = (module: LearnModule): number => {
    const at = CURRICULUM.indexOf(module.scope);
    return at < 0 ? CURRICULUM.length : at;
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
    const resume = available.find(
        (m) =>
            moduleProgressKey(m) === lastStarted &&
            !completed.includes(moduleProgressKey(m)),
    );
    const recommended = sortForLearner(held, available).find(
        (m) =>
            m.scope !== resume?.scope &&
            !completed.includes(moduleProgressKey(m)),
    );
    return { resume, recommended };
};

/**
 * Whether the learner holds a module's feature. Membership, not rank: their
 * access is a set of scopes gathered from every role they hold, and a custom
 * role sits nowhere on the system ladder.
 */
export const holds = (held: Set<string>, module: LearnModule): boolean =>
    held.has(module.scope);

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
