/**
 * ESLint rule: no-direct-ability-check
 *
 * Prevents direct usage of .ability.can() and .ability.cannot() in service files.
 * All permission checks should go through this.createAuditedAbility() to ensure
 * audit logging for compliance.
 *
 * Detects patterns:
 * - user.ability.can(...)
 * - user.ability.cannot(...)
 * - account.user.ability.can(...)
 * - account.user.ability.cannot(...)
 * - actor.ability.can(...)
 * - actor.ability.cannot(...)
 * - *.ability.can(...)  (any object).ability.can/cannot
 */
module.exports = {
    meta: {
        type: 'suggestion',
        docs: {
            description:
                'Disallow direct ability.can/cannot calls in services. Use this.createAuditedAbility() instead for audit logging.',
        },
        messages: {
            noDirectAbilityCheck:
                'Direct ability.can/cannot calls bypass audit logging. Use `const ability = this.createAuditedAbility({{source}});` then `ability.{{method}}(...)` instead.',
        },
        schema: [],
    },
    create(context) {
        return {
            // Match: *.ability.can(...) and *.ability.cannot(...)
            CallExpression(node) {
                const { callee } = node;

                if (
                    callee.type !== 'MemberExpression' ||
                    callee.property.type !== 'Identifier' ||
                    (callee.property.name !== 'can' &&
                        callee.property.name !== 'cannot')
                ) {
                    return;
                }

                // Check that the object is *.ability
                const obj = callee.object;
                if (
                    obj.type !== 'MemberExpression' ||
                    obj.property.type !== 'Identifier' ||
                    obj.property.name !== 'ability'
                ) {
                    return;
                }

                // Determine the source variable name for the error message
                let sourceName = 'accountOrUser';
                const abilityOwner = obj.object;

                if (abilityOwner.type === 'MemberExpression') {
                    // e.g., account.user.ability - source is "account"
                    if (
                        abilityOwner.object.type === 'Identifier' ||
                        abilityOwner.object.type === 'MemberExpression'
                    ) {
                        sourceName =
                            abilityOwner.object.type === 'Identifier'
                                ? abilityOwner.object.name
                                : 'account';
                    }
                } else if (abilityOwner.type === 'Identifier') {
                    // e.g., user.ability - source is "user"
                    sourceName = abilityOwner.name;
                }

                context.report({
                    node,
                    messageId: 'noDirectAbilityCheck',
                    data: {
                        source: sourceName,
                        method: callee.property.name,
                    },
                });
            },
        };
    },
};
