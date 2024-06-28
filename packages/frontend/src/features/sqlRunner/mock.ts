import { type ApiWarehouseCatalog } from '@lightdash/common';

export const getTables = (): ApiWarehouseCatalog => ({
    status: 'ok',
    results: {
        postgres: {
            jaffle: {
                customers: {},
                events: {},
                generated_a: {},
                orders: {},
                payments: {},
                tracks: {},
                users: {},
            },
        },
    },
});

const allTableFields: Record<
    string,
    {
        status: 'ok';
        results: Record<string, Record<string, Record<string, unknown>>>;
    }
> = {
    customers: {
        status: 'ok',
        results: {
            postgres: {
                jaffle: {
                    customers: {
                        customer_id: 'number',
                        first_name: 'string',
                        last_name: 'string',
                        age: 'number',
                        created: 'timestamp',
                        first_order: 'date',
                        most_recent_order: 'date',
                        number_of_orders: 'number',
                        customer_lifetime_value: 'number',
                        days_between_created_and_first_order: 'number',
                        days_since_last_order: 'number',
                    },
                },
            },
        },
    },
    events: {
        status: 'ok',
        results: {
            postgres: {
                jaffle: {
                    events: {
                        event_id: 'number',
                        timestamp_tz: 'timestamp',
                        timestamp_ntz: 'timestamp',
                        timestamp_ltz: 'timestamp',
                        date: 'date',
                        event: 'string',
                    },
                },
            },
        },
    },
    generated_a: {
        status: 'ok',
        results: {
            postgres: {
                jaffle: {
                    generated_a: {
                        name: 'string',
                        phone: 'string',
                        email: 'string',
                        address: 'string',
                        postalZip: 'string',
                        region: 'string',
                        country: 'string',
                        alphanumeric: 'string',
                        currency: 'number',
                        numberrange: 'number',
                        text: 'string',
                        name1: 'string',
                        email1: 'string',
                        phone1: 'string',
                        address1: 'string',
                        text1: 'string',
                        url: 'string',
                        numberrange1: 'number',
                        numberrange2: 'number',
                        numberrange3: 'number',
                        numberrange4: 'number',
                        numberrange5: 'number',
                        numberrange6: 'number',
                        numberrange7: 'number',
                        primary_key: 'number',
                        foreign_key: 'number',
                        track1: 'string',
                        autoincrement2: 'number',
                        numberrange8: 'number',
                        numberrange9: 'number',
                        numberrange10: 'number',
                        numberrange11: 'number',
                        text2: 'string',
                        date: 'date',
                        date1: 'date',
                        time: 'timestamp',
                        date2: 'date',
                        date3: 'date',
                        date4: 'date',
                        date5: 'date',
                        date6: 'date',
                        date7: 'date',
                        date8: 'date',
                        numberrange12: 'number',
                        numberrange13: 'number',
                        date9: 'date',
                        date10: 'date',
                        numberrange14: 'number',
                        numberrange15: 'number',
                        date11: 'date',
                    },
                },
            },
        },
    },
    orders: {
        status: 'ok',
        results: {
            postgres: {
                jaffle: {
                    orders: {
                        order_id: 'number',
                        customer_id: 'number',
                        order_date: 'date',
                        status: 'string',
                        is_completed: 'boolean',
                        credit_card_amount: 'number',
                        coupon_amount: 'number',
                        bank_transfer_amount: 'number',
                        gift_card_amount: 'number',
                        amount: 'number',
                    },
                },
            },
        },
    },
    payments: {
        status: 'ok',
        results: {
            postgres: {
                jaffle: {
                    payments: {
                        payment_id: 'number',
                        order_id: 'number',
                        payment_method: 'string',
                        amount: 'number',
                    },
                },
            },
        },
    },
    tracks: {
        status: 'ok',
        results: {
            postgres: {
                jaffle: {
                    tracks: {
                        timestamp: 'timestamp',
                        user_id: 'string',
                        id: 'string',
                        event: 'string',
                        context_app_version: 'string',
                        event_text: 'string',
                        timestamp_EST: 'timestamp',
                    },
                },
            },
        },
    },
    users: {
        status: 'ok',
        results: {
            postgres: {
                jaffle: {
                    users: {
                        customer_id: 'number',
                        first_name: 'string',
                        last_name: 'string',
                        created: 'timestamp',
                    },
                },
            },
        },
    },
};

export const getTableFields = (table: keyof typeof allTableFields) =>
    allTableFields[table].results.postgres.jaffle[table];
