import { Ability, ForcedSubject } from '@casl/ability';

const actions = ['manage', 'view'] as const;
const subjects = ['all'] as const;
type PossibleAbilities = [
    typeof actions[number],
    (
        | typeof subjects[number]
        | ForcedSubject<Exclude<typeof subjects[number], 'all'>>
    ),
];
export class LightdashAbility extends Ability<PossibleAbilities> {}

// manage/all are keywords for "any action" and "any subject"
export const getAdminAbility = () =>
    new LightdashAbility([
        {
            action: 'manage',
            subject: 'all',
        },
    ]);
export const getNoAbility = () => new LightdashAbility();
