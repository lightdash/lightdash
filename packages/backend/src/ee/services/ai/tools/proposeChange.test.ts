import { AiResultType } from '@lightdash/common';
import { translateToolProposeChangeArgs } from './proposeChange';

describe('translateToolProposeChangeArgs', () => {
    it('should translate table update changes', () => {
        expect(
            translateToolProposeChangeArgs({
                type: AiResultType.PROPOSE_CHANGE,
                entityTableName: 'customers',
                fieldId: 'customer_id',
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
            }),
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

    it('should translate dimension update changes', () => {
        expect(
            translateToolProposeChangeArgs({
                type: AiResultType.PROPOSE_CHANGE,
                entityTableName: 'customers',
                fieldId: 'customer_name',
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
                },
            }),
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

    it('should translate metric update changes', () => {
        expect(
            translateToolProposeChangeArgs({
                type: AiResultType.PROPOSE_CHANGE,
                entityTableName: 'customers',
                fieldId: 'customer_total_revenue',
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
                },
            }),
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
