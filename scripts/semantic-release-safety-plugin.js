const { execFileSync } = require('child_process');
const fs = require('fs');

async function prepare(_pluginConfig, context) {
    let section;
    try {
        if (!fs.existsSync('release-safety.json')) {
            throw new Error('release-safety.json was not generated');
        }
        section = execFileSync(
            'pnpm',
            [
                'exec',
                'tsx',
                'scripts/release-safety-notes.ts',
                '--marker',
                'release-safety.json',
            ],
            { encoding: 'utf-8' },
        );
    } catch (error) {
        context.logger.error(
            `Release-safety notes degraded: ${error instanceof Error ? error.message : String(error)}`,
        );
        section =
            '## Upgrade safety\n\n**Safety unknown — treat as unsafe.** Recommended strategy: **Recreate**.\n';
    }
    context.nextRelease.notes = `${(context.nextRelease.notes ?? '').trim()}\n\n${section.trim()}\n`;
}

module.exports = { prepare };
