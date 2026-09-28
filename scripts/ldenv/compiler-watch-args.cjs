const compilerWatchArgs = (args, platform) =>
    platform === 'darwin'
        ? [
              ...args,
              '--excludeDirectories',
              '**/node_modules',
              '--excludeFiles',
              '**/node_modules/**',
          ]
        : args;

module.exports = { compilerWatchArgs };
