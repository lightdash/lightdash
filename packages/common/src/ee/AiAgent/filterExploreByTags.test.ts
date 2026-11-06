import { filterExploreByTags } from './filterExploreByTags';

describe('AiService', () => {
    test('should throw when explore does not have a base table', async () => {
        expect(() =>
            filterExploreByTags({
                availableTags: ['ai-enabled'],
                explore: {
                    baseTable: 'customers',
                    tags: ['marketing', 'ai-enabled'],
                    tables: {
                        // customer_data instead of customers
                        customer_data: {
                            dimensions: {},
                            metrics: {},
                        },
                    },
                },
            }),
        ).toThrow('Base table not found');
    });

    test('should return entire explore when no AI tags are configured in settings', async () => {
        expect(
            filterExploreByTags({
                availableTags: null,
                explore: {
                    baseTable: 'customers',
                    tags: [],
                    tables: {
                        customers: {
                            dimensions: {
                                customer_name: {
                                    tags: ['pii'],
                                },
                            },
                            metrics: {
                                revenue: {},
                            },
                        },
                    },
                },
            }),
        ).toBeDefined();
    });

    test('should return entire explore when AI tags are configured but empty', async () => {
        const explore = {
            baseTable: 'customers',
            tags: [],
            tables: {
                customers: {
                    dimensions: {
                        customer_name: {
                            tags: ['pii'],
                        },
                    },
                    metrics: {
                        revenue: {},
                    },
                },
            },
        };
        expect(
            filterExploreByTags({
                availableTags: [],
                explore,
            }),
        ).toStrictEqual(explore);
    });

    test('should return undefined when explore and fields have no matching AI tags', async () => {
        expect(
            filterExploreByTags({
                availableTags: ['ai-enabled'],
                explore: {
                    baseTable: 'customers',
                    tags: [],
                    tables: {
                        customers: {
                            dimensions: {},
                            metrics: {},
                        },
                    },
                },
            }),
        ).toBeUndefined();
    });

    test('should return full explore when explore-level tag matches AI settings', async () => {
        expect(
            filterExploreByTags({
                availableTags: ['marketing', 'ai-enabled'],
                explore: {
                    baseTable: 'customers',
                    tags: ['ai-enabled', 'analytics'],
                    tables: {
                        customers: {
                            dimensions: {},
                            metrics: {},
                        },
                    },
                },
            }),
        ).toBeDefined();
    });

    test('should return explore when any field tag matches AI settings', async () => {
        expect(
            filterExploreByTags({
                availableTags: ['marketing', 'ai-enabled'],
                explore: {
                    baseTable: 'customers',
                    tags: ['analytics'],
                    tables: {
                        customers: {
                            dimensions: {
                                customer_name: {
                                    tags: ['ai-enabled'],
                                },
                            },
                            metrics: {
                                revenue: {
                                    tags: ['internal'],
                                },
                            },
                        },
                    },
                },
            }),
        ).toBeDefined();
    });

    test('should return explore when both explore and field tags match AI settings', async () => {
        expect(
            filterExploreByTags({
                availableTags: ['marketing', 'ai-enabled'],
                explore: {
                    baseTable: 'customers',
                    tags: ['ai-enabled'],
                    tables: {
                        customers: {
                            dimensions: {
                                customer_name: {
                                    tags: ['marketing'],
                                },
                            },
                            metrics: {
                                revenue: {
                                    tags: ['ai-enabled'],
                                },
                            },
                        },
                    },
                },
            }),
        ).toBeDefined();
    });

    test('should return undefined when neither explore nor field tags match AI settings', async () => {
        expect(
            filterExploreByTags({
                availableTags: ['marketing', 'ai-enabled'],
                explore: {
                    baseTable: 'customers',
                    tags: ['analytics'],
                    tables: {
                        customers: {
                            dimensions: {
                                customer_name: {
                                    tags: [],
                                },
                                internal_id: {
                                    tags: ['analytics'],
                                },
                            },
                            metrics: {
                                revenue: {},
                            },
                        },
                    },
                },
            }),
        ).toBeUndefined();
    });

    test('should return undefined when only joined table fields match but base table does not', async () => {
        expect(
            filterExploreByTags({
                availableTags: ['marketing', 'ai-enabled'],
                explore: {
                    baseTable: 'customers',
                    tags: ['analytics'],
                    tables: {
                        customers: {
                            dimensions: {
                                customer_name: {
                                    tags: [],
                                },
                                internal_id: {
                                    tags: ['analytics'],
                                },
                            },
                            metrics: {
                                revenue: {},
                            },
                        },
                        sales: {
                            dimensions: {
                                user_email: {
                                    tags: ['marketing', 'ai-enabled'],
                                },
                            },
                            metrics: {
                                sales_total: {
                                    tags: ['marketing', 'ai-enabled'],
                                },
                            },
                        },
                    },
                },
            }),
        ).toBeUndefined();
    });

    test('should expose all fields when explore is tagged and no fields have tags', async () => {
        const explore = {
            baseTable: 'orders',
            tags: ['ai-enabled'],
            tables: {
                orders: {
                    dimensions: {
                        order_id: {},
                        customer_id: {},
                    },
                    metrics: {
                        total: {},
                    },
                },
                customers: {
                    dimensions: {
                        email: {},
                        phone: {},
                    },
                    metrics: {
                        count: {},
                    },
                },
            },
        };

        expect(
            filterExploreByTags({
                availableTags: ['ai-enabled'],
                explore,
            }),
        ).toStrictEqual(explore);
    });

    test('should use per-table field-level filtering when tables have field tags', async () => {
        const explore = {
            baseTable: 'customers',
            tags: ['ai-enabled'],
            tables: {
                customers: {
                    dimensions: {
                        customer_name: {
                            tags: [],
                        },
                        internal_id: {
                            tags: ['analytics'],
                        },
                    },
                    metrics: {
                        revenue: {},
                    },
                },
                sales: {
                    dimensions: {
                        user_email: {
                            tags: ['marketing', 'ai-enabled'],
                        },
                    },
                    metrics: {
                        sales_total: {
                            tags: ['marketing', 'ai-enabled'],
                        },
                    },
                },
            },
        };

        expect(
            filterExploreByTags({
                availableTags: ['marketing', 'ai-enabled'],
                explore,
            }),
        ).toStrictEqual({
            baseTable: 'customers',
            tags: ['ai-enabled'],
            tables: {
                customers: {
                    dimensions: {},
                    metrics: {},
                },
                sales: {
                    dimensions: {
                        user_email: {
                            tags: ['marketing', 'ai-enabled'],
                        },
                    },
                    metrics: {
                        sales_total: {
                            tags: ['marketing', 'ai-enabled'],
                        },
                    },
                },
            },
        });
    });

    test('should filter fields when explore lacks tags but base table fields have matching tags', async () => {
        const explore = {
            baseTable: 'customers',
            tags: [],
            tables: {
                customers: {
                    dimensions: {
                        customer_name: {
                            tags: ['pii', 'ai-enabled'],
                        },
                        internal_id: {
                            tags: ['pii'],
                        },
                    },
                    metrics: {
                        revenue: {},
                    },
                },
                sales: {
                    dimensions: {
                        user_email: {
                            tags: ['marketing', 'ai-enabled'],
                        },
                    },
                    metrics: {
                        sales_total: {
                            tags: ['marketing'],
                        },
                    },
                },
            },
        };

        const expectedResult = {
            baseTable: 'customers',
            tags: [],
            tables: {
                customers: {
                    dimensions: {
                        customer_name: {
                            tags: ['pii', 'ai-enabled'],
                        },
                    },
                    metrics: {},
                },
                sales: {
                    dimensions: {
                        user_email: {
                            tags: ['marketing', 'ai-enabled'],
                        },
                    },
                    metrics: {},
                },
            },
        };

        expect(
            filterExploreByTags({
                availableTags: ['ai-enabled'],
                explore,
            }),
        ).toStrictEqual(expectedResult);
    });

    test('should filter fields when both explore and base table fields have matching tags', async () => {
        const explore = {
            baseTable: 'customers',
            tags: ['ai-enabled'],
            tables: {
                customers: {
                    dimensions: {
                        customer_name: {
                            tags: ['pii', 'ai-enabled'],
                        },
                        internal_id: {
                            tags: ['pii'],
                        },
                    },
                    metrics: {
                        revenue: {},
                    },
                },
                sales: {
                    dimensions: {
                        user_email: {
                            tags: ['marketing', 'ai-enabled'],
                        },
                    },
                    metrics: {
                        sales_total: {
                            tags: ['marketing'],
                        },
                    },
                },
            },
        };

        const expectedResult = {
            baseTable: 'customers',
            tags: ['ai-enabled'],
            tables: {
                customers: {
                    dimensions: {
                        customer_name: {
                            tags: ['pii', 'ai-enabled'],
                        },
                    },
                    metrics: {},
                },
                sales: {
                    dimensions: {
                        user_email: {
                            tags: ['marketing', 'ai-enabled'],
                        },
                    },
                    metrics: {},
                },
            },
        };

        expect(
            filterExploreByTags({
                availableTags: ['ai-enabled'],
                explore,
            }),
        ).toStrictEqual(expectedResult);
    });

    test('should handle fields with multiple tags where only some match AI settings', async () => {
        const explore = {
            baseTable: 'customers',
            tags: [],
            tables: {
                customers: {
                    dimensions: {
                        customer_name: {
                            tags: ['pii', 'sensitive', 'ai-enabled'],
                        },
                        customer_segment: {
                            tags: ['marketing', 'analytics'],
                        },
                    },
                    metrics: {
                        lifetime_value: {
                            tags: ['ai-enabled', 'finance'],
                        },
                    },
                },
            },
        };

        const result = filterExploreByTags({
            availableTags: ['ai-enabled'],
            explore,
        });

        expect(result?.tables.customers.dimensions).toHaveProperty(
            'customer_name',
        );
        expect(result?.tables.customers.dimensions).not.toHaveProperty(
            'customer_segment',
        );
        expect(result?.tables.customers.metrics).toHaveProperty(
            'lifetime_value',
        );
    });

    test('should use mixed mode per-table (base table no field tags, joined table with field tags)', async () => {
        const explore = {
            baseTable: 'orders',
            tags: ['ai-enabled'],
            tables: {
                orders: {
                    dimensions: {
                        id: {},
                        status: {},
                    },
                    metrics: {
                        total: {},
                    },
                },
                customers: {
                    dimensions: {
                        email: { tags: ['ai-enabled'] },
                        phone: {},
                    },
                    metrics: {},
                },
            },
        };

        expect(
            filterExploreByTags({
                availableTags: ['ai-enabled'],
                explore,
            }),
        ).toStrictEqual({
            baseTable: 'orders',
            tags: ['ai-enabled'],
            tables: {
                orders: {
                    dimensions: {
                        id: {},
                        status: {},
                    },
                    metrics: {
                        total: {},
                    },
                },
                customers: {
                    dimensions: {
                        email: { tags: ['ai-enabled'] },
                    },
                    metrics: {},
                },
            },
        });
    });

    test('should activate field-level mode when field has empty tags array', async () => {
        const explore = {
            baseTable: 'orders',
            tags: ['ai-enabled'],
            tables: {
                orders: {
                    dimensions: {
                        id: { tags: [] },
                        status: {},
                    },
                    metrics: {},
                },
            },
        };

        expect(
            filterExploreByTags({
                availableTags: ['ai-enabled'],
                explore,
            }),
        ).toStrictEqual({
            baseTable: 'orders',
            tags: ['ai-enabled'],
            tables: {
                orders: {
                    dimensions: {},
                    metrics: {},
                },
            },
        });
    });

    test('should handle duplicate tags in available tags list', async () => {
        expect(
            filterExploreByTags({
                availableTags: ['ai-enabled', 'ai-enabled', 'marketing'],
                explore: {
                    baseTable: 'customers',
                    tags: ['ai-enabled'],
                    tables: {
                        customers: {
                            dimensions: {},
                            metrics: {},
                        },
                    },
                },
            }),
        ).toBeDefined();
    });

    test('should handle case where field tags array contains duplicates', async () => {
        expect(
            filterExploreByTags({
                availableTags: ['ai-enabled'],
                explore: {
                    baseTable: 'customers',
                    tags: [],
                    tables: {
                        customers: {
                            dimensions: {
                                customer_name: {
                                    tags: ['ai-enabled', 'ai-enabled', 'pii'],
                                },
                            },
                            metrics: {},
                        },
                    },
                },
            }),
        ).toBeDefined();
    });

    test('should handle multiple joined tables with different tagging modes', async () => {
        const explore = {
            baseTable: 'orders',
            tags: ['ai-enabled'],
            tables: {
                orders: {
                    dimensions: { id: {}, status: {} },
                    metrics: { total: {} },
                },
                customers: {
                    dimensions: {
                        email: { tags: ['ai-enabled'] },
                        phone: {},
                    },
                    metrics: {},
                },
                products: {
                    dimensions: { name: {}, sku: {} },
                    metrics: { price: {} },
                },
            },
        };

        expect(
            filterExploreByTags({
                availableTags: ['ai-enabled'],
                explore,
            }),
        ).toStrictEqual({
            baseTable: 'orders',
            tags: ['ai-enabled'],
            tables: {
                orders: {
                    dimensions: { id: {}, status: {} },
                    metrics: { total: {} },
                },
                customers: {
                    dimensions: { email: { tags: ['ai-enabled'] } },
                    metrics: {},
                },
                products: {
                    dimensions: { name: {}, sku: {} },
                    metrics: { price: {} },
                },
            },
        });
    });

    test('should handle table with only metrics tagged', async () => {
        const explore = {
            baseTable: 'orders',
            tags: [],
            tables: {
                orders: {
                    dimensions: {},
                    metrics: {
                        total: { tags: ['ai-enabled'] },
                        count: { tags: [] },
                    },
                },
            },
        };

        expect(
            filterExploreByTags({
                availableTags: ['ai-enabled'],
                explore,
            }),
        ).toStrictEqual({
            baseTable: 'orders',
            tags: [],
            tables: {
                orders: {
                    dimensions: {},
                    metrics: {
                        total: { tags: ['ai-enabled'] },
                    },
                },
            },
        });
    });

    test('should return undefined when base table has no dimensions or metrics', async () => {
        expect(
            filterExploreByTags({
                availableTags: ['ai-enabled'],
                explore: {
                    baseTable: 'empty_table',
                    tags: [],
                    tables: {
                        empty_table: {
                            dimensions: {},
                            metrics: {},
                        },
                    },
                },
            }),
        ).toBeUndefined();
    });
});
