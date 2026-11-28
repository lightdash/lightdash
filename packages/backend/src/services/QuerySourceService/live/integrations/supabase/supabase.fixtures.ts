/** The `orders` entry of a Data API OpenAPI description, as PostgREST writes it. */
export const ORDERS_TABLE = {
    required: ['id'],
    properties: {
        id: {
            description: 'Note:\nThis is a Primary Key.<pk/>',
            format: 'bigint',
            type: 'integer',
        },
        created_at: {
            default: 'now()',
            format: 'timestamp with time zone',
            type: 'string',
        },
        order_date: { format: 'date', type: 'string' },
        status: { format: 'text', type: 'string', description: 'Order state' },
        amount: { format: 'numeric', type: 'number' },
        is_paid: { format: 'boolean', type: 'boolean' },
        metadata: { format: 'jsonb' },
        tags: { format: 'text[]', type: 'array', items: { type: 'string' } },
        'Customer Name': { format: 'text', type: 'string' },
    },
    type: 'object',
};

export const OPEN_API = {
    swagger: '2.0',
    info: { title: 'standard public schema', version: '12.2.3' },
    paths: { '/': {}, '/orders': {} },
    definitions: {
        orders: ORDERS_TABLE,
        customers: {
            properties: {
                id: { format: 'bigint', type: 'integer' },
                name: { format: 'text', type: 'string' },
            },
        },
    },
};
