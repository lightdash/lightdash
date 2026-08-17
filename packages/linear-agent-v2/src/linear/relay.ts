import type { ConversationStreamChunk, DispatchReceipt } from '@flue/runtime';
import { AgentRunError, init } from '@flue/runtime';
import { LinearClient } from '@linear/sdk';
import { LinearCoder } from '../agents/linear-coder.ts';
import { publishPullRequest } from '../github/publish.ts';
import { boundVms } from '../sandboxes/vm-store.ts';
import { accessTokenFor } from './tokens.ts';

/**
 * Relays one submission's durable chunk stream to Linear agent activities:
 * reasoning → thought, tool-input → action, settle → response/error.
 * Fire-and-forget from the webhook handler; posts stay ordered via a queue.
 */

const THOUGHT_MAX = 4000;
const ACTION_NAME_MAX = 120;
const ACTION_PARAM_MAX = 4000;

type ActivityContent =
	| { type: 'thought'; body: string }
	| { type: 'action'; action: string; parameter: string; result?: string }
	| { type: 'response'; body: string }
	| { type: 'error'; body: string };

export interface RelayTarget {
	organizationId: string;
	agentSessionId: string;
	conversationId: string;
	receipt: DispatchReceipt;
	issue?: string;
	/** Posted as an immediate thought — covers Linear's 10s first-activity window. */
	announce?: string;
}

function cap(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function stringify(value: unknown): string {
	if (typeof value === 'string') return value;
	try {
		return JSON.stringify(value) ?? '';
	} catch {
		return String(value);
	}
}

export function relaySubmission(target: RelayTarget): void {
	void run(target).catch((error: unknown) => {
		console.error(`[relay] ${target.conversationId} failed:`, error instanceof Error ? error.message : error);
	});
}

async function run(target: RelayTarget): Promise<void> {
	let queue: Promise<void> = Promise.resolve();
	const post = (content: ActivityContent): void => {
		queue = queue.then(async () => {
			const client = new LinearClient({
				accessToken: await accessTokenFor(target.organizationId),
			});
			await client.createAgentActivity({
				agentSessionId: target.agentSessionId,
				content,
			});
		});
		queue = queue.catch((error: unknown) => {
			console.error('[relay] activity post failed:', error instanceof Error ? error.message : error);
		});
	};

	if (target.announce) post({ type: 'thought', body: target.announce });

	const pendingTools = new Map<string, { name: string; parameter: string }>();
	let reasoning = '';
	let lastPosition: { batch: number; index: number } | null = null;

	const flushReasoning = (): void => {
		const body = reasoning.trim();
		reasoning = '';
		if (body) post({ type: 'thought', body: cap(body, THOUGHT_MAX) });
	};

	const onEvent = (chunk: ConversationStreamChunk): void => {
		const { position } = chunk;
		if (
			lastPosition &&
			(position.batch < lastPosition.batch ||
				(position.batch === lastPosition.batch && position.index <= lastPosition.index))
		) {
			return;
		}
		lastPosition = position;

		switch (chunk.type) {
			case 'message-delta':
				if (chunk.kind === 'reasoning') reasoning += chunk.delta;
				break;
			case 'tool-input': {
				flushReasoning();
				const action = cap(chunk.toolName, ACTION_NAME_MAX);
				const parameter = cap(stringify(chunk.input) || '(no input)', ACTION_PARAM_MAX);
				pendingTools.set(chunk.toolCallId, { name: action, parameter });
				post({ type: 'action', action, parameter });
				break;
			}
			case 'tool-output-error': {
				const tool = pendingTools.get(chunk.toolCallId);
				if (tool) {
					post({
						type: 'action',
						action: tool.name,
						parameter: tool.parameter,
						result: cap(`Error: ${chunk.errorText}`, ACTION_PARAM_MAX),
					});
				}
				break;
			}
			case 'message-completed':
				flushReasoning();
				break;
			default:
				break;
		}
	};

	const handle = init(LinearCoder, { id: target.conversationId });
	try {
		const reply = await handle.read(target.receipt, { onEvent });
		flushReasoning();
		const vm = boundVms()[target.conversationId];
		if (!vm) throw new Error('Sandbox VM binding is missing after the agent run');
		post({
			type: 'action',
			action: 'Publishing draft pull request',
			parameter: vm.name,
		});
		const prUrl = await publishPullRequest({
			vm: vm.name,
			host: vm.host,
			issue: target.issue,
		});
		const summary = reply.text.trim() || 'Done — no summary produced.';
		post({
			type: 'response',
			body: `${summary}\n\n[Review the draft pull request](${prUrl})`,
		});
	} catch (error) {
		if (error instanceof AgentRunError && error.outcome === 'aborted') {
			post({ type: 'response', body: 'Stopped at your request.' });
		} else {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[relay] ${target.conversationId} failed: ${message}`);
			post({
				type: 'error',
				body: cap(message, THOUGHT_MAX),
			});
		}
	} finally {
		await queue;
	}
}
