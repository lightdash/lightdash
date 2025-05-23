import { produce } from 'immer';
import { AiAgentService } from './AiAgentService';

describe('AiService', () => {
    test('should throw when explore does not have a base table', async () => {
        expect(() =>
            AiAgentService.filterExplore({
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
            AiAgentService.filterExplore({
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
            AiAgentService.filterExplore({
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
            AiAgentService.filterExplore({
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
            AiAgentService.filterExplore({
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
            AiAgentService.filterExplore({
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
            AiAgentService.filterExplore({
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
            AiAgentService.filterExplore({
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
            AiAgentService.filterExplore({
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
            AiAgentService.filterExplore({
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

        expect(
            AiAgentService.filterExplore({
                availableTags: ['ai-enabled'],
                explore,
            }),
        ).toStrictEqual(
            produce(explore, (draft) => {
                // @ts-ignore
                // eslint-disable-next-line no-param-reassign, @typescript-eslint/dot-notation
                delete draft.tables['customers'].dimensions['internal_id'];
                // @ts-ignore
                // eslint-disable-next-line no-param-reassign, @typescript-eslint/dot-notation
                delete draft.tables['customers'].metrics['revenue'];
                // @ts-ignore
                // eslint-disable-next-line no-param-reassign, @typescript-eslint/dot-notation
                delete draft.tables['sales'].metrics['sales_total'];
            }),
        );
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

        expect(
            AiAgentService.filterExplore({
                availableTags: ['ai-enabled'],
                explore,
            }),
        ).toStrictEqual(
            produce(explore, (filteredExplore) => {
                // @ts-ignore
                // eslint-disable-next-line no-param-reassign, @typescript-eslint/dot-notation
                delete filteredExplore.tables['customers'].dimensions[
                    // eslint-disable-next-line @typescript-eslint/dot-notation
                    'internal_id'
                ];
                // @ts-ignore
                // eslint-disable-next-line no-param-reassign, @typescript-eslint/dot-notation
                delete filteredExplore.tables['customers'].metrics['revenue'];
                // @ts-ignore
                // eslint-disable-next-line no-param-reassign, @typescript-eslint/dot-notation
                delete filteredExplore.tables['sales'].metrics['sales_total'];
            }),
        );
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

        const result = AiAgentService.filterExplore({
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
            AiAgentService.filterExplore({
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
            AiAgentService.filterExplore({
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
            AiAgentService.filterExplore({
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
