import {
    formatDisplayLabel,
    getDisplayLabels,
    getFullDisplayLabels,
    type DisplayLabel,
    type LabelledItem,
} from './labels';
import { type OverviewOption } from './overview';

// One thing a new control can filter by: a field or a parameter of its type
export type ControlChoice = {
    kind: 'filter' | 'parameter';
    id: string;
    display: DisplayLabel;
    tileCount: number;
};

type ChoiceSource = {
    options: OverviewOption[];
    items: Record<string, LabelledItem>;
};

// The first step's list: the fields, then the parameters, each kind with its
// most used first and ties in the order they came in. Fields read as the
// field picker names them; parameters carry their model only when two share
// a name.
export const getControlChoices = ({
    fields,
    parameters,
}: {
    fields: ChoiceSource;
    parameters: ChoiceSource;
}): ControlChoice[] => {
    const known = ({ options, items }: ChoiceSource) =>
        options.flatMap(({ id }) => (items[id] ? [items[id]] : []));
    const fieldLabels = getFullDisplayLabels(known(fields));
    const parameterLabels = getDisplayLabels(known(parameters));
    const toChoices = (
        kind: ControlChoice['kind'],
        options: OverviewOption[],
        labels: Record<string, DisplayLabel>,
    ): ControlChoice[] =>
        options.flatMap(({ id, tileUuids }) =>
            labels[id]
                ? [
                      {
                          kind,
                          id,
                          display: labels[id],
                          tileCount: tileUuids.length,
                      },
                  ]
                : [],
        );
    const byTileCount = (a: ControlChoice, b: ControlChoice) =>
        b.tileCount - a.tileCount;
    return [
        ...toChoices('filter', fields.options, fieldLabels).sort(byTileCount),
        ...toChoices('parameter', parameters.options, parameterLabels).sort(
            byTileCount,
        ),
    ];
};

export const searchControlChoices = (
    choices: ControlChoice[],
    search: string,
): ControlChoice[] => {
    const query = search.trim().toLowerCase();
    if (query === '') return choices;
    return choices.filter((choice) =>
        formatDisplayLabel(choice.display).toLowerCase().includes(query),
    );
};

export const getChoiceKey = ({ kind, id }: ControlChoice): string =>
    `${kind}:${id}`;

export type ControlChoiceGroup = {
    // Null where there is only one kind to offer: the list needs no heading
    heading: 'Fields' | 'Parameters' | null;
    choices: ControlChoice[];
};

const GROUPS: {
    kind: ControlChoice['kind'];
    heading: 'Fields' | 'Parameters';
}[] = [
    { kind: 'filter', heading: 'Fields' },
    { kind: 'parameter', heading: 'Parameters' },
];

// The list as it is shown: the choices that match the search, under "Fields"
// and "Parameters" when both kinds are on offer. A group with no match is
// left out; its heading does not depend on the search.
export const getControlChoiceGroups = (
    choices: ControlChoice[],
    search: string,
): ControlChoiceGroup[] => {
    const hasBothKinds = GROUPS.every(({ kind }) =>
        choices.some((choice) => choice.kind === kind),
    );
    const matches = searchControlChoices(choices, search);
    return GROUPS.map(({ kind, heading }) => ({
        heading: hasBothKinds ? heading : null,
        choices: matches.filter((choice) => choice.kind === kind),
    })).filter((group) => group.choices.length > 0);
};
