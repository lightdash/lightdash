'use agent';
import { useModel, useSandbox, useSkill } from '@flue/runtime';
import { exedev } from '../sandboxes/exedev.ts';
import { acquireConversationVm } from '../sandboxes/vm-store.ts';
import chromeDevtools from '../skills/chrome-devtools/SKILL.md';
import prompt from './linear-coder.prompt.md';

const REPO_CWD = '/opt/linear-agent-template/repository';

/**
 * The Lightdash coding agent. Wiring only — the prompt lives in
 * linear-coder.prompt.md and skills in ../skills/, both PR-editable.
 * The conversation's VM is reused across submissions (vm-store.ts);
 * leaked clones are reaped by the TTL sweeper.
 */
export function LinearCoder() {
	useModel('openai/gpt-5.6-sol');
	useSkill(chromeDevtools);
	useSandbox(
		{
			async createSandbox(options) {
				const ssh = { username: 'exedev' };
				const { vm, reused } = await acquireConversationVm(options.id, ssh);
				console.error(
					`[linear-coder] VM ready: name=${vm.name} host=${vm.host} id=${options.id} (${reused ? 'reused' : 'cloned'})`,
				);
				return exedev(vm, ssh).createSandbox(options);
			},
		},
		{ cwd: REPO_CWD },
	);
	return prompt;
}
LinearCoder.agentName = 'linear-coder';
