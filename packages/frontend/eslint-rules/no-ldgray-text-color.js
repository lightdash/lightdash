const LDGRAY_SHADE = /^ldGray\.(\d)$/;

module.exports = {
    meta: {
        type: 'suggestion',
        docs: {
            description:
                'Disallow hand-picked ldGray text colours. Text is the default colour; secondary text is `c="dimmed"`.',
        },
        messages: {
            noLdGray:
                'Do not hand-pick `c="{{value}}"`. Drop the prop for primary text or use `c="dimmed"` for secondary text.',
        },
        schema: [],
    },
    create(context) {
        return {
            JSXAttribute(node) {
                if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'c')
                    return;
                const value = node.value;
                if (!value || value.type !== 'Literal' || typeof value.value !== 'string')
                    return;
                if (LDGRAY_SHADE.test(value.value)) {
                    context.report({
                        node,
                        messageId: 'noLdGray',
                        data: { value: value.value },
                    });
                }
            },
        };
    },
};
