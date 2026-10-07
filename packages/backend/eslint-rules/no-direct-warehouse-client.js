const factoryFunctions = new Set([
    'warehouseClientFromCredentials',
    'createAnalyticsClient',
]);

const warehouseConstructors = new Set([
    'SshTunnel',
    'ListedDatabasesPostgresWarehouseClient',
    'SnowflakeWarehouseClient',
    'PostgresWarehouseClient',
    'RedshiftWarehouseClient',
    'BigqueryWarehouseClient',
    'DatabricksWarehouseClient',
    'TrinoWarehouseClient',
    'ClickhouseWarehouseClient',
    'AthenaWarehouseClient',
]);

module.exports = {
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Build warehouse clients through the scoped factory.',
        },
        messages: {
            noDirectWarehouseClient:
                'build warehouse clients through WarehouseClientFactory.withWarehouseClient',
        },
        schema: [],
    },
    create(context) {
        return {
            CallExpression(node) {
                const { callee } = node;
                if (
                    (callee.type === 'Identifier' &&
                        factoryFunctions.has(callee.name)) ||
                    (callee.type === 'MemberExpression' &&
                        callee.property.type === 'Identifier' &&
                        callee.property.name ===
                            'getWarehouseClientFromCredentials')
                ) {
                    context.report({
                        node,
                        messageId: 'noDirectWarehouseClient',
                    });
                }
            },
            NewExpression(node) {
                if (
                    node.callee.type === 'Identifier' &&
                    warehouseConstructors.has(node.callee.name)
                ) {
                    context.report({
                        node,
                        messageId: 'noDirectWarehouseClient',
                    });
                }
            },
        };
    },
};
