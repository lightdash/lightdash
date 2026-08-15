// flue-blueprint: channel/linear@1
// Adapted: agent-session events only; auth via OAuth token store (actor=app),
// not LINEAR_API_KEY; activity relay is app-owned (src/linear/relay.ts).
import { createLinearChannel, type LinearWebhookPayload } from '@flue/linear';
import { dispatch, init } from '@flue/runtime';
import type { AgentSessionEventWebhookPayload } from '@linear/sdk/webhooks';
import { LinearCoder } from '../agents/linear-coder.ts';
import { relaySubmission } from '../linear/relay.ts';

const organizationId = process.env.LINEAR_ORGANIZATION_ID;
const webhookId = process.env.LINEAR_WEBHOOK_ID;

function isAgentSessionEvent(payload: LinearWebhookPayload): payload is AgentSessionEventWebhookPayload {
	return payload.type === 'AgentSessionEvent' && 'agentSession' in payload;
}

/** Old core.mjs semantics: created → promptContext ⊃ comment ⊃ title; prompted → activity body. */
function extractPrompt(payload: AgentSessionEventWebhookPayload): string {
	if (payload.action === 'created') {
		return payload.promptContext || payload.agentSession.comment?.body || payload.agentSession.issue?.title || '';
	}
	if (payload.action === 'prompted') {
		const content = payload.agentActivity?.content;
		const body = content && typeof content === 'object' ? (content as { body?: unknown }).body : undefined;
		return typeof body === 'string' ? body : '';
	}
	return '';
}

export const channel = createLinearChannel({
	webhookSecret: process.env.LINEAR_WEBHOOK_SECRET ?? 'unconfigured',
	...(organizationId ? { organizationId } : {}),
	...(webhookId ? { webhookId } : {}),

	// Path: /channels/linear/webhook
	async webhook({ payload, deliveryId }) {
		if (!isAgentSessionEvent(payload)) return undefined;
		if (payload.action !== 'created' && payload.action !== 'prompted') return undefined;

		const session = payload.agentSession;
		const conversationId = channel.instanceId({
			type: 'agent-session',
			organizationId: payload.organizationId,
			agentSessionId: session.id,
		});

		if (payload.action === 'prompted' && payload.agentActivity?.signal === 'stop') {
			console.error(`[linear] stop signal for ${session.id} — aborting`);
			await init(LinearCoder, { id: conversationId }).abort();
			return undefined;
		}

		const prompt = extractPrompt(payload);
		if (!prompt) {
			console.error(`[linear] ${payload.action} event for ${session.id} has no prompt — ignored`);
			return undefined;
		}

		const receipt = await dispatch(LinearCoder, {
			id: conversationId,
			idempotencyKey: deliveryId,
			initialData: {
				type: 'agent-session',
				agentSessionId: session.id,
				...(session.issue?.title ? { issueTitle: session.issue.title } : {}),
			},
			message: { kind: 'user', body: prompt },
		});
		if (receipt.deduplicated) return undefined;

		relaySubmission({
			organizationId: payload.organizationId,
			agentSessionId: session.id,
			conversationId,
			receipt,
			...(session.issue?.identifier ? { issue: session.issue.identifier } : {}),
			...(payload.action === 'created'
				? {
						announce: 'Cloning a fresh Lightdash sandbox VM and getting to work.',
					}
				: {}),
		});
		return undefined;
	},
});
