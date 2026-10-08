const factoryFunctions = new Set(['warehouseClientFromCredentials']);

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
        const importedNames = new Map();
        const declarators = [];
        const expressions = [];

        const isWarehouseSource = (node) =>
            node?.type === 'Literal' &&
            typeof node.value === 'string' &&
            (node.value === '@lightdash/warehouses' ||
                node.value.startsWith('@lightdash/warehouses/'));

        const staticName = (node, computed = false) => {
            if (!computed && node.type === 'Identifier') return node.name;
            return node.type === 'Literal' && typeof node.value === 'string'
                ? node.value
                : null;
        };

        const resolveVariable = (identifier) => {
            let scope = context.sourceCode.getScope(identifier);
            while (scope) {
                const variable = scope.set.get(identifier.name);
                if (variable) return variable;
                scope = scope.upper;
            }
            return null;
        };

        const importedName = (identifier) => {
            if (importedNames.size === 0) return undefined;
            const variable = resolveVariable(identifier);
            return variable?.identifiers
                .map((binding) => importedNames.get(binding))
                .find((name) => name !== undefined);
        };

        const isWarehouseInitializer = (node) => {
            if (node?.type === 'Identifier') {
                return importedName(node) === '*';
            }
            if (node?.type === 'AwaitExpression') {
                return (
                    node.argument.type === 'ImportExpression' &&
                    isWarehouseSource(node.argument.source)
                );
            }
            return (
                node?.type === 'CallExpression' &&
                node.callee.type === 'Identifier' &&
                node.callee.name === 'require' &&
                !resolveVariable(node.callee) &&
                node.arguments.length === 1 &&
                isWarehouseSource(node.arguments[0])
            );
        };

        const trackDeclarator = (node) => {
            if (
                node.id.type === 'Identifier' &&
                node.init?.type === 'MemberExpression' &&
                node.init.object.type === 'Identifier' &&
                importedName(node.init.object) === '*'
            ) {
                const name = staticName(node.init.property, node.init.computed);
                if (name !== null) importedNames.set(node.id, name);
            } else if (isWarehouseInitializer(node.init)) {
                if (node.id.type === 'Identifier') {
                    importedNames.set(node.id, '*');
                } else if (node.id.type === 'ObjectPattern') {
                    for (const property of node.id.properties) {
                        if (
                            property.type === 'Property' &&
                            property.value.type === 'Identifier'
                        ) {
                            importedNames.set(
                                property.value,
                                staticName(property.key, property.computed),
                            );
                        }
                    }
                }
            }
        };

        const isBanned = (callee, bannedNames) => {
            if (callee.type === 'Identifier') {
                return (
                    bannedNames.has(callee.name) ||
                    bannedNames.has(importedName(callee))
                );
            }
            return (
                callee.type === 'MemberExpression' &&
                callee.object.type === 'Identifier' &&
                importedName(callee.object) === '*' &&
                bannedNames.has(staticName(callee.property, callee.computed))
            );
        };

        return {
            ImportDeclaration(node) {
                if (!isWarehouseSource(node.source)) return;
                for (const specifier of node.specifiers) {
                    if (specifier.type === 'ImportSpecifier') {
                        importedNames.set(
                            specifier.local,
                            staticName(specifier.imported),
                        );
                    } else if (
                        specifier.type === 'ImportNamespaceSpecifier' ||
                        specifier.type === 'ImportDefaultSpecifier'
                    ) {
                        importedNames.set(specifier.local, '*');
                    }
                }
            },
            VariableDeclarator(node) {
                if (node.init) declarators.push(node);
            },
            'CallExpression, NewExpression': (node) => {
                expressions.push(node);
            },
            'Program:exit': () => {
                let previousSize;
                do {
                    previousSize = importedNames.size;
                    declarators.forEach(trackDeclarator);
                } while (importedNames.size > previousSize);

                for (const node of expressions) {
                    const { callee } = node;
                    const isFactoryHelper =
                        node.type === 'CallExpression' &&
                        callee.type === 'MemberExpression' &&
                        staticName(callee.property, callee.computed) ===
                            'getWarehouseClientFromCredentials';
                    if (
                        isFactoryHelper ||
                        isBanned(
                            callee,
                            node.type === 'NewExpression'
                                ? warehouseConstructors
                                : factoryFunctions,
                        )
                    ) {
                        context.report({
                            node,
                            messageId: 'noDirectWarehouseClient',
                        });
                    }
                }
            },
        };
    },
};
