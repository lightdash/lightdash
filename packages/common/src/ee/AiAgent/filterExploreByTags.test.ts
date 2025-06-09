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

    test('should return undefined when AI tags are configured but empty', async () => {
        expect(
            filterExploreByTags({
                availableTags: [],
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
        ).toBeUndefined();
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

    test('should expose all fields when explore is tagged but base table fields lack matching tags', async () => {
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
        ).toStrictEqual(explore);
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
