import {
    AiResultType,
    type Explore,
    SupportedDbtAdapter,
} from '@lightdash/common';
import { translateToolProposeChangeArgs } from './proposeChange';

const mockExplore: Explore = {
    name: 'customers',
    label: 'Customers',
    tags: [],
    baseTable: 'customers',
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    joinedTables: [],
    tables: {
        customers: {
            name: 'customers',
            label: 'Customers',
            database: 'test',
            schema: 'public',
            sqlTable: 'customers',
            lineageGraph: {},
            dimensions: {},
            metrics: {},
        },
    },
};

describe('translateToolProposeChangeArgs', () => {
    it('should translate table update changes', async () => {
        expect(
            await translateToolProposeChangeArgs(
                {
                    entityTableName: 'customers',
                    rationale: 'Update the description of the customers table',
                    change: {
                        value: {
                            type: 'update',
                            patch: {
                                label: { value: 'customers', op: 'replace' },
                                description: {
                                    value: 'Customer records including both B2B and B2C customers',
                                    op: 'replace',
                                },
                            },
                        },
                        entityType: 'table',
                    },
                },
                mockExplore,
                jest.fn(),
            ),
        ).toEqual({
            type: 'update',
            entityType: 'table',
            entityTableName: 'customers',
            entityName: 'customers',
            payload: {
                patches: [
                    {
                        op: 'replace',
                        path: '/label',
                        value: 'customers',
                    },
                    {
                        op: 'replace',
                        path: '/description',
                        value: 'Customer records including both B2B and B2C customers',
                    },
                ],
            },
        });
    });

    it('should translate dimension update changes', async () => {
        expect(
            await translateToolProposeChangeArgs(
                {
                    entityTableName: 'customers',
                    rationale: 'Update the description of the customers table',
                    change: {
                        value: {
                            type: 'update',
                            patch: {
                                label: null,
                                description: {
                                    value: 'Customer records including both B2B and B2C customers',
                                    op: 'replace',
                                },
                            },
                        },
                        entityType: 'dimension',
                        fieldId: 'customer_name',
                    },
                },
                mockExplore,
                jest.fn(),
            ),
        ).toEqual({
            type: 'update',
            entityType: 'dimension',
            entityTableName: 'customers',
            entityName: 'customer_name',
            payload: {
                patches: [
                    {
                        op: 'replace',
                        path: '/description',
                        value: 'Customer records including both B2B and B2C customers',
                    },
                ],
            },
        });
    });

    it('should translate metric update changes', async () => {
        expect(
            await translateToolProposeChangeArgs(
                {
                    entityTableName: 'customers',
                    rationale: 'Update the description of the customers table',
                    change: {
                        value: {
                            type: 'update',
                            patch: {
                                label: null,
                                description: {
                                    value: 'Customer total revenue',
                                    op: 'replace',
                                },
                            },
                        },
                        entityType: 'metric',
                        fieldId: 'customer_total_revenue',
                    },
                },
                mockExplore,
                jest.fn(),
            ),
        ).toEqual({
            type: 'update',
            entityType: 'metric',
            entityTableName: 'customers',
            entityName: 'customer_total_revenue',
            payload: {
                patches: [
                    {
                        op: 'replace',
                        path: '/description',
                        value: 'Customer total revenue',
                    },
                ],
            },
        });
    });
});
