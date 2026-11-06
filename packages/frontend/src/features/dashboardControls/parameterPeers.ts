import {
    getParameterControlSetter,
    isParameterCompatible,
    isParameterCompatibleWithValueType,
    isReservedParameterName,
    type DashboardParameterControl,
    type DashboardParameterTarget,
    type DashboardTab,
    type DashboardTile,
    type LightdashProjectParameter,
} from '@lightdash/common';
import { type FieldScope, type TabCount, getEffectiveTabUuid } from './peers';

export type TileParameterOption = {
    key: string;
    name: string;
    isCompatible: boolean;
    setByIds: string[];
};

export type ParameterTileCard =
    | { kind: 'set'; keys: string[] }
    | { kind: 'taken'; byId: string }
    | { kind: 'unset' }
    | { kind: 'none' };

export type ParameterTileChange = {
    tileUuid: string;
    key: string | null;
    isMove: boolean;
};

const setTile = (
    target: DashboardParameterTarget,
    tileUuid: string,
    included: boolean,
): DashboardParameterTarget => {
    if (target === 'all') return included ? target : { except: [tileUuid] };
    if ('only' in target) {
        const only = target.only.filter((id) => id !== tileUuid);
        if (included) only.push(tileUuid);
        return { only };
    }
    const except = target.except.filter((id) => id !== tileUuid);
    if (!included) except.push(tileUuid);
    return except.length === 0 ? 'all' : { except };
};

const updateRule = (
    control: DashboardParameterControl,
    key: string,
    tileUuid: string,
    included: boolean,
): DashboardParameterControl => {
    const current = control.parameters[key];
    if (current === undefined && !included) return control;
    const alreadyIncluded =
        current !== undefined &&
        (current === 'all' ||
            ('only' in current
                ? current.only.includes(tileUuid)
                : !current.except.includes(tileUuid)));
    if (current !== undefined && alreadyIncluded === included) return control;
    const target = setTile(current ?? { only: [] }, tileUuid, included);
    return { ...control, parameters: { ...control.parameters, [key]: target } };
};

const compatible = (
    control: DashboardParameterControl,
    definition: LightdashProjectParameter | undefined,
    definitions: Record<string, LightdashProjectParameter>,
): boolean => {
    if (
        !definition ||
        !isParameterCompatibleWithValueType(definition, control.valueType)
    )
        return false;
    return Object.keys(control.parameters).every((key) => {
        const base = definitions[key];
        return base !== undefined && isParameterCompatible(base, definition);
    });
};

/** Each pick owns one key on the tile; a confirmed move updates both owners. */
export const setParameterControlTiles = ({
    controls,
    controlId,
    changes,
    tileParameterReferences,
    definitions,
    userParameterNames,
}: {
    controls: DashboardParameterControl[];
    controlId: string;
    changes: ParameterTileChange[];
    tileParameterReferences: Record<string, string[]>;
    definitions: Record<string, LightdashProjectParameter>;
    userParameterNames: string[];
}): DashboardParameterControl[] =>
    changes.reduce((current, { tileUuid, key, isMove }) => {
        const control = current.find(({ id }) => id === controlId);
        if (!control) return current;
        const references = tileParameterReferences[tileUuid] ?? [];
        if (
            key !== null &&
            (!references.includes(key) ||
                (isReservedParameterName(key) &&
                    !userParameterNames.includes(key)) ||
                (!Object.hasOwn(control.parameters, key) &&
                    !compatible(control, definitions[key], definitions)))
        )
            return current;
        const setter =
            key === null
                ? null
                : getParameterControlSetter(
                      current,
                      key,
                      tileUuid,
                      userParameterNames,
                  );
        if (setter && setter.id !== controlId && !isMove) return current;
        const next = current.map((item) => {
            if (
                setter &&
                item.id === setter.id &&
                item.id !== controlId &&
                key !== null
            ) {
                return updateRule(item, key, tileUuid, false);
            }
            if (item.id !== controlId) return item;
            const isNewKey =
                key !== null && !Object.hasOwn(item.parameters, key);
            const isUnclaimedKey =
                isNewKey &&
                !current.some((other) => Object.hasOwn(other.parameters, key));
            const withKey = isUnclaimedKey
                ? {
                      ...item,
                      parameters: { ...item.parameters, [key]: 'all' as const },
                  }
                : item;
            return [
                ...new Set([
                    ...(key === null
                        ? Object.keys(item.parameters)
                        : references),
                    ...(key === null ? [] : [key]),
                ]),
            ].reduce((draft, candidate) => {
                if (candidate === key)
                    return updateRule(draft, candidate, tileUuid, true);
                return updateRule(draft, candidate, tileUuid, false);
            }, withKey);
        });
        return next.some((item, index) => item !== current[index])
            ? next
            : current;
    }, controls);

/** Clear or restore one key without changing the tile's other assignments. */
export const setParameterKeyTiles = ({
    controls,
    controlId,
    key,
    tileUuids,
    tileParameterReferences,
    included,
    userParameterNames,
}: {
    controls: DashboardParameterControl[];
    controlId: string;
    key: string;
    tileUuids: string[];
    tileParameterReferences: Record<string, string[]>;
    included: boolean;
    userParameterNames: string[];
}): DashboardParameterControl[] =>
    tileUuids.reduce((current, tileUuid) => {
        if (
            !(tileParameterReferences[tileUuid] ?? []).includes(key) ||
            (isReservedParameterName(key) && !userParameterNames.includes(key))
        )
            return current;
        const control = current.find(({ id }) => id === controlId);
        if (!control || !Object.hasOwn(control.parameters, key)) return current;
        const setter = getParameterControlSetter(
            current,
            key,
            tileUuid,
            userParameterNames,
        );
        if (included && setter && setter.id !== controlId) return current;
        if (!included && setter?.id !== controlId) return current;
        const next = current.map((item) =>
            item.id === controlId
                ? updateRule(item, key, tileUuid, included)
                : item,
        );
        return next.some((item, index) => item !== current[index])
            ? next
            : current;
    }, controls);

/** Exclude current layout tiles from every key without requiring discovery. */
export const clearControlFromTiles = ({
    controls,
    controlId,
    tileUuids,
}: {
    controls: DashboardParameterControl[];
    controlId: string;
    tileUuids: string[];
}): DashboardParameterControl[] => {
    const control = controls.find(({ id }) => id === controlId);
    if (!control) return controls;
    const updated = Object.keys(control.parameters).reduce(
        (draft, key) =>
            tileUuids.reduce(
                (next, tileUuid) => updateRule(next, key, tileUuid, false),
                draft,
            ),
        control,
    );
    return updated === control
        ? controls
        : controls.map((item) => (item.id === controlId ? updated : item));
};

export const getTileParameterOptions = ({
    keys,
    definitions,
    control,
    controls,
    tileUuid,
    nameOf,
    userParameterNames,
}: {
    keys: string[];
    definitions: Record<string, LightdashProjectParameter>;
    control: DashboardParameterControl;
    controls: DashboardParameterControl[];
    tileUuid: string;
    base: LightdashProjectParameter | null;
    nameOf: (key: string) => string;
    userParameterNames: string[];
}): TileParameterOption[] =>
    [...new Set(keys)].flatMap((key) => {
        const definition = definitions[key];
        if (
            !definition ||
            (isReservedParameterName(key) && !userParameterNames.includes(key))
        )
            return [];
        const setter = getParameterControlSetter(
            controls,
            key,
            tileUuid,
            userParameterNames,
        );
        return [
            {
                key,
                name: nameOf(key),
                isCompatible: compatible(control, definition, definitions),
                setByIds: setter && setter.id !== control.id ? [setter.id] : [],
            },
        ];
    });

export const getParameterTileCard = ({
    control,
    controls,
    tileUuid,
    options,
    userParameterNames,
}: {
    control: DashboardParameterControl;
    controls: DashboardParameterControl[];
    tileUuid: string;
    options: TileParameterOption[];
    userParameterNames: string[];
}): ParameterTileCard => {
    const keys = options
        .map(({ key }) => key)
        .filter(
            (key) =>
                getParameterControlSetter(
                    controls,
                    key,
                    tileUuid,
                    userParameterNames,
                )?.id === control.id,
        );
    if (keys.length) return { kind: 'set', keys };
    const reachable = options.filter(({ isCompatible }) => isCompatible);
    if (!reachable.length) return { kind: 'none' };
    const taken = reachable.find(({ setByIds }) => setByIds.length);
    return taken
        ? { kind: 'taken', byId: taken.setByIds[0] }
        : { kind: 'unset' };
};

export const getParameterKeyScope = ({
    tileUuids,
    controls,
    tileParameterReferences,
    controlId,
    key,
    userParameterNames,
}: {
    tileUuids: string[];
    controls: DashboardParameterControl[];
    tileParameterReferences: Record<string, string[]>;
    controlId: string;
    key: string;
    userParameterNames: string[];
}): FieldScope => {
    const using = tileUuids.filter((uuid) =>
        (tileParameterReferences[uuid] ?? []).includes(key),
    );
    const setters = using.map((uuid) =>
        getParameterControlSetter(controls, key, uuid, userParameterNames),
    );
    return {
        possible: using.length,
        applied: setters.filter((setter) => setter?.id === controlId).length,
        unfiltered: setters.filter((setter) => setter === null).length,
        replaced: 0,
        replacedFieldIds: [],
    };
};

export const getParameterTabCounts = ({
    tiles,
    tabs,
    isTakeable,
    isSet,
}: {
    tiles: DashboardTile[];
    tabs: DashboardTab[];
    isTakeable: (tileUuid: string) => boolean;
    isSet: (tileUuid: string) => boolean;
}): Record<string, TabCount> =>
    tiles.reduce<Record<string, TabCount>>(
        (acc, tile) => {
            const tabUuid = getEffectiveTabUuid(tile, tabs);
            if (tabUuid === undefined || !isTakeable(tile.uuid)) return acc;
            acc[tabUuid] = {
                total: acc[tabUuid].total + 1,
                applied: acc[tabUuid].applied + (isSet(tile.uuid) ? 1 : 0),
            };
            return acc;
        },
        Object.fromEntries(
            tabs.map((tab) => [tab.uuid, { applied: 0, total: 0 }]),
        ),
    );

export type ParameterMapping = {
    control: DashboardParameterControl;
    name: string;
    controlKeys: string[];
    controls: DashboardParameterControl[];
    tileParameterReferences: Record<string, string[]>;
    userParameterNames: string[];
    nameOf: (key: string) => string;
    controlNameOf: (id: string) => string;
    optionsByTile: Record<string, TileParameterOption[]>;
    cardByTile: Record<string, ParameterTileCard>;
    valueByTile: Record<string, string | null>;
    takeableTileUuids: string[];
    setTileUuids: string[];
};
