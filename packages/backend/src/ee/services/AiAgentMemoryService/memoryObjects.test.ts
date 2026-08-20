import {
    DimensionType,
    FieldType,
    SupportedDbtAdapter,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { shouldRetireForUnresolvedObjects } from './memoryObjects';

const ordersExplore: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'orders',
    label: 'Orders',
    tags: [],
    spotlight: { visibility: 'show', categories: [] },
    baseTable: 'orders',
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'db',
            schema: 'public',
            sqlTable: 'orders',
            sqlWhere: undefined,
            uncompiledSqlWhere: undefined,
            description: undefined,
            requiredFilters: [],
            dimensions: {
                status: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'status',
                    label: 'Status',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '${TABLE}.status',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'orders.status',
                    tablesReferences: ['orders'],
                    description: undefined,
                },
            },
            metrics: {},
            lineageGraph: {},
        },
    },
};

const brokenExplore: ExploreError = {
    name: 'broken',
    label: 'Broken',
    groupLabel: undefined,
    groups: [],
    errors: [],
};

const explores = { orders: ordersExplore, broken: brokenExplore };

describe('shouldRetireForUnresolvedObjects', () => {
    it('retires when the only named field no longer resolves', () => {
        expect(
            shouldRetireForUnresolvedObjects(
                [
                    {
                        type: 'field',
                        explore: 'orders',
                        fieldId: 'orders_renamed_away',
                    },
                ],
                explores,
            ),
        ).toBe(true);
    });

    it('retires when every named object left the catalog', () => {
        expect(
            shouldRetireForUnresolvedObjects(
                [
                    { type: 'explore', name: 'deleted_explore' },
                    {
                        type: 'field',
                        explore: 'deleted_explore',
                        fieldId: 'deleted_explore_field',
                    },
                ],
                explores,
            ),
        ).toBe(true);
    });

    it('keeps a memory with any resolving object', () => {
        expect(
            shouldRetireForUnresolvedObjects(
                [
                    { type: 'explore', name: 'deleted_explore' },
                    {
                        type: 'field',
                        explore: 'orders',
                        fieldId: 'orders_status',
                    },
                ],
                explores,
            ),
        ).toBe(false);
    });

    it('never retires a memory naming no objects', () => {
        expect(shouldRetireForUnresolvedObjects([], explores)).toBe(false);
    });

    it('treats an errored explore as indeterminate, not gone', () => {
        expect(
            shouldRetireForUnresolvedObjects(
                [
                    {
                        type: 'field',
                        explore: 'broken',
                        fieldId: 'broken_field',
                    },
                ],
                explores,
            ),
        ).toBe(false);
        expect(
            shouldRetireForUnresolvedObjects(
                [{ type: 'explore', name: 'broken' }],
                explores,
            ),
        ).toBe(false);
    });

    it('an errored explore blocks retirement of sibling unresolved objects', () => {
        expect(
            shouldRetireForUnresolvedObjects(
                [
                    { type: 'explore', name: 'deleted_explore' },
                    { type: 'explore', name: 'broken' },
                ],
                explores,
            ),
        ).toBe(false);
    });
});
