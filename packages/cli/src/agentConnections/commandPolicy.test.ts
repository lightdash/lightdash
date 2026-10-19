import { Command } from 'commander';
import { registerAgentConnectionOption } from '../agentConnectionOption';
import {
    agentCommandUnavailable,
    runWithAgentConnectionSelection,
} from '../credentials';
import { assertAgentCommandAllowed, COMMAND_POLICY } from './commandPolicy';

it('matches the complete registered Commander tree, including groups', async () => {
    let root: Command | undefined;
    const parse = vi
        .spyOn(Command.prototype, 'parseAsync')
        .mockImplementation(function captureRoot(this: Command) {
            root = Object.assign(this, {});
            return new Promise<Command>(() => {});
        });
    try {
        await import('../index');
        expect(root).toBeDefined();
        const paths: string[] = [];
        const walk = (command: Command, prefix: string) => {
            for (const child of command.commands) {
                const name = `${prefix}${child.name()}`;
                paths.push(name);
                walk(child, `${name} `);
            }
        };
        walk(root!, '');
        expect(paths.sort()).toEqual(Object.keys(COMMAND_POLICY).sort());
    } finally {
        parse.mockRestore();
    }
});

it.each(
    Object.entries(COMMAND_POLICY).filter(
        ([, policy]) => policy.disposition === 'refuse',
    ),
)(
    'refuses %s before the action can read, request, spawn or prompt',
    async (name, policy) => {
        const root = new Command();
        registerAgentConnectionOption(root);
        const parts = name.split(' ');
        let leaf = root;
        for (const part of parts) leaf = leaf.command(part);
        const sideEffect = vi.fn();
        leaf.action(sideEffect);
        await expect(
            root.parseAsync(['--agent-connection', 'work', ...parts], {
                from: 'user',
            }),
        ).rejects.toThrow(
            policy.disposition === 'refuse' ? policy.message : '',
        );
        expect(sideEffect).not.toHaveBeenCalled();
        await root.parseAsync(parts, { from: 'user' });
        expect(sideEffect).toHaveBeenCalledOnce();
    },
);

it('fails closed for an unknown command only when selected', () => {
    expect(() =>
        runWithAgentConnectionSelection('work', () =>
            assertAgentCommandAllowed('future'),
        ),
    ).toThrow(agentCommandUnavailable);
    expect(() =>
        runWithAgentConnectionSelection(null, () =>
            assertAgentCommandAllowed('future'),
        ),
    ).not.toThrow();
});

it.each([
    ['deploy', { create: true }, '--create'],
    ['deploy', { source: 'other' }, '--source'],
    ['deploy', { target: 'other' }, '--target'],
    ['download', { organization: true }, '--organization'],
    ['download', { includeSkills: true }, '--include-skills'],
    ['download', { includeAll: true }, '--include-all'],
    ['download', { skills: ['a'] }, '--skills'],
    ['upload', { validate: true }, '--validate'],
    ['upload', { organization: true }, '--organization'],
] as const)(
    'refuses %s mode %j without affecting ordinary calls',
    (name, options, flag) => {
        expect(() =>
            runWithAgentConnectionSelection('work', () =>
                assertAgentCommandAllowed(name, options),
            ),
        ).toThrow(`${flag} is not available with an agent connection.`);
        expect(() =>
            runWithAgentConnectionSelection(null, () =>
                assertAgentCommandAllowed(name, options),
            ),
        ).not.toThrow();
    },
);

it.each([
    'sql',
    'run-chart',
    'warehouse-catalog',
    'deploy',
    'agent status',
    'agent revoke',
    'compile',
    'generate',
    'lint',
    'install-skills',
    'upgrade-check',
])('admits %s with a selection', (name) => {
    expect(() =>
        runWithAgentConnectionSelection('work', () =>
            assertAgentCommandAllowed(name),
        ),
    ).not.toThrow();
});
