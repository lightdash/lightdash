import { type Change, type Changeset } from '../types/changeset';
import { ChangesetUtils } from './changeset';
import { mockCustomersExplore, mockOrdersExplore } from './changeset.mock';

const changeset: Changeset = {
    changesetUuid: 'cs1',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdByUserUuid: 'u1',
    updatedByUserUuid: 'u2',
    projectUuid: 'p1',
    status: 'applied',
    name: 'test',
};

const mockExplores = {
    orders: mockOrdersExplore,
    customers: mockCustomersExplore,
};

describe('ChangesetUtils', () => {
    describe('applyChange', () => {
        describe('update', () => {
            describe('fields', () => {
                it('should update the dimension', () => {
                    expect(
                        mockExplores.orders.tables.orders.dimensions.status
                            .description,
                    ).toEqual('Status of the order');

                    const change: Change = {
                        changeUuid: 'c1',
                        changesetUuid: 'cs1',
                        createdAt: new Date(),
                        createdByUserUuid: 'u1',
                        sourcePromptUuid: 'sp1',
                        type: 'update',
                        entityType: 'dimension',
                        entityName: 'status',
                        payload: {
                            patches: [
                                {
                                    op: 'replace',
                                    path: '/description',
                                    value: 'Status of the order. (Shipped, Completed, Cancelled)',
                                },
                            ],
                        },
                        entityTableName: 'orders',
                    };

                    const patchedExplores = ChangesetUtils.applyChangeset(
                        { ...changeset, changes: [change] },
                        mockExplores,
                    );

                    expect(
                        patchedExplores.orders.tables!.orders.dimensions.status
                            .description,
                    ).toEqual(
                        'Status of the order. (Shipped, Completed, Cancelled)',
                    );
                });

                it('should update the dimension without description and label', () => {
                    expect(
                        mockExplores.orders.tables.orders.dimensions
                            .order_date_month,
                    ).not.toHaveProperty('description');
                    expect(
                        mockExplores.orders.tables.orders.dimensions
                            .order_date_month.label,
                    ).toEqual('');

                    const change: Change = {
                        changeUuid: 'c2',
                        changesetUuid: 'cs1',
                        createdAt: new Date(),
                        createdByUserUuid: 'u1',
                        sourcePromptUuid: 'sp1',
                        type: 'update',
                        entityType: 'dimension',
                        entityName: 'order_date_month',
                        payload: {
                            patches: [
                                {
                                    op: 'replace',
                                    path: '/label',
                                    value: 'Date Month',
                                },
                                {
                                    op: 'add',
                                    path: '/description',
                                    value: 'Date Month of the order (Jan, Feb, Mar, etc.)',
                                },
                            ],
                        },
                        entityTableName: 'orders',
                    };

                    const patchedExplores = ChangesetUtils.applyChangeset(
                        { ...changeset, changes: [change] },
                        mockExplores,
                    );

                    expect(
                        patchedExplores.orders.tables!.orders.dimensions
                            .order_date_month.label,
                    ).toEqual('Date Month');
                    expect(
                        patchedExplores.orders.tables!.orders.dimensions
                            .order_date_month.description,
                    ).toEqual('Date Month of the order (Jan, Feb, Mar, etc.)');
                });

                it('should update the metric', () => {
                    expect(
                        mockExplores.orders.tables.orders.metrics.total_orders
                            .description,
                    ).toEqual('Total orders');

                    const change: Change = {
                        changeUuid: 'c3',
                        changesetUuid: 'cs1',
                        createdAt: new Date(),
                        createdByUserUuid: 'u1',
                        sourcePromptUuid: 'sp1',
                        type: 'update',
                        entityType: 'metric',
                        entityTableName: 'orders',
                        entityName: 'total_orders',
                        payload: {
                            patches: [
                                {
                                    op: 'replace',
                                    path: '/description',
                                    value: 'Total orders - aggregated value',
                                },
                            ],
                        },
                    };

                    const patchedExplores = ChangesetUtils.applyChangeset(
                        { ...changeset, changes: [change] },
                        mockExplores,
                    );

                    expect(
                        patchedExplores.orders.tables!.orders.metrics
                            .total_orders.description,
                    ).toEqual('Total orders - aggregated value');
                });

                it('should update the field in joined tables too', () => {
                    expect(
                        mockExplores.orders.tables.customers.dimensions.id
                            .label,
                    ).toEqual('ID');
                    expect(
                        mockExplores.customers.tables.customers.dimensions.id
                            .label,
                    ).toEqual('ID');

                    const change: Change = {
                        changeUuid: 'c4',
                        changesetUuid: 'cs1',
                        createdAt: new Date(),
                        createdByUserUuid: 'u1',
                        sourcePromptUuid: 'sp1',
                        type: 'update',
                        entityType: 'dimension',
                        entityTableName: 'customers',
                        entityName: 'id',
                        payload: {
                            patches: [
                                {
                                    op: 'replace',
                                    path: '/label',
                                    value: 'ID of the customer',
                                },
                            ],
                        },
                    };

                    const patchedExplores = ChangesetUtils.applyChangeset(
                        { ...changeset, changes: [change] },
                        mockExplores,
                    );

                    expect(
                        patchedExplores.orders.tables!.customers.dimensions.id
                            .label,
                    ).toEqual('ID of the customer');
                    expect(
                        patchedExplores.customers.tables!.customers.dimensions
                            .id.label,
                    ).toEqual('ID of the customer');
                });

                it('should skip the patch if the field is not found in the explore', () => {
                    const change: Change = {
                        changeUuid: 'c5',
                        changesetUuid: 'cs1',
                        createdAt: new Date(),
                        createdByUserUuid: 'u1',
                        sourcePromptUuid: 'sp1',
                        type: 'update',
                        entityType: 'table',
                        entityTableName: 'orders',
                        entityName: 'id_not_found',
                        payload: {
                            patches: [
                                {
                                    op: 'replace',
                                    path: '/description',
                                    value: 'ID of the customer',
                                },
                            ],
                        },
                    };

                    const patchedExplores = ChangesetUtils.applyChangeset(
                        { ...changeset, changes: [change] },
                        mockExplores,
                    );

                    expect(patchedExplores).toStrictEqual(mockExplores);
                });

                it('should skip dimension update if dimension does not exist and not introduce undefined values', () => {
                    // This test ensures that when a changeset tries to update a dimension
                    // that doesn't exist in the explore, the update is skipped entirely
                    // and no undefined value is set in the dimensions object.
                    // This prevents errors like "Cannot read properties of undefined (reading 'table')"
                    // when iterating over dimensions with Object.values().
                    const change: Change = {
                        changeUuid: 'c5b',
                        changesetUuid: 'cs1',
                        createdAt: new Date(),
                        createdByUserUuid: 'u1',
                        sourcePromptUuid: 'sp1',
                        type: 'update',
                        entityType: 'dimension',
                        entityTableName: 'orders',
                        entityName: 'non_existent_dimension',
                        payload: {
                            patches: [
                                {
                                    op: 'replace',
                                    path: '/description',
                                    value: 'This should not be applied',
                                },
                            ],
                        },
                    };

                    const patchedExplores = ChangesetUtils.applyChangeset(
                        { ...changeset, changes: [change] },
                        mockExplores,
                    );

                    // The explores should remain unchanged
                    expect(patchedExplores).toStrictEqual(mockExplores);

                    // Explicitly verify no undefined values exist in dimensions
                    const dimensionValues = Object.values(
                        patchedExplores.orders.tables!.orders.dimensions,
                    );
                    expect(dimensionValues.every((d) => d !== undefined)).toBe(
                        true,
                    );

                    // Verify the non-existent dimension was not added
                    expect(
                        patchedExplores.orders.tables!.orders.dimensions,
                    ).not.toHaveProperty('non_existent_dimension');
                });

                it('should skip metric update if metric does not exist and not introduce undefined values', () => {
                    const change: Change = {
                        changeUuid: 'c5c',
                        changesetUuid: 'cs1',
                        createdAt: new Date(),
                        createdByUserUuid: 'u1',
                        sourcePromptUuid: 'sp1',
                        type: 'update',
                        entityType: 'metric',
                        entityTableName: 'orders',
                        entityName: 'non_existent_metric',
                        payload: {
                            patches: [
                                {
                                    op: 'replace',
                                    path: '/description',
                                    value: 'This should not be applied',
                                },
                            ],
                        },
                    };

                    const patchedExplores = ChangesetUtils.applyChangeset(
                        { ...changeset, changes: [change] },
                        mockExplores,
                    );

                    // The explores should remain unchanged
                    expect(patchedExplores).toStrictEqual(mockExplores);

                    // Explicitly verify no undefined values exist in metrics
                    const metricValues = Object.values(
                        patchedExplores.orders.tables!.orders.metrics,
                    );
                    expect(metricValues.every((m) => m !== undefined)).toBe(
                        true,
                    );

                    // Verify the non-existent metric was not added
                    expect(
                        patchedExplores.orders.tables!.orders.metrics,
                    ).not.toHaveProperty('non_existent_metric');
                });

                it('should skip the patch if the table is not found in the explore', () => {
                    const change: Change = {
                        changeUuid: 'c6',
                        changesetUuid: 'cs1',
                        createdAt: new Date(),
                        createdByUserUuid: 'u1',
                        sourcePromptUuid: 'sp1',
                        type: 'update',
                        entityType: 'table',
                        entityTableName: 'payments',
                        entityName: 'somefield',
                        payload: {
                            patches: [
                                {
                                    op: 'replace',
                                    path: '/description',
                                    value: 'Some field',
                                },
                            ],
                        },
                    };

                    const patchedExplores = ChangesetUtils.applyChangeset(
                        { ...changeset, changes: [change] },
                        mockExplores,
                    );

                    expect(patchedExplores).toStrictEqual(mockExplores);
                });
            });

            describe('tables', () => {
                it('should update the table label', () => {
                    expect(mockExplores.orders.tables.orders.label).toEqual(
                        'Orders',
                    );

                    const change: Change = {
                        changeUuid: 'c7',
                        changesetUuid: 'cs1',
                        createdAt: new Date(),
                        createdByUserUuid: 'u1',
                        sourcePromptUuid: 'sp1',
                        type: 'update',
                        entityType: 'table',
                        entityTableName: 'orders',
                        entityName: 'orders',
                        payload: {
                            patches: [
                                {
                                    op: 'replace',
                                    path: '/label',
                                    value: 'Orders Table',
                                },
                            ],
                        },
                    };

                    const patchedExplores = ChangesetUtils.applyChangeset(
                        { ...changeset, changes: [change] },
                        mockExplores,
                    );

                    expect(patchedExplores.orders.tables!.orders.label).toEqual(
                        'Orders Table',
                    );
                });

                it('should update the joined table properties', () => {
                    expect(
                        mockExplores.orders.tables.customers,
                    ).not.toHaveProperty('description');
                    expect(
                        mockExplores.customers.tables.customers,
                    ).not.toHaveProperty('description');

                    const change: Change = {
                        changeUuid: 'c8',
                        changesetUuid: 'cs1',
                        createdAt: new Date(),
                        createdByUserUuid: 'u1',
                        sourcePromptUuid: 'sp1',
                        type: 'update',
                        entityType: 'table',
                        entityTableName: 'customers',
                        entityName: 'customers',
                        payload: {
                            patches: [
                                {
                                    op: 'add',
                                    path: '/description',
                                    value: 'Customers Table is a table that contains customer information',
                                },
                            ],
                        },
                    };

                    const patchedExplores = ChangesetUtils.applyChangeset(
                        { ...changeset, changes: [change] },
                        mockExplores,
                    );

                    expect(
                        patchedExplores.orders.tables!.customers.description,
                    ).toEqual(
                        'Customers Table is a table that contains customer information',
                    );
                    expect(
                        patchedExplores.customers.tables!.customers.description,
                    ).toEqual(
                        'Customers Table is a table that contains customer information',
                    );
                });
            });
        });
    });
});
