const { Command } = require('commander');

const original = Command.prototype.action;
Command.prototype.action = function captureSourceSelection(handler) {
    if (
        !['deploy', 'preview', 'start-preview', 'install-skills'].includes(
            this.name(),
        )
    ) {
        return original.call(this, handler);
    }
    return original.call(this, () => {
        process.stdout.write(
            `${JSON.stringify({ command: this.name(), source: this.opts().source ?? null })}\n`,
        );
    });
};
