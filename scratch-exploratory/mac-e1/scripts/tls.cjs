const cp = require('node:child_process');
const path = require('node:path');
const spawn = cp.spawn;
cp.spawn = function (command, args, options) {
    if (command === 'git' && Array.isArray(args) && args.some((value) =>
        typeof value === 'string' && /^https:\/\/localhost:\d+\/sim\//.test(value))) {
        args = ['-c', `include.path=${path.join(__dirname, 'gitconfig')}`, '-c', 'credential.helper=', ...args];
    }
    return spawn.call(this, command, args, options);
};
