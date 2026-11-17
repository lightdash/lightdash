/** Synthetic Attio responses for a deals object, shaped like Attio's docs. */

const attribute = (
    slug: string,
    title: string,
    type: string,
    overrides: Record<string, unknown> = {},
) => ({
    id: {
        workspace_id: 'workspace',
        object_id: 'deals',
        attribute_id: `attribute-${slug}`,
    },
    api_slug: slug,
    title,
    description: null,
    type,
    is_system_attribute: false,
    is_writable: true,
    is_required: false,
    is_unique: false,
    is_multiselect: false,
    is_archived: false,
    ...overrides,
});

export const ATTIO_DEAL_ATTRIBUTES = {
    data: [
        attribute('record_id', 'Record ID', 'text', {
            is_system_attribute: true,
        }),
        attribute('created_at', 'Created at', 'timestamp', {
            is_system_attribute: true,
        }),
        attribute('name', 'Deal name', 'text', {
            description: 'What the deal is called.',
        }),
        attribute('stage', 'Deal stage', 'status'),
        attribute('value', 'Deal value', 'currency'),
        attribute('probability', 'Probability', 'number'),
        attribute('close_date', 'Close date', 'date'),
        attribute('is_won', 'Won', 'checkbox'),
        attribute('categories', 'Categories', 'select', {
            is_multiselect: true,
        }),
        attribute('owner', 'Deal owner', 'actor-reference'),
        attribute('associated_company', 'Company', 'record-reference'),
        attribute('point_of_contact', 'Contact', 'personal-name'),
        attribute('contact_email', 'Contact email', 'email-address'),
        attribute('count', 'Count', 'number'),
        attribute('old_field', 'Old field', 'text', { is_archived: true }),
        attribute('mystery', 'Mystery', 'some-new-type'),
    ],
};

const value = (attributeType: string, fields: Record<string, unknown>) => ({
    active_from: '2026-01-01T00:00:00.000000000Z',
    active_until: null,
    created_by_actor: { type: 'workspace-member', id: 'member' },
    attribute_type: attributeType,
    ...fields,
});

export const attioDeal = (
    recordId: string,
    overrides: {
        createdAt?: string;
        stage?: string;
        value?: number | null;
        categories?: string[];
    } = {},
) => ({
    id: {
        workspace_id: 'workspace',
        object_id: 'deals',
        record_id: recordId,
    },
    created_at: overrides.createdAt ?? '2026-11-12T15:30:00.000000000Z',
    web_url: `https://app.attio.com/acme/deals/${recordId}`,
    values: {
        record_id: [value('text', { value: recordId })],
        name: [value('text', { value: `Deal ${recordId}` })],
        stage: [
            value('status', {
                status: {
                    id: { workspace_id: 'workspace', status_id: 'status' },
                    title: overrides.stage ?? 'Won',
                    is_archived: false,
                },
            }),
        ],
        value:
            overrides.value === null
                ? []
                : [
                      value('currency', {
                          currency_value: overrides.value ?? 1000,
                          currency_code: 'USD',
                      }),
                  ],
        probability: [value('number', { value: 0.5 })],
        close_date: [value('date', { value: '2026-12-01' })],
        is_won: [value('checkbox', { value: true })],
        categories: (overrides.categories ?? ['Enterprise', 'EMEA']).map(
            (title) =>
                value('select', {
                    option: { id: {}, title, is_archived: false },
                }),
        ),
        owner: [
            value('actor-reference', {
                referenced_actor_type: 'workspace-member',
                referenced_actor_id: 'member-1',
            }),
        ],
        associated_company: [
            value('record-reference', {
                target_object: 'companies',
                target_record_id: 'company-1',
            }),
        ],
        point_of_contact: [
            value('personal-name', {
                first_name: 'Ada',
                last_name: 'Lovelace',
                full_name: 'Ada Lovelace',
            }),
        ],
        contact_email: [
            {
                ...value('email-address', {
                    email_address: 'old@example.com',
                }),
                active_until: '2026-02-01T00:00:00.000000000Z',
            },
            value('email-address', { email_address: 'ada@example.com' }),
        ],
    },
});
