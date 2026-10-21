import { assertUnreachable } from '@lightdash/common';
import type { AiAgentSkillReference } from '../skills/types';
import type { AiAgentArgs } from '../types/aiAgent';
import { ADD_ONS, applicableAddOns, withImpliedAddOns } from './addOns';
import { BASES } from './bases';
import type { AddOnName, Loadout, LoadoutBase, LoadoutInput } from './types';

export const selectLoadoutBase = (input: LoadoutInput): LoadoutBase => {
    const research =
        input.execution.mode === 'deep_research'
            ? input.execution.research
            : undefined;
    switch (research?.role) {
        case 'coordinator':
            return 'deep_research_coordinator';
        case 'worker':
            return 'deep_research_worker';
        case undefined:
            break;
        default:
            return assertUnreachable(research, 'Unknown research role');
    }
    if (input.enableComposerQueries) return 'composer';
    if (!input.enableDataAccess) return 'no_data_access';
    return 'classic';
};

/** Unions a base with the given add-ons it accepts. */
export const buildLoadout = (
    base: LoadoutBase,
    input: LoadoutInput,
    addOnNames: readonly AddOnName[],
): Loadout => {
    const definition = BASES[base](input);
    const implied = withImpliedAddOns(
        definition.accepts.filter((name) => addOnNames.includes(name)),
    );
    const addOns = definition.accepts.filter((name) => implied.includes(name));
    return {
        base,
        addOns: new Set(addOns),
        toolNames: new Set([
            ...definition.tools,
            ...addOns.flatMap((name) => ADD_ONS[name].tools),
        ]),
        promptSections: new Set([
            ...definition.sections,
            ...addOns.flatMap((name) => {
                const { section } = ADD_ONS[name];
                return section ? [section.id] : [];
            }),
        ]),
        skills: new Set([
            ...definition.skills,
            ...addOns.flatMap((name) => ADD_ONS[name].skills),
        ]),
    };
};

/** Pure and total: one base plus the add-ons it accepts whose condition holds. */
export const resolveLoadout = (input: LoadoutInput): Loadout =>
    buildLoadout(selectLoadoutBase(input), input, applicableAddOns(input));

/** The loadout's built-in skills, then the agent's custom skills. */
export const getAvailableSkills = (
    args: Pick<AiAgentArgs, 'builtInSkills' | 'customSkills'>,
    loadout: Pick<Loadout, 'skills'>,
): AiAgentSkillReference[] => {
    const listed: ReadonlySet<string> = loadout.skills;
    return [
        ...args.builtInSkills.filter(({ name }) => listed.has(name)),
        ...args.customSkills,
    ];
};
