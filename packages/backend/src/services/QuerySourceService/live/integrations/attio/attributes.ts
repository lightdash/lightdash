import { DimensionType, FilterOperator } from '@lightdash/common';

/**
 * How Lightdash reads, filters and sorts one Attio attribute type. A field's
 * API name is the attribute's slug, then `.<property>` when the value keeps
 * what we read in a property of its own (`name.full_name`); compile and run
 * read the property back from the API name.
 */
type AttioAttributeRule = {
    type: DimensionType;
    /** The property of each value to read, when it isn't `value`. */
    property?: AttioValueProperty;
    filterOperators: FilterOperator[];
    /** Attio sorts it itself; the rest is sorted after reading. */
    sortable: boolean;
    /** Ids nobody reads, kept out of the default field list. */
    internal: boolean;
};

export type AttioValueProperty =
    | 'currency_value'
    | 'option'
    | 'status'
    | 'full_name'
    | 'email_address'
    | 'domain'
    | 'original_phone_number'
    | 'address'
    | 'target_record_id'
    | 'referenced_actor_id'
    | 'interacted_at'
    // Derived: when the current status value started, and an owner's name
    | 'active_from'
    | 'member_name';

export const ATTIO_TEXT_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
    FilterOperator.STARTS_WITH,
    FilterOperator.ENDS_WITH,
];

export const ATTIO_NUMBER_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
    FilterOperator.IN_BETWEEN,
];

export const ATTIO_DATE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
];

/** Select and status options match by title, exactly. */
export const ATTIO_CHOICE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
];

export const ATTIO_BOOLEAN_FILTERS = [FilterOperator.EQUALS];

const rule = (
    type: DimensionType,
    overrides: Partial<AttioAttributeRule> = {},
): AttioAttributeRule => ({
    type,
    filterOperators: [],
    sortable: false,
    internal: false,
    ...overrides,
});

/** Every attribute type Attio documents; any other type isn't scanned. */
export const ATTIO_ATTRIBUTE_RULES: Record<string, AttioAttributeRule> = {
    text: rule(DimensionType.STRING, {
        filterOperators: ATTIO_TEXT_FILTERS,
        sortable: true,
    }),
    number: rule(DimensionType.NUMBER, {
        filterOperators: ATTIO_NUMBER_FILTERS,
        sortable: true,
    }),
    rating: rule(DimensionType.NUMBER, {
        filterOperators: ATTIO_NUMBER_FILTERS,
        sortable: true,
    }),
    currency: rule(DimensionType.NUMBER, {
        property: 'currency_value',
        filterOperators: ATTIO_NUMBER_FILTERS,
        sortable: true,
    }),
    date: rule(DimensionType.DATE, {
        filterOperators: ATTIO_DATE_FILTERS,
        sortable: true,
    }),
    timestamp: rule(DimensionType.TIMESTAMP, {
        filterOperators: ATTIO_DATE_FILTERS,
        sortable: true,
    }),
    checkbox: rule(DimensionType.BOOLEAN, {
        filterOperators: ATTIO_BOOLEAN_FILTERS,
        sortable: true,
    }),
    select: rule(DimensionType.STRING, {
        property: 'option',
        filterOperators: ATTIO_CHOICE_FILTERS,
    }),
    status: rule(DimensionType.STRING, {
        property: 'status',
        filterOperators: ATTIO_CHOICE_FILTERS,
    }),
    'personal-name': rule(DimensionType.STRING, {
        property: 'full_name',
        filterOperators: ATTIO_TEXT_FILTERS,
        sortable: true,
    }),
    'email-address': rule(DimensionType.STRING, {
        property: 'email_address',
        filterOperators: ATTIO_TEXT_FILTERS,
    }),
    domain: rule(DimensionType.STRING, {
        property: 'domain',
        filterOperators: ATTIO_TEXT_FILTERS,
    }),
    'phone-number': rule(DimensionType.STRING, {
        property: 'original_phone_number',
    }),
    location: rule(DimensionType.STRING, { property: 'address' }),
    'record-reference': rule(DimensionType.STRING, {
        property: 'target_record_id',
        internal: true,
    }),
    'actor-reference': rule(DimensionType.STRING, {
        property: 'referenced_actor_id',
        internal: true,
    }),
    interaction: rule(DimensionType.TIMESTAMP, {
        property: 'interacted_at',
    }),
};

/**
 * Fields an attribute type adds next to its own, read from the same values.
 * Their names end in `__<suffix>`, which real slugs can't take.
 */
type AttioDerivedField = {
    suffix: string;
    label: (title: string) => string;
    description: (title: string) => string;
    type: DimensionType;
    property: AttioValueProperty;
};

export const ATTIO_DERIVED_FIELDS: Record<string, AttioDerivedField[]> = {
    status: [
        {
            suffix: 'entered_at',
            label: (title) => `${title} entered at`,
            description: (title) =>
                `When the record entered its current ${title}, in UTC.`,
            type: DimensionType.TIMESTAMP,
            property: 'active_from',
        },
    ],
    'actor-reference': [
        {
            suffix: 'name',
            label: (title) => `${title} name`,
            description: (title) =>
                `The name of the workspace member in ${title}. Empty when the access token lacks the user_management:read scope, or when it isn't a member.`,
            type: DimensionType.STRING,
            property: 'member_name',
        },
    ],
};

const INTERNAL_PROPERTIES: ReadonlySet<string> = new Set(
    Object.values(ATTIO_ATTRIBUTE_RULES).flatMap(({ property, internal }) =>
        internal && property ? [property] : [],
    ),
);

/** An attribute's slug and the property of its values that a field reads. */
export const parseAttioApiName = (
    apiName: string,
): { slug: string; property: AttioValueProperty | null } => {
    const [slug, property] = apiName.split('.');
    return {
        slug,
        property: (property as AttioValueProperty | undefined) ?? null,
    };
};

export const toAttioApiName = (slug: string, property?: AttioValueProperty) =>
    property ? `${slug}.${property}` : slug;

export const isInternalAttioField = (apiName: string) => {
    const { property } = parseAttioApiName(apiName);
    return property !== null && INTERNAL_PROPERTIES.has(property);
};

/** Properties whose filters use Attio's shorthand, matching an option's title. */
export const isAttioChoiceProperty = (property: AttioValueProperty | null) =>
    property === 'option' || property === 'status';

/** Properties Attio sorts by as the sort's `field`. */
export const ATTIO_SORT_FIELDS: ReadonlySet<AttioValueProperty> = new Set([
    'currency_value',
    'full_name',
]);
