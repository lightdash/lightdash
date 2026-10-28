const isCssVariableKey = (property) =>
    property.type === 'Property' &&
    property.key.type === 'Literal' &&
    typeof property.key.value === 'string' &&
    property.key.value.startsWith('--');

module.exports = {
    meta: {
        type: 'suggestion',
        docs: {
            description:
                'Disallow `style` and `styles` props. Use Mantine style props or a CSS module class.',
        },
        messages: {
            noStyles:
                'Do not use the `styles` prop. Put the rule in a CSS module and pass it via `classNames`.',
            noStyle:
                'Do not use the `style` prop. Use a Mantine style prop (h, w, mt, flex, ...) or a CSS module class. Only `--css-variable` bridges are allowed.',
        },
        schema: [],
    },
    create(context) {
        return {
            JSXAttribute(node) {
                if (node.name.type !== 'JSXIdentifier') return;
                if (node.name.name === 'styles') {
                    context.report({ node, messageId: 'noStyles' });
                    return;
                }
                if (node.name.name !== 'style') return;
                const value = node.value;
                let expression =
                    value && value.type === 'JSXExpressionContainer'
                        ? value.expression
                        : null;
                while (
                    expression &&
                    (expression.type === 'TSAsExpression' ||
                        expression.type === 'TSSatisfiesExpression')
                ) {
                    expression = expression.expression;
                }
                if (
                    expression &&
                    expression.type === 'ObjectExpression' &&
                    expression.properties.length > 0 &&
                    expression.properties.every(isCssVariableKey)
                ) {
                    return;
                }
                context.report({ node, messageId: 'noStyle' });
            },
        };
    },
};
