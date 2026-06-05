import chalk from 'chalk';
import { Command, Option } from 'commander';
import {
    generateBashCompletion,
    generateCompletion,
    generateFishCompletion,
    generateZshCompletion,
} from './completions';

const ESC = String.fromCharCode(27);

function buildStubProgram(): Command {
    const program = new Command();
    program
        .name(chalk.bold.yellowBright('⚡️lightdash'))
        .description('Test CLI')
        .option('--non-interactive', 'disable prompts');

    program
        .command('login [url]')
        .description('Log in')
        .option('--token <token>', 'API token');

    const config = program.command('config').description('Manage config');
    config
        .command('set-project')
        .description('Set active project')
        .option('--name <name>', 'project name');

    const dbt = program.command('dbt').description('Proxy dbt commands');
    dbt.command('run').description('Run dbt').option('--target <name>');

    program
        .command('deploy')
        .description('Deploy')
        .option('--project-dir <path>', 'project dir')
        .option('-o, --output <file>', 'output file')
        .option('--threads <n>', 'thread count');

    program
        .command('install-skills')
        .description('Install skills')
        .addOption(
            new Option('--agent <agent>', 'target agent').choices([
                'claude',
                'cursor',
                'codex',
            ]),
        );

    program
        .command('completion')
        .description('Generate completion script')
        .addOption(
            new Option('-s, --shell <shell>').choices(['bash', 'zsh', 'fish']),
        );

    return program;
}

describe('generateBashCompletion', () => {
    let out: string;
    beforeAll(() => {
        out = generateBashCompletion(buildStubProgram());
    });

    it('does not leak ANSI escape codes from program.name()', () => {
        expect(out).not.toContain(ESC);
    });

    it('routes leaf-command options into the $cmd case', () => {
        expect(out).toContain('login) opts="--token" ;;');
        expect(out).toMatch(
            /elif \[\[ -n "\$cmd" \]\]; then\s+case "\$cmd" in[^]*login\) opts="--token"/,
        );
    });

    it('scopes choices completion inside the owning command branch', () => {
        expect(out).toMatch(
            /install-skills\)\s+case "\$prev" in\s+--agent\) COMPREPLY=\( \$\(compgen -W "claude cursor codex" -- "\$cur"\) \);/,
        );
    });

    it('scopes path completion inside the owning command branch', () => {
        expect(out).toMatch(
            /deploy\)\s+case "\$prev" in\s+[^\n]*-o\|--output[^\n]*compgen -f/,
        );
        expect(out).toMatch(
            /deploy\)\s+case "\$prev" in\s+[^\n]*--project-dir[^\n]*compgen -f/,
        );
    });

    it('triggers value completion on both short and long forms', () => {
        expect(out).toMatch(/-o\|--output\)/);
    });

    it('does not emit file completion for non-path options like --threads', () => {
        expect(out).not.toMatch(/--threads[^\n]*compgen -f/);
    });

    it('merges extra dbt subcommands into the dbt subcommand list', () => {
        expect(out).toContain(
            'dbt) COMPREPLY=( $(compgen -W "build compile run show test" -- "$cur") ); return ;;',
        );
    });

    it('filters the completion command from the top-level command list', () => {
        const match = out.match(/local commands="([^"]*)"/);
        expect(match).not.toBeNull();
        expect(match![1].split(' ')).not.toContain('completion');
    });
});

describe('generateZshCompletion', () => {
    let out: string;
    beforeAll(() => {
        out = generateZshCompletion(buildStubProgram());
    });

    it('does not leak ANSI escape codes', () => {
        expect(out).not.toContain(ESC);
    });

    it('emits a choices action for options with .choices()', () => {
        expect(out).toContain(
            '--agent[target agent]:value:(claude cursor codex)',
        );
    });

    it('emits a _files action for path-typed options', () => {
        expect(out).toContain('--project-dir[project dir]:path:_files');
    });

    it('emits both short and long forms in an exclusive group for options with both', () => {
        expect(out).toContain(
            "'(-o --output)'{-o,--output}'[output file]:path:_files'",
        );
    });

    it('merges extra dbt subcommands into the dbt describe list', () => {
        expect(out).toContain("'build:build'");
        expect(out).toContain("'compile:compile'");
        expect(out).toContain("'show:show'");
        expect(out).toContain("'test:test'");
    });

    it('filters the completion command from top-level descriptions', () => {
        expect(out).not.toMatch(/'completion:/);
    });
});

describe('generateFishCompletion', () => {
    let out: string;
    beforeAll(() => {
        out = generateFishCompletion(buildStubProgram());
    });

    it('does not leak ANSI escape codes', () => {
        expect(out).not.toContain(ESC);
    });

    it('disables file completion globally and re-enables per path-typed option', () => {
        expect(out).toContain('complete -c lightdash -f');
        expect(out).toMatch(/-l 'project-dir'[^\n]* -r -F/);
        expect(out).toMatch(/-l 'output'[^\n]* -r -F/);
    });

    it('emits -a value list for options with .choices()', () => {
        expect(out).toMatch(/-l 'agent'[^\n]* -r -a 'claude cursor codex'/);
    });

    it('does not emit -F for non-path options like --threads', () => {
        expect(out).not.toMatch(/-l 'threads'[^\n]* -F/);
    });

    it('merges extra dbt subcommands as completion entries', () => {
        expect(out).toMatch(/__fish_seen_subcommand_from dbt;[^\n]*-a 'build'/);
        expect(out).toMatch(
            /__fish_seen_subcommand_from dbt;[^\n]*-a 'compile'/,
        );
        expect(out).toMatch(/__fish_seen_subcommand_from dbt;[^\n]*-a 'show'/);
        expect(out).toMatch(/__fish_seen_subcommand_from dbt;[^\n]*-a 'test'/);
    });

    it('filters the completion command from top-level', () => {
        expect(out).not.toMatch(/__fish_use_subcommand'[^\n]*-a 'completion'/);
    });
});

describe('generateCompletion', () => {
    it('throws on unsupported shell', () => {
        expect(() =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            generateCompletion(buildStubProgram(), 'powershell' as any),
        ).toThrow(/Unsupported shell/);
    });
});
