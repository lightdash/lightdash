/**
 * Responses shaped like HubSpot's documented CRM v3 APIs: the deal
 * properties list and a deals search page.
 */
export const HUBSPOT_DEAL_PROPERTIES = {
    results: [
        {
            name: 'dealname',
            label: 'Deal Name',
            type: 'string',
            fieldType: 'text',
            description: 'The name given to this deal',
            hidden: false,
        },
        {
            name: 'amount',
            label: 'Amount',
            type: 'number',
            fieldType: 'number',
            description: '',
            hidden: false,
        },
        {
            name: 'dealstage',
            label: 'Deal Stage',
            type: 'enumeration',
            fieldType: 'radio',
            description: '',
            hidden: false,
            options: [
                {
                    label: 'Appointment Scheduled',
                    value: 'appointmentscheduled',
                },
                { label: 'Closed Won', value: 'closedwon' },
            ],
        },
        {
            name: 'closedate',
            label: 'Close Date',
            type: 'datetime',
            fieldType: 'date',
            hidden: false,
        },
        {
            name: 'contract_date',
            label: 'Contract date',
            type: 'date',
            fieldType: 'date',
            hidden: false,
        },
        {
            name: 'deal_tags',
            label: 'Tags',
            type: 'enumeration',
            fieldType: 'checkbox',
            hidden: false,
            options: [],
        },
        {
            name: 'hs_is_closed_won',
            label: 'Is Closed Won',
            type: 'bool',
            fieldType: 'booleancheckbox',
            hidden: false,
        },
        {
            name: 'hs_analytics_latest_source_data_1',
            label: 'Latest Source Data 1',
            type: 'string',
            fieldType: 'text',
            hidden: false,
        },
        {
            name: 'count',
            label: 'Count',
            type: 'number',
            fieldType: 'number',
            hidden: false,
        },
        // Read by the declared fields
        { name: 'hs_object_id', label: 'Record ID', type: 'number' },
        { name: 'createdate', label: 'Create Date', type: 'datetime' },
        {
            name: 'hs_lastmodifieddate',
            label: 'Last Modified Date',
            type: 'datetime',
        },
        // Left out: hidden, a type Lightdash doesn't read
        {
            name: 'hs_secret',
            label: 'Secret',
            type: 'string',
            hidden: true,
        },
        { name: 'deal_geo', label: 'Geo', type: 'object_coordinates' },
    ],
};

export const hubspotDeal = (id: string) => ({
    id,
    properties: {
        hs_object_id: id,
        dealname: `Deal ${id}`,
        amount: '1500.5',
        dealstage: 'closedwon',
        closedate: '2026-10-31T12:00:00Z',
        contract_date: '2026-10-01',
        hs_is_closed_won: 'true',
        deal_tags: null,
    },
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    archived: false,
});

export const hubspotSearchPage = (
    deals: unknown[],
    total: number,
    after?: string,
) => ({
    total,
    results: deals,
    ...(after
        ? {
              paging: {
                  next: {
                      after,
                      link: `https://api.hubapi.com/crm/v3/objects/deals/search?after=${after}`,
                  },
              },
          }
        : {}),
});

/** Shaped like HubSpot's documented CRM v3 pipelines responses. */
export const HUBSPOT_DEAL_PIPELINES = {
    results: [
        {
            id: 'renewals',
            label: 'Renewals',
            displayOrder: 1,
            archived: false,
            stages: [
                {
                    id: '1001',
                    label: 'Renewal won',
                    displayOrder: 0,
                    metadata: { isClosed: 'true', probability: '1.0' },
                    archived: false,
                },
            ],
        },
        {
            id: 'default',
            label: 'Sales Pipeline',
            displayOrder: 0,
            archived: false,
            stages: [
                {
                    id: 'closedwon',
                    label: 'Closed Won',
                    displayOrder: 1,
                    metadata: { isClosed: 'true', probability: '1.0' },
                    archived: false,
                },
                {
                    id: 'appointmentscheduled',
                    label: 'Appointment Scheduled',
                    displayOrder: 0,
                    metadata: { isClosed: 'false', probability: '0.2' },
                    archived: false,
                },
            ],
        },
    ],
};

export const HUBSPOT_TICKET_PIPELINES = {
    results: [
        {
            id: '0',
            label: 'Support Pipeline',
            displayOrder: 0,
            archived: false,
            stages: [
                {
                    id: '1',
                    label: 'New',
                    displayOrder: 0,
                    metadata: { ticketState: 'OPEN' },
                    archived: false,
                },
                {
                    id: '4',
                    label: 'Closed',
                    displayOrder: 3,
                    metadata: { ticketState: 'CLOSED' },
                    archived: false,
                },
            ],
        },
    ],
};
