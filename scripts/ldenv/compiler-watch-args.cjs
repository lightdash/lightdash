const compilerWatchArgs = (args, platform) =>
    platform === 'darwin'
        ? [...args, '--excludeDirectories', '**/node_modules']
        : args;

module.exports = { compilerWatchArgs };
