import {
    type Account,
    type DashboardFilterInteractivityOptions,
    type FilterDashboardToRule,
    FilterInteractivityValues,
    FilterOperator,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { applyFilterAccess } from './applyFilterAccess';

describe('applyFilterAccess', () => {
    const buildAccount = ({
        isJwt,
        filtering,
    }: {
        isJwt: boolean;
        filtering?: DashboardFilterInteractivityOptions;
    }) =>
        ({
            organization: {
                organizationUuid: 'org-123',
                name: 'Test Org',
                createdAt: new Date(),
            },
            authentication: {
                type: 'session',
            },
            user: {
                id: 'user-123',
                email: 'test@example.com',
                isActive: true,
                abilityRules: [],
                ability: {} as any,
                type: 'registered',
            },
            access: {
                filtering,
            },
            isJwtUser: () => isJwt,
        }) as unknown as Account;

    const mockFilterRules: FilterDashboardToRule[] = [
        {
            id: 'filter-1',
            target: {
                fieldId: 'field-1',
                fieldName: 'field_1',
                tableName: 'table_1',
            },
            operator: FilterOperator.EQUALS,
            values: ['value1'],
            label: 'Filter 1',
        },
        {
            id: 'filter-2',
            target: {
                fieldId: 'field-2',
                fieldName: 'field_2',
                tableName: 'table_1',
            },
            operator: FilterOperator.EQUALS,
            values: ['value2'],
            label: 'Filter 2',
        },
        {
            id: 'filter-3',
            target: {
                fieldId: 'field-3',
                fieldName: 'field_3',
                tableName: 'table_2',
            },
            operator: FilterOperator.EQUALS,
            values: ['value3'],
            label: 'Filter 3',
        },
    ];

    describe('when user is not a JWT user', () => {
        it('should return all filter rules unchanged', () => {
            const account = buildAccount({
                isJwt: false,
            });

            const result = applyFilterAccess(account, mockFilterRules);

            expect(result).toEqual(mockFilterRules);
        });
    });

    describe('when user is a JWT user', () => {
        it('should return only allowed filters when filtering is enabled and allowedFilters is provided', () => {
            const account = buildAccount({
                isJwt: true,
                filtering: {
                    enabled: true,
                    allowedFilters: ['filter-1', 'filter-2'],
                },
            });

            const result = applyFilterAccess(account, mockFilterRules);

            expect(result).toHaveLength(2);
            expect(result).toEqual([mockFilterRules[0], mockFilterRules[1]]);
        });

        it('should return empty array when filtering is enabled is true but no allowedFilters are provided', () => {
            const account = buildAccount({
                isJwt: true,
                filtering: {
                    enabled: true,
                    allowedFilters: [],
                },
            });

            const result = applyFilterAccess(account, mockFilterRules);

            expect(result).toHaveLength(0);
        });

        it('should return empty array when filtering enabled is false', () => {
            const account = buildAccount({
                isJwt: true,
                filtering: {
                    enabled: false,
                    allowedFilters: ['filter-1', 'filter-2'],
                },
            });

            const result = applyFilterAccess(account, mockFilterRules);
            expect(result).toEqual([]);
        });

        it('should return empty array when filtering is undefined', () => {
            const account = buildAccount({
                isJwt: true,
                filtering: undefined,
            });

            const result = applyFilterAccess(account, mockFilterRules);

            expect(result).toEqual([]);
        });

        it('should handle empty filter rules array', () => {
            const account = buildAccount({
                isJwt: true,
                filtering: {
                    enabled: true,
                    allowedFilters: ['filter-1', 'filter-2'],
                },
            });

            const result = applyFilterAccess(account, []);

            expect(result).toEqual([]);
        });
    });

    it('should return all filter rules when filtering is "all"', () => {
        const account = buildAccount({
            isJwt: true,
            filtering: {
                enabled: FilterInteractivityValues.all,
            },
        });

        const result = applyFilterAccess(account, mockFilterRules);
        expect(result).toEqual(mockFilterRules);
    });

    it('should return subset of filter rules when filtering is "some"', () => {
        const account = buildAccount({
            isJwt: true,
            filtering: {
                enabled: FilterInteractivityValues.some,
                allowedFilters: ['filter-1', 'filter-2'],
            },
        });

        const result = applyFilterAccess(account, mockFilterRules);

        expect(result).toHaveLength(2);
        expect(result).toEqual([mockFilterRules[0], mockFilterRules[1]]);
    });
});
