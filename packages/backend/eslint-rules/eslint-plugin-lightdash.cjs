const noDirectAbilityCheck = require('./no-direct-ability-check.js');

module.exports = {
    meta: { name: 'eslint-plugin-lightdash' },
    rules: {
        'no-direct-ability-check': noDirectAbilityCheck,
    },
};
