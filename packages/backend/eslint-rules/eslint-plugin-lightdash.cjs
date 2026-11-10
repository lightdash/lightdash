const noDirectAbilityCheck = require('./no-direct-ability-check.js');

const noDirectWarehouseClient = require('./no-direct-warehouse-client.js');

module.exports = {
    meta: { name: 'eslint-plugin-lightdash' },
    rules: {
        'no-direct-ability-check': noDirectAbilityCheck,
        'no-direct-warehouse-client': noDirectWarehouseClient,
    },
};
