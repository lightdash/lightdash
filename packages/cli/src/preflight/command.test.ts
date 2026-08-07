import {
    createPreflightCommand,
    exitCodeForOutcome,
    type PreflightAction,
} from './command';

describe('preflight command arguments', () => {
    it('requires --to', async () => {
        const command = createPreflightCommand(
            vi.fn<PreflightAction>().mockResolvedValue(),
        )
            .exitOverride()
            .configureOutput({ writeErr: () => undefined });

        await expect(
            command.parseAsync(['--facts', 'facts.json'], { from: 'user' }),
        ).rejects.toMatchObject({
            code: 'commander.missingMandatoryOptionValue',
        });
    });

    it('collects repeated --facts values', async () => {
        const action = vi.fn<PreflightAction>().mockResolvedValue();
        const command = createPreflightCommand(action)
            .exitOverride()
            .configureOutput({ writeErr: () => undefined });

        await command.parseAsync(
            [
                '--to',
                '1.79.0',
                '--from',
                '1.78.0',
                '--facts',
                'first.json',
                '--facts',
                'second.json',
            ],
            { from: 'user' },
        );

        expect(action).toHaveBeenCalledWith({
            to: '1.79.0',
            from: '1.78.0',
            facts: ['first.json', 'second.json'],
            intervalSeconds: 10,
            json: false,
        });
    });

    it('leaves --facts empty so the release asset is fetched by default', async () => {
        const action = vi.fn<PreflightAction>().mockResolvedValue();
        const command = createPreflightCommand(action)
            .exitOverride()
            .configureOutput({ writeErr: () => undefined });

        await command.parseAsync(['--to', '1.79.0', '--from', '1.78.0'], {
            from: 'user',
        });

        expect(action).toHaveBeenCalledWith({
            to: '1.79.0',
            from: '1.78.0',
            facts: [],
            intervalSeconds: 10,
            json: false,
        });
    });

    it('requires --from while version derivation is unwired', async () => {
        const command = createPreflightCommand(
            vi.fn<PreflightAction>().mockResolvedValue(),
        )
            .exitOverride()
            .configureOutput({ writeErr: () => undefined });

        await expect(
            command.parseAsync(['--to', '1.79.0'], { from: 'user' }),
        ).rejects.toMatchObject({
            code: 'commander.missingMandatoryOptionValue',
        });
    });
});

describe('exitCodeForOutcome', () => {
    it.each([
        ['ok', 0],
        ['warn', 1],
        ['blocker', 2],
        ['error', 3],
    ] as const)('maps %s to exit code %i', (outcome, exitCode) => {
        expect(exitCodeForOutcome(outcome)).toBe(exitCode);
    });
});
