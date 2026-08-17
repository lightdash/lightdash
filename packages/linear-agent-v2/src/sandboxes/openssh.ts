function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function sshIdentityArgs(keyPath: string): string[] {
	return [
		'-i',
		keyPath,
		'-o',
		'IdentitiesOnly=yes',
		'-o',
		'IdentityAgent=none',
		'-o',
		'StrictHostKeyChecking=accept-new',
		'-o',
		'BatchMode=yes',
	];
}

export function sshArgs(keyPath: string, host: string, command: readonly string[]): string[] {
	return [...sshIdentityArgs(keyPath), `exedev@${host}`, command.map(shellQuote).join(' ')];
}

export function gitSshCommand(keyPath: string): string {
	return ['ssh', ...sshIdentityArgs(keyPath)].map(shellQuote).join(' ');
}
