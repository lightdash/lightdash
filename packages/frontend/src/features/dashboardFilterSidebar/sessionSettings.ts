export type SessionPicker = 'standard' | 'calendar' | 'dataDates' | 'list';
export type SessionOperatorsMode = 'all' | 'some' | 'one';
export type SessionPlacement = 'bar' | 'more';

export type FilterSessionSettings = {
    hiddenTabUuids: string[];
    // Used by parameter controls, which have no saved rule to lock
    lockedTabUuids: string[];
    picker: SessionPicker;
    operators: SessionOperatorsMode;
    allowedOperators: string[];
    hasBoundaries: boolean;
    placement: SessionPlacement;
};

export type SessionSettingsByFilterId = Record<string, FilterSessionSettings>;

export const DEFAULT_SESSION_SETTINGS: FilterSessionSettings = {
    hiddenTabUuids: [],
    lockedTabUuids: [],
    picker: 'standard',
    operators: 'all',
    allowedOperators: [],
    hasBoundaries: false,
    placement: 'bar',
};

export const getFilterSessionSettings = (
    all: SessionSettingsByFilterId,
    filterId: string,
): FilterSessionSettings => all[filterId] ?? DEFAULT_SESSION_SETTINGS;

export const patchFilterSessionSettings = (
    all: SessionSettingsByFilterId,
    filterId: string,
    patch: Partial<FilterSessionSettings>,
): SessionSettingsByFilterId => ({
    ...all,
    [filterId]: { ...getFilterSessionSettings(all, filterId), ...patch },
});

export const isHiddenOnTab = (
    settings: FilterSessionSettings,
    tabKey: string,
): boolean => settings.hiddenTabUuids.includes(tabKey);

export const toggleHiddenOnTab = (
    settings: FilterSessionSettings,
    tabKey: string,
): Pick<FilterSessionSettings, 'hiddenTabUuids'> => ({
    hiddenTabUuids: isHiddenOnTab(settings, tabKey)
        ? settings.hiddenTabUuids.filter((uuid) => uuid !== tabKey)
        : [...settings.hiddenTabUuids, tabKey],
});

export const setTabUuids = (
    current: string[],
    tabKeys: string[],
    isOn: boolean,
): string[] => {
    const rest = current.filter((uuid) => !tabKeys.includes(uuid));
    return isOn ? [...rest, ...tabKeys] : rest;
};

export const toggleAllowedOperator = (
    settings: FilterSessionSettings,
    operator: string,
): Pick<FilterSessionSettings, 'allowedOperators'> => {
    if (settings.operators === 'one') return { allowedOperators: [operator] };
    return {
        allowedOperators: settings.allowedOperators.includes(operator)
            ? settings.allowedOperators.filter((o) => o !== operator)
            : [...settings.allowedOperators, operator],
    };
};

export const isPickDefault = (settings: FilterSessionSettings): boolean =>
    settings.picker === 'standard' &&
    settings.operators === 'all' &&
    !settings.hasBoundaries;

type SavedInteractivity = {
    lockedTabUuids?: string[];
    required?: boolean;
    requiredGroupId?: string;
    singleValue?: boolean;
};

export const isWhoChanged = (
    rule: SavedInteractivity,
    settings: FilterSessionSettings,
): boolean =>
    (rule.lockedTabUuids ?? []).length > 0 ||
    settings.hiddenTabUuids.length > 0;

export const isInteractivityChanged = (
    rule: SavedInteractivity,
    settings: FilterSessionSettings,
): boolean =>
    isWhoChanged(rule, settings) ||
    !!rule.required ||
    !!rule.requiredGroupId ||
    !!rule.singleValue ||
    !isPickDefault(settings) ||
    settings.placement !== 'bar';
