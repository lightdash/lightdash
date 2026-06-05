import { Command, Option } from 'commander';

const EXTRA_DBT_SUBCOMMANDS = ['build', 'compile', 'run', 'show', 'test'];

const PATH_METAVAR_RE = /<(path|file|dir|directory)>/i;

const BINARY = 'lightdash';

interface ParsedOption {
    long?: string;
    short?: string;
    flag: string;
    description: string;
    choices: readonly string[] | null;
    takesPath: boolean;
}

// Commander 9: `options` is on the instance but not the public type.
function getCmdOptions(cmd: Command): Option[] {
    return (cmd as unknown as { options: Option[] }).options;
}

function parseOption(o: Option): ParsedOption {
    return {
        long: o.long ?? undefined,
        short: o.short ?? undefined,
        flag: o.long || o.short || '',
        description: o.description || '',
        choices: o.argChoices ?? null,
        takesPath: PATH_METAVAR_RE.test(o.flags),
    };
}

function parseOptions(cmd: Command): ParsedOption[] {
    return getCmdOptions(cmd)
        .map(parseOption)
        .filter((p) => p.flag);
}

function visibleSubcommands(cmd: Command): Command[] {
    return cmd.commands.filter((c) => c.name() !== 'completion');
}

function subcommandNames(cmd: Command): string[] {
    const base = visibleSubcommands(cmd).map((c) => c.name());
    if (cmd.name() === 'dbt') {
        return Array.from(new Set([...base, ...EXTRA_DBT_SUBCOMMANDS])).sort();
    }
    return base;
}

function bashValueCases(opts: ParsedOption[], indent: string): string[] {
    const lines: string[] = [];
    const pathPatterns: string[] = [];
    for (const opt of opts) {
        const forms = [opt.short, opt.long].filter((f): f is string =>
            Boolean(f),
        );
        if (forms.length > 0) {
            const pattern = forms.join('|');
            if (opt.choices && opt.choices.length > 0) {
                lines.push(
                    `${indent}${pattern}) COMPREPLY=( $(compgen -W "${opt.choices.join(' ')}" -- "$cur") ); return ;;`,
                );
            } else if (opt.takesPath) {
                pathPatterns.push(pattern);
            }
        }
    }
    if (pathPatterns.length > 0) {
        lines.push(
            `${indent}${pathPatterns.join('|')}) COMPREPLY=( $(compgen -f -- "$cur") ); return ;;`,
        );
    }
    return lines;
}

interface CommandInfo {
    subcommands: string[];
    options: ParsedOption[];
}

function getCommandTree(program: Command): Map<string, CommandInfo> {
    const result = new Map<string, CommandInfo>();
    const visit = (cmd: Command, prefix: string): void => {
        const fullName = prefix ? `${prefix} ${cmd.name()}` : BINARY;
        result.set(fullName, {
            subcommands: subcommandNames(cmd),
            options: parseOptions(cmd),
        });
        for (const sub of visibleSubcommands(cmd)) {
            visit(sub, fullName);
        }
    };
    visit(program, '');
    return result;
}

function bashOptionBlock(parts: string, info: CommandInfo): string {
    const flags = info.options.map((o) => o.flag).join(' ');
    const valueCases = bashValueCases(info.options, '                ');
    if (valueCases.length === 0) {
        return `        ${parts}) opts="${flags}" ;;`;
    }
    return `        ${parts})
            case "$prev" in
${valueCases.join('\n')}
            esac
            opts="${flags}" ;;`;
}

export function generateBashCompletion(program: Command): string {
    const tree = getCommandTree(program);
    const topCommands = visibleSubcommands(program).map((c) => c.name());
    const topOpts = parseOptions(program);

    const subcommandCases: string[] = [];
    const leafOptionBlocks: string[] = [];
    const nestedOptionBlocks: string[] = [];

    for (const [fullName, info] of tree) {
        if (fullName !== BINARY) {
            const parts = fullName.replace(`${BINARY} `, '');
            if (info.subcommands.length > 0) {
                subcommandCases.push(
                    `        ${parts}) COMPREPLY=( $(compgen -W "${info.subcommands.join(' ')}" -- "$cur") ); return ;;`,
                );
            }
            if (info.options.length > 0) {
                const block = bashOptionBlock(parts, info);
                (parts.includes(' ')
                    ? nestedOptionBlocks
                    : leafOptionBlocks
                ).push(block);
            }
        }
    }

    const topValueCases = bashValueCases(topOpts, '            ');
    const topValueBlock =
        topValueCases.length > 0
            ? `\n        case "$prev" in\n${topValueCases.join('\n')}\n        esac`
            : '';
    const topFlags = topOpts.map((o) => o.flag).join(' ');

    return `# bash completion for ${BINARY} CLI
# Generated dynamically from the Commander program tree.
# Install: ${BINARY} completion --shell bash >> ~/.bashrc
#   — or — ${BINARY} completion --shell bash > /etc/bash_completion.d/${BINARY}

_${BINARY}_completions() {
    local cur prev words cword
    if type _init_completion &>/dev/null; then
        _init_completion || return
    else
        COMPREPLY=()
        cur="\${COMP_WORDS[COMP_CWORD]}"
        prev="\${COMP_WORDS[COMP_CWORD-1]}"
        words=("\${COMP_WORDS[@]}")
        cword=$COMP_CWORD
    fi

    local commands="${topCommands.join(' ')}"

    local cmd=""
    local subcmd=""
    for ((i=1; i < cword; i++)); do
        case "\${words[i]}" in
            -*) ;;
            *)
                if [[ -z "$cmd" ]]; then
                    cmd="\${words[i]}"
                elif [[ -z "$subcmd" ]]; then
                    subcmd="\${words[i]}"
                fi
                ;;
        esac
    done

    if [[ -n "$cmd" && -z "$subcmd" ]]; then
        case "$cmd" in
${subcommandCases.join('\n')}
        esac
    fi

    local opts=""
    if [[ -n "$cmd" && -n "$subcmd" ]]; then
        case "$cmd $subcmd" in
${nestedOptionBlocks.join('\n')}
        esac
    elif [[ -n "$cmd" ]]; then
        case "$cmd" in
${leafOptionBlocks.join('\n')}
        esac
    else${topValueBlock}
        opts="$commands ${topFlags}"
    fi

    if [[ "$cur" == -* && -n "$opts" ]]; then
        COMPREPLY=( $(compgen -W "$opts" -- "$cur") )
        return
    elif [[ -z "$cmd" || -n "$opts" ]]; then
        COMPREPLY=( $(compgen -W "$opts" -- "$cur") )
        return
    fi
}

complete -o default -F _${BINARY}_completions ${BINARY}
`;
}

function formatZshOpt(o: ParsedOption): string {
    const desc = o.description
        .replace(/'/g, "'\\''")
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]');
    let action = '';
    if (o.choices && o.choices.length > 0) {
        action = `:value:(${o.choices.join(' ')})`;
    } else if (o.takesPath) {
        action = ':path:_files';
    }
    if (o.short && o.long) {
        return `'(${o.short} ${o.long})'{${o.short},${o.long}}'[${desc}]${action}'`;
    }
    return `'${o.flag}[${desc}]${action}'`;
}

function zshEscape(s: string): string {
    return s.replace(/'/g, "'\\''");
}

export function generateZshCompletion(program: Command): string {
    const commandDescriptions: string[] = [];
    const commandCases: string[] = [];

    for (const cmd of visibleSubcommands(program)) {
        const desc = zshEscape(cmd.description() || cmd.name());
        commandDescriptions.push(`'${cmd.name()}:${desc}'`);

        const subNames = subcommandNames(cmd);
        if (subNames.length > 0) {
            const commanderSubs = new Map(
                cmd.commands.map((s) => [s.name(), s] as const),
            );
            const subDescs = subNames
                .map((name) => {
                    const sub = commanderSubs.get(name);
                    const subDesc = zshEscape(
                        sub ? sub.description() || sub.name() : name,
                    );
                    return `'${name}:${subDesc}'`;
                })
                .join(' ');

            const subCases: string[] = [];
            for (const name of subNames) {
                const sub = commanderSubs.get(name);
                const opts = sub ? parseOptions(sub).map(formatZshOpt) : [];
                const action =
                    opts.length > 0 ? `_arguments -s ${opts.join(' ')} ` : '';
                subCases.push(`                ${name}) ${action};;`);
            }

            commandCases.push(`        ${cmd.name()})
            local -a subcmds
            subcmds=(${subDescs})
            if (( CURRENT == 2 )); then
                _describe 'subcommand' subcmds
            else
                case "$words[2]" in
${subCases.join('\n')}
                esac
            fi
            ;;`);
        } else {
            const opts = parseOptions(cmd).map(formatZshOpt);
            const action =
                opts.length > 0 ? `_arguments -s ${opts.join(' ')} ` : '';
            commandCases.push(`        ${cmd.name()}) ${action};;`);
        }
    }

    const globalOpts = parseOptions(program).map(formatZshOpt);

    return `#compdef ${BINARY}
# zsh completion for ${BINARY} CLI
# Generated dynamically from the Commander program tree.
# Install: ${BINARY} completion --shell zsh > ~/.zsh/completions/_${BINARY}
#   Then ensure ~/.zsh/completions is in your $fpath (add to .zshrc before compinit):
#   fpath=(~/.zsh/completions $fpath)

_${BINARY}() {
    local -a commands
    commands=(
        ${commandDescriptions.join('\n        ')}
    )

    _arguments -s \\
        ${globalOpts.join(' \\\n        ')} \\
        '1:command:->command' \\
        '*::arg:->args'

    case "$state" in
    command)
        _describe '${BINARY} command' commands
        ;;
    args)
        case "$words[1]" in
${commandCases.join('\n')}
        esac
        ;;
    esac
}

_${BINARY} "$@"
`;
}

function fishEscape(s: string): string {
    return s.replace(/'/g, "\\'");
}

function fishOptionLine(scopeFilter: string, opt: ParsedOption): string {
    const parts: string[] = [`-c ${BINARY}`, `-n '${scopeFilter}'`];
    if (opt.long) parts.push(`-l '${opt.long.replace(/^--/, '')}'`);
    if (opt.short) parts.push(`-s '${opt.short.replace(/^-/, '')}'`);
    if (opt.description) parts.push(`-d '${fishEscape(opt.description)}'`);
    if (opt.choices && opt.choices.length > 0) {
        parts.push('-r');
        parts.push(`-a '${opt.choices.join(' ')}'`);
    } else if (opt.takesPath) {
        parts.push('-r');
        parts.push('-F');
    }
    return `complete ${parts.join(' ')}`;
}

export function generateFishCompletion(program: Command): string {
    const lines: string[] = [
        `# fish completion for ${BINARY} CLI`,
        '# Generated dynamically from the Commander program tree.',
        `# Install: ${BINARY} completion --shell fish > ~/.config/fish/completions/${BINARY}.fish`,
        '',
        `complete -c ${BINARY} -f`,
        '',
    ];

    for (const cmd of visibleSubcommands(program)) {
        const desc = (cmd.description() || '').split('\n')[0];
        const descPart = desc ? ` -d '${fishEscape(desc)}'` : '';
        lines.push(
            `complete -c ${BINARY} -n '__fish_use_subcommand' -a '${cmd.name()}'${descPart}`,
        );
    }

    for (const opt of parseOptions(program)) {
        lines.push(fishOptionLine('__fish_use_subcommand', opt));
    }

    lines.push('');

    for (const cmd of visibleSubcommands(program)) {
        const subNames = subcommandNames(cmd);

        if (subNames.length > 0) {
            const commanderSubs = new Map(
                cmd.commands.map((s) => [s.name(), s] as const),
            );

            lines.push(`# ${cmd.name()} subcommands`);
            const notSeenList = subNames.join(' ');
            for (const name of subNames) {
                const sub = commanderSubs.get(name);
                const subDesc = sub
                    ? (sub.description() || '').split('\n')[0]
                    : '';
                const descPart = subDesc ? ` -d '${fishEscape(subDesc)}'` : '';
                lines.push(
                    `complete -c ${BINARY} -n '__fish_seen_subcommand_from ${cmd.name()}; and not __fish_seen_subcommand_from ${notSeenList}' -a '${name}'${descPart}`,
                );
            }

            for (const sub of cmd.commands) {
                const subOpts = parseOptions(sub);
                if (subOpts.length > 0) {
                    lines.push(`# ${cmd.name()} ${sub.name()} options`);
                    const filter = `__fish_seen_subcommand_from ${cmd.name()}; and __fish_seen_subcommand_from ${sub.name()}`;
                    for (const opt of subOpts) {
                        lines.push(fishOptionLine(filter, opt));
                    }
                }
            }
        } else {
            const cmdOpts = parseOptions(cmd);
            if (cmdOpts.length > 0) {
                lines.push(`# ${cmd.name()} options`);
                const filter = `__fish_seen_subcommand_from ${cmd.name()}`;
                for (const opt of cmdOpts) {
                    lines.push(fishOptionLine(filter, opt));
                }
            }
        }
        lines.push('');
    }

    return lines.join('\n');
}

export type Shell = 'bash' | 'zsh' | 'fish';

export function generateCompletion(program: Command, shell: Shell): string {
    switch (shell) {
        case 'bash':
            return generateBashCompletion(program);
        case 'zsh':
            return generateZshCompletion(program);
        case 'fish':
            return generateFishCompletion(program);
        default:
            throw new Error(
                `Unsupported shell: ${shell}. Supported shells: bash, zsh, fish`,
            );
    }
}
