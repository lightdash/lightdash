import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import exedev from '@exedev/sdk';
import {
	cloneExeVm,
	deleteExeVm,
	type ExeDevAdapterOptions,
	type ExeDevVm,
	waitForExeVm,
} from './exedev.ts';

/**
 * Persistent conversation → VM binding (app_vm_bindings table in Flue's
 * data/flue.db) plus the acquire logic: reuse the conversation's VM while
 * it's alive, otherwise clone a fresh one and tag it for the TTL sweeper.
 */

export const TEMPLATE_VM = 'ld-linear-agent-template';
export const VM_TAG = 'ldlin-v2';

const DB_FILE = resolve('./data/flue.db');
const REUSE_SSH_TIMEOUT_MS = 20_000;

export interface VmBinding {
	name: string;
	host: string;
	lastUsedAt: number;
}

let dbInstance: DatabaseSync | null = null;

function db(): DatabaseSync {
	if (dbInstance) return dbInstance;
	mkdirSync(dirname(DB_FILE), { recursive: true });
	dbInstance = new DatabaseSync(DB_FILE);
	dbInstance.exec('PRAGMA busy_timeout = 5000');
	dbInstance.exec(`
		CREATE TABLE IF NOT EXISTS app_vm_bindings (
			conversation_id TEXT PRIMARY KEY,
			vm_name TEXT NOT NULL,
			vm_host TEXT NOT NULL,
			last_used_at INTEGER NOT NULL
		)
	`);
	return dbInstance;
}

export function bindVm(conversationId: string, vm: { name: string; host: string }): void {
	db()
		.prepare(
			`INSERT INTO app_vm_bindings (conversation_id, vm_name, vm_host, last_used_at)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT(conversation_id) DO UPDATE
			 SET vm_name = excluded.vm_name, vm_host = excluded.vm_host, last_used_at = excluded.last_used_at`,
		)
		.run(conversationId, vm.name, vm.host, Date.now());
}

export function unbindVm(conversationId: string): void {
	db().prepare('DELETE FROM app_vm_bindings WHERE conversation_id = ?').run(conversationId);
}

export function unbindVmByName(vmName: string): void {
	db().prepare('DELETE FROM app_vm_bindings WHERE vm_name = ?').run(vmName);
}

interface BindingRow {
	conversation_id: string;
	vm_name: string;
	vm_host: string;
	last_used_at: number;
}

export function boundVms(): Record<string, VmBinding> {
	const rows = db()
		.prepare('SELECT conversation_id, vm_name, vm_host, last_used_at FROM app_vm_bindings')
		.all() as unknown as BindingRow[];
	return Object.fromEntries(
		rows.map((row) => [
			row.conversation_id,
			{ name: row.vm_name, host: row.vm_host, lastUsedAt: row.last_used_at },
		]),
	);
}

function apiToken(): string {
	const token = process.env.EXE_API_KEY;
	if (!token) throw new Error('EXE_API_KEY is required');
	return token;
}

/** Fields of `ls --json` we rely on (the SDK's VM type omits tags/created_at). */
export interface ExeVmInfo {
	vm_name: string;
	ssh_dest: string;
	status: string;
	created_at: string;
	tags: string[];
}

export async function listExeVms(): Promise<ExeVmInfo[]> {
	const result = await exedev({ token: apiToken() }).exec('ls --json');
	if (!result.ok) {
		throw new Error(`exe.dev ls failed (${result.status}): ${result.body.slice(0, 200)}`);
	}
	let parsed: { vms?: unknown };
	try {
		parsed = JSON.parse(result.body) as { vms?: unknown };
	} catch {
		throw new Error(`exe.dev ls returned non-JSON: ${result.body.slice(0, 200)}`);
	}
	if (!Array.isArray(parsed.vms)) return [];
	return parsed.vms as ExeVmInfo[];
}

async function tagVm(vmName: string): Promise<void> {
	const result = await exedev({ token: apiToken() }).exec(`tag ${vmName} ${VM_TAG}`);
	if (!result.ok) {
		throw new Error(`exe.dev tag failed (${result.status}): ${result.body.slice(0, 200)}`);
	}
}

async function isVmAlive(binding: VmBinding, ssh: ExeDevAdapterOptions): Promise<boolean> {
	const vms = await listExeVms();
	const info = vms.find((vm) => vm.vm_name === binding.name);
	if (!info || info.status !== 'running') return false;
	try {
		await waitForExeVm({ host: binding.host }, ssh, REUSE_SSH_TIMEOUT_MS);
		return true;
	} catch {
		return false;
	}
}

/**
 * Reuse the conversation's bound VM when it's still running and SSH-able;
 * otherwise rm the dead one (best-effort), clone a fresh VM from the
 * template, tag it for the sweeper, and bind it to the conversation.
 */
export async function acquireConversationVm(
	conversationId: string,
	ssh: ExeDevAdapterOptions,
): Promise<{ vm: ExeDevVm & { name: string }; reused: boolean }> {
	const bound = boundVms()[conversationId];
	if (bound) {
		if (await isVmAlive(bound, ssh)) {
			bindVm(conversationId, bound); // touch lastUsedAt
			return { vm: { name: bound.name, host: bound.host }, reused: true };
		}
		console.error(`[vm-store] bound VM ${bound.name} is gone/dead — re-cloning`);
		await deleteExeVm({ apiToken: apiToken(), name: bound.name }).catch(() => {});
		unbindVm(conversationId);
	}

	const vm = await cloneExeVm({ apiToken: apiToken(), source: TEMPLATE_VM, ssh });
	try {
		await tagVm(vm.name);
	} catch (error) {
		// Untagged clones escape the sweeper — loud, but don't fail the run.
		console.error(
			`[vm-store] WARN: failed to tag ${vm.name} as ${VM_TAG}:`,
			error instanceof Error ? error.message : error,
		);
	}
	bindVm(conversationId, vm);
	return { vm, reused: false };
}
