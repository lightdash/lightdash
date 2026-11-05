const noInlineStyleProp = require('./no-inline-style-prop.js');
const noLdGrayTextColor = require('./no-ldgray-text-color.js');

module.exports = {
    meta: { name: 'eslint-plugin-lightdash-ui' },
    rules: {
        'no-inline-style-prop': noInlineStyleProp,
        'no-ldgray-text-color': noLdGrayTextColor,
    },
};
