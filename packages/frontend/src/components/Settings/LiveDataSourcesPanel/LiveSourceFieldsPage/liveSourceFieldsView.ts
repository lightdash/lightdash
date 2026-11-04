import {
    ApiConnectorType,
    assertUnreachable,
    type LiveSourceField,
    type LiveSourceFieldChange,
} from '@lightdash/common';

export type FieldsView = 'all' | 'inUse' | 'available';

export type FieldKind = LiveSourceField['kind'];

export type FieldFilters = {
    view: FieldsView;
    search: string;
    kinds: FieldKind[];
    groups: string[];
    showInternal: boolean;
};

export type EditableField = Pick<
    LiveSourceField,
    'label' | 'description' | 'aiHint' | 'group'
>;

export const isFieldsView = (value: string): value is FieldsView =>
    value === 'all' || value === 'inUse' || value === 'available';

export const isFieldKind = (value: string): value is FieldKind =>
    value === 'dimension' || value === 'metric';

/** Fields in the current view, before search and facets narrow them. */
export const getViewFields = (
    fields: LiveSourceField[],
    { view, showInternal }: Pick<FieldFilters, 'view' | 'showInternal'>,
) =>
    fields.filter((field) => {
        if (view === 'inUse' && !field.inUse) {
            return false;
        }
        if (view === 'available' && field.inUse) {
            return false;
        }
        return field.inUse || showInternal || !field.isInternal;
    });

const matchesSearch = (field: LiveSourceField, search: string) => {
    const query = search.trim().toLowerCase();
    return (
        !query ||
        [field.label, field.apiName, field.description].some((text) =>
            text.toLowerCase().includes(query),
        )
    );
};

export const filterFields = (
    viewFields: LiveSourceField[],
    {
        search,
        kinds,
        groups,
    }: Pick<FieldFilters, 'search' | 'kinds' | 'groups'>,
) =>
    viewFields.filter(
        (field) =>
            matchesSearch(field, search) &&
            (kinds.length === 0 || kinds.includes(field.kind)) &&
            (groups.length === 0 ||
                (field.group !== null && groups.includes(field.group))),
    );

export const getGroups = (fields: LiveSourceField[]) =>
    [
        ...new Set(
            fields.flatMap(({ group }) => (group === null ? [] : [group])),
        ),
    ].sort((a, b) => a.localeCompare(b));

/** Only what the admin changed; an emptied text clears the override. */
export const getFieldChange = (
    field: LiveSourceField,
    next: EditableField,
): LiveSourceFieldChange | null => {
    const changedText = (key: 'label' | 'description') =>
        next[key].trim() === field[key] ? {} : { [key]: next[key] };
    const aiHint = next.aiHint?.trim() || null;
    const group = next.group?.trim() || null;
    const change: LiveSourceFieldChange = {
        name: field.name,
        ...changedText('label'),
        ...changedText('description'),
        ...(aiHint === field.aiHint ? {} : { aiHint }),
        ...(group === field.group ? {} : { group }),
    };
    return Object.keys(change).length > 1 ? change : null;
};

export const formatFieldType = (field: LiveSourceField) => {
    const words = field.type.replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
};

export const formatChartCount = (count: number) =>
    `${count} ${count === 1 ? 'chart' : 'charts'}`;

type IntegrationCopy = {
    description: string;
    /** What the integration's own tracking fields are, when it has any. */
    internalFieldsHint: string | null;
};

export const getIntegrationCopy = (
    connector: ApiConnectorType,
): IntegrationCopy => {
    switch (connector) {
        case ApiConnectorType.POSTHOG:
            return {
                description:
                    'Product analytics from PostHog: events, users and their properties.',
                internalFieldsHint:
                    'Properties PostHog adds for its own tracking, like $lib_version',
            };
        case ApiConnectorType.GA4:
            return {
                description:
                    'Website and app analytics from Google Analytics: users, sessions, events and revenue.',
                internalFieldsHint: null,
            };
        case ApiConnectorType.SEARCH_CONSOLE:
            return {
                description:
                    'Google Search performance from Search Console: clicks, impressions and position.',
                internalFieldsHint: null,
            };
        default:
            return assertUnreachable(connector, 'Unknown integration');
    }
};
