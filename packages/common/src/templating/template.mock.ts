export const valueMock = {
    raw: 'raw',
    formatted: 'formatted',
};

export const rowMock = {
    customers: {
        customer_id: {
            raw: 'id',
            formatted: 'id',
        },
        last_name: {
            raw: 'last name',
            formatted: 'last name',
        },
    },
};

export const templateWithRawValueReference = {
    template: 'https://example.com/company/${value.raw | url_encode }',
    expectedUrl: 'https://example.com/company/raw',
    expectedRowReferences: [],
};

export const templateWithFormattedValueReference = {
    template: 'https://example.com/company/${value.formatted | url_encode }',
    expectedUrl: 'https://example.com/company/formatted',
    expectedRowReferences: [],
};

export const templateWithRowReference = {
    template:
        'https://example.com/company/${row.customers.customer_id.raw | url_encode }',
    expectedUrl: 'https://example.com/company/id',
    expectedRowReferences: ['customers_customer_id'],
};

export const templateWithMultipleRowReferences = {
    template:
        'https://example.com/company/${row.customers.customer_id.raw | url_encode }/${row.customers.last_name.raw | url_encode }',
    expectedUrl: 'https://example.com/company/id/last+name',
    expectedRowReferences: ['customers_customer_id', 'customers_last_name'],
};

export const templateWithInvalidReference = {
    template:
        'https://example.com/company/${row.customer_id.raw | url_encode }',
    expectedError:
        'Found invalid reference "${row.customer_id.raw | url_encode }" in your url template',
};

export const templateWithRowReferenceAndInvalidReference = {
    template:
        'https://example.com/company/${row.customers.customer_id.raw | url_encode }/${row.customer_id.raw | url_encode }',
    expectedError:
        'Found invalid reference "${row.customer_id.raw | url_encode }" in your url template',
};
