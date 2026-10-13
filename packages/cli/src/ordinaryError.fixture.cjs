const { Command } = require('commander');
const { LightdashError, AuthorizationError } = require('@lightdash/common');

const original = Command.prototype.action;
Command.prototype.action = function injectOrdinaryError(handler) {
    if (this.name() !== 'list-projects') return original.call(this, handler);
    return original.call(this, () => {
        switch (process.env.CLI_ERROR_CASE) {
            case 'api':
                throw new LightdashError({
                    name: 'ParameterError',
                    message: 'Representative API failure',
                    statusCode: 400,
                    data: {},
                });
            case 'authorization':
                throw new AuthorizationError(
                    'Representative authorization failure',
                );
            default:
                throw new Error('Representative unexpected failure');
        }
    });
};
