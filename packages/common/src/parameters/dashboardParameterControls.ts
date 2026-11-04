import { v4 as uuidv4 } from 'uuid';
import {
    type DashboardParameterControl,
    type DashboardParameterTarget,
} from '../types/dashboard';
import { type LightdashProjectParameter } from '../types/lightdashProjectConfig';
import {
    type DashboardParameters,
    type ParameterDefinitions,
    type ParametersValuesMap,
} from '../types/parameters';
import { type DashboardTileParameterInputs } from './dashboardTileParameters';
import { isReservedParameterName } from './reservedParameters';

const isSystemKey = (key: string, userParameterNames: string[]) =>
    isReservedParameterName(key) && !userParameterNames.includes(key);

const isTarget = (target: unknown): target is DashboardParameterTarget => {
    if (target === 'all') return true;
    if (typeof target !== 'object' || target === null || Array.isArray(target))
        return false;
    const entries = Object.entries(target);
    return (
        entries.length === 1 &&
        (entries[0][0] === 'only' || entries[0][0] === 'except') &&
        Array.isArray(entries[0][1]) &&
        entries[0][1].every((tile: unknown) => typeof tile === 'string')
    );
};

const isWellFormedControl = (
    value: unknown,
): value is DashboardParameterControl => {
    const control = value as DashboardParameterControl;
    return (
        typeof control === 'object' &&
        control !== null &&
        typeof control.id === 'string' &&
        control.id.length > 0 &&
        (control.slug === undefined ||
            (typeof control.slug === 'string' &&
                /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(control.slug))) &&
        (typeof control.label === 'string' || control.label === null) &&
        (control.value === null ||
            typeof control.value === 'string' ||
            typeof control.value === 'number' ||
            (Array.isArray(control.value) &&
                control.value.every(
                    (v) => typeof v === 'string' || typeof v === 'number',
                ))) &&
        typeof control.valueType === 'object' &&
        control.valueType !== null &&
        ['string', 'number', 'date'].includes(control.valueType.type) &&
        typeof control.valueType.multiple === 'boolean' &&
        (control.sectionId === undefined ||
            typeof control.sectionId === 'string') &&
        (control.hidden === undefined || typeof control.hidden === 'boolean') &&
        typeof control.parameters === 'object' &&
        control.parameters !== null &&
        !Array.isArray(control.parameters) &&
        Object.values(control.parameters).every(isTarget)
    );
};

export const getMalformedParameterControlMessages = (
    controls: unknown,
): string[] =>
    Array.isArray(controls)
        ? controls.flatMap((control, index) =>
              isWellFormedControl(control)
                  ? []
                  : [`Parameter control ${index + 1} has an invalid shape`],
          )
        : ['Parameter controls must be a list'];

export const getControlParameterKeys = (
    control: DashboardParameterControl,
): string[] => Object.keys(control.parameters);
export const getControlledKeys = (
    controls: DashboardParameterControl[],
): Set<string> =>
    new Set(
        (Array.isArray(controls)
            ? controls.filter(isWellFormedControl)
            : []
        ).flatMap(getControlParameterKeys),
    );

export const isParameterCompatibleWithValueType = (
    definition: LightdashProjectParameter,
    valueType: DashboardParameterControl['valueType'],
): boolean =>
    (definition.type ?? 'string') === valueType.type &&
    (definition.multiple ?? false) === valueType.multiple;

const isDefault = (target: DashboardParameterTarget) =>
    target === 'all' || 'except' in target;
const includesTile = (target: DashboardParameterTarget, tileUuid: string) =>
    target === 'all' ||
    ('only' in target
        ? target.only.includes(tileUuid)
        : !target.except.includes(tileUuid));

export const getParameterControlSetter = (
    controls: DashboardParameterControl[],
    key: string,
    tileUuid: string,
    userParameterNames: string[] = [],
): DashboardParameterControl | null => {
    if (isSystemKey(key, userParameterNames)) return null;
    return (
        controls.find((control) => {
            if (!Object.hasOwn(control.parameters, key)) return false;
            const target = control.parameters[key];
            return includesTile(target, tileUuid);
        }) ?? null
    );
};

export const getControlTileUuids = ({
    control,
    controls,
    tileParameterReferences,
    userParameterNames = [],
}: {
    control: DashboardParameterControl;
    controls: DashboardParameterControl[];
    tileParameterReferences: Record<string, string[]>;
    userParameterNames?: string[];
}): string[] =>
    [
        ...new Set([
            ...Object.keys(tileParameterReferences),
            ...Object.values(control.parameters).flatMap((target) =>
                target !== 'all' && 'only' in target ? target.only : [],
            ),
        ]),
    ].filter((tileUuid) =>
        Object.entries(control.parameters).some(
            ([key, target]) =>
                ((target !== 'all' && 'only' in target) ||
                    (tileParameterReferences[tileUuid] ?? []).includes(key)) &&
                getParameterControlSetter(
                    controls,
                    key,
                    tileUuid,
                    userParameterNames,
                )?.id === control.id,
        ),
    );

export const pruneParameterControls = (
    controls: DashboardParameterControl[],
    { isTile }: { isTile: (tileUuid: string) => boolean },
): DashboardParameterControl[] =>
    controls.map((control) =>
        !isWellFormedControl(control)
            ? control
            : {
                  ...control,
                  parameters: Object.fromEntries<DashboardParameterTarget>(
                      Object.entries(control.parameters).map(
                          ([key, target]) => {
                              if (target === 'all') return [key, target];
                              if ('only' in target)
                                  return [
                                      key,
                                      {
                                          only: [
                                              ...new Set(
                                                  target.only.filter(isTile),
                                              ),
                                          ],
                                      },
                                  ];
                              const except = [
                                  ...new Set(target.except.filter(isTile)),
                              ];
                              return [key, except.length ? { except } : 'all'];
                          },
                      ),
                  ),
              },
    );

const getControlName = (control: DashboardParameterControl): string =>
    control.label ?? Object.keys(control.parameters)[0] ?? 'control';

export const validateParameterControls = (
    controls: DashboardParameterControl[],
    definitions: ParameterDefinitions = {},
    tileNameOf: (tileUuid: string) => string = (tileUuid) => tileUuid,
): string[] => {
    const malformed = getMalformedParameterControlMessages(controls);
    if (malformed.length) return malformed;
    const messages: string[] = [];
    const ids = new Set<string>();
    const slugs = new Set<string>();
    const defaults = new Map<string, DashboardParameterControl>();
    const explicit = new Map<string, Map<string, DashboardParameterControl>>();
    for (const control of controls) {
        const name = getControlName(control);
        if (ids.has(control.id))
            messages.push(`Parameter control ${name} has a duplicate id`);
        ids.add(control.id);
        if (control.slug !== undefined) {
            if (slugs.has(control.slug))
                messages.push(
                    `Parameter control slug "${control.slug}" is duplicated`,
                );
            slugs.add(control.slug);
        }
        for (const [key, target] of Object.entries(control.parameters)) {
            if (
                definitions[key] &&
                !isParameterCompatibleWithValueType(
                    definitions[key],
                    control.valueType,
                )
            )
                messages.push(
                    `Parameter ${key} does not take the values of control ${name}`,
                );
            if (isDefault(target)) {
                const other = defaults.get(key);
                if (other)
                    messages.push(
                        `Parameter ${key} has default controls ${getControlName(other)} and ${name}`,
                    );
                else defaults.set(key, control);
            } else if ('only' in target) {
                const tiles =
                    explicit.get(key) ??
                    new Map<string, DashboardParameterControl>();
                for (const tileUuid of new Set(target.only)) {
                    const other = tiles.get(tileUuid);
                    if (other)
                        messages.push(
                            `Parameter ${key} on tile ${tileNameOf(tileUuid)} is set by both ${getControlName(other)} and ${name}`,
                        );
                    else tiles.set(tileUuid, control);
                }
                explicit.set(key, tiles);
            }
        }
    }
    for (const [key, tiles] of explicit) {
        const defaultControl = defaults.get(key);
        if (defaultControl) {
            const target = defaultControl.parameters[key];
            const exclusions = new Set(
                target !== 'all' && 'except' in target ? target.except : [],
            );
            for (const [tileUuid, control] of tiles) {
                if (!exclusions.has(tileUuid))
                    messages.push(
                        `Parameter ${key} on tile ${tileNameOf(tileUuid)} is set by both ${getControlName(defaultControl)} and ${getControlName(control)}`,
                    );
            }
        }
    }
    return messages;
};

export const fillParameterControls = ({
    dashboardParameters,
    definitions,
    tileParameterReferences,
    parameterOrder,
    parameterSections,
    userParameterNames = [],
}: {
    dashboardParameters: DashboardParameters;
    definitions: ParameterDefinitions;
    tileParameterReferences: Record<string, string[]>;
    parameterOrder: string[];
    parameterSections: Record<string, string>;
    userParameterNames?: string[];
}): DashboardParameterControl[] => {
    const referenced = [
        ...new Set(Object.values(tileParameterReferences).flat()),
    ].filter((key) => !isSystemKey(key, userParameterNames));
    const rank = (key: string) => {
        const index = parameterOrder.indexOf(key);
        return index === -1 ? parameterOrder.length : index;
    };
    return referenced
        .map((key, appearance) => ({ key, appearance }))
        .sort(
            (a, b) => rank(a.key) - rank(b.key) || a.appearance - b.appearance,
        )
        .map(({ key }) => ({
            id: uuidv4(),
            label: null,
            value: dashboardParameters[key]?.value ?? null,
            valueType: {
                type: definitions[key]?.type ?? 'string',
                multiple: definitions[key]?.multiple ?? false,
            },
            ...(parameterSections[key] !== undefined && {
                sectionId: parameterSections[key],
            }),
            parameters: { [key]: 'all' as const },
        }));
};

export const getTileParameterInputs = ({
    controls,
    tileUuid,
    tileParameterReferences,
    overrides,
    userParameterNames = [],
}: {
    controls: DashboardParameterControl[];
    tileUuid: string;
    tileParameterReferences: Record<string, string[]>;
    overrides: ParametersValuesMap;
    userParameterNames?: string[];
}): Pick<DashboardTileParameterInputs, 'dashboardValues' | 'excludedKeys'> => {
    const validControls = Array.isArray(controls)
        ? controls.filter(isWellFormedControl)
        : [];
    const controlledKeys = new Set(
        validControls.flatMap(getControlParameterKeys),
    );
    const keys = new Set([
        ...(tileParameterReferences[tileUuid] ?? []),
        ...Object.keys(overrides),
        ...controlledKeys,
    ]);
    return [...keys].reduce<
        Pick<DashboardTileParameterInputs, 'dashboardValues' | 'excludedKeys'>
    >(
        (acc, key) => {
            if (isSystemKey(key, userParameterNames)) return acc;
            const setter = getParameterControlSetter(
                validControls,
                key,
                tileUuid,
                userParameterNames,
            );
            if (setter) {
                const value = overrides[key] ?? setter.value;
                if (value !== null) acc.dashboardValues[key] = value;
            } else if (!controlledKeys.has(key) && overrides[key] !== undefined)
                acc.dashboardValues[key] = overrides[key];
            else acc.excludedKeys.push(key);
            return acc;
        },
        { dashboardValues: {}, excludedKeys: [] },
    );
};

export const getParameterMirror = (
    controls: DashboardParameterControl[],
): DashboardParameters => {
    const result: [string, DashboardParameters[string]][] = [];
    const claimed = new Set<string>();
    const wellFormed = Array.isArray(controls)
        ? controls.filter(isWellFormedControl)
        : [];
    for (const defaults of [true, false])
        for (const control of wellFormed) {
            for (const [key, target] of Object.entries(control.parameters)) {
                if (isDefault(target) === defaults && !claimed.has(key)) {
                    claimed.add(key);
                    if (control.value !== null)
                        result.push([
                            key,
                            { parameterName: key, value: control.value },
                        ]);
                }
            }
        }
    return Object.fromEntries(result);
};
