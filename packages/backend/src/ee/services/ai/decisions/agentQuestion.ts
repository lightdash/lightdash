import type { AiAgentArgs } from '../types/aiAgent';

export type AgentDecisionContext = {
    messages: { role: 'user' | 'assistant'; text: string }[];
    instruction: string | null;
    compactionSummary: string | null;
    references?: { label: string; content: string }[];
    incomplete: boolean;
};

/** Carry complete recent text, including pinned runtime overrides, without
 * copying tool-call inputs or tool results. Omitted context is explicit so an
 * absence of evidence cannot become a demand for clarification. */
export const getAgentDecisionContext = (
    args: Pick<
        AiAgentArgs,
        'messageHistory' | 'agentSettings' | 'compactionSummary'
    > &
        Partial<
            Pick<
                AiAgentArgs,
                | 'projectContextEnabled'
                | 'projectContext'
                | 'knowledgeDocuments'
                | 'execution'
            >
        >,
): AgentDecisionContext => {
    const textMessages = args.messageHistory.flatMap((message) => {
        if (message.role !== 'user' && message.role !== 'assistant') return [];
        const text =
            typeof message.content === 'string'
                ? message.content
                : message.content
                      .filter((part) => part.type === 'text')
                      .map((part) => part.text)
                      .join('\n');
        return text ? [{ role: message.role, text }] : [];
    });
    const recent = textMessages.slice(-8);
    let remaining = 12_000;
    let incomplete = textMessages.length > recent.length;
    const messages = [...recent]
        .reverse()
        .filter(({ text }) => {
            if (text.length > remaining) {
                incomplete = true;
                return false;
            }
            remaining -= text.length;
            return true;
        })
        .reverse();
    const bounded = (text: string | null | undefined) => {
        if (!text) return null;
        if (text.length > 4_000) {
            incomplete = true;
            return null;
        }
        return text;
    };
    const instruction = bounded(args.agentSettings?.instruction);
    const compactionSummary = bounded(args.compactionSummary);
    const allowlist =
        args.execution?.mode === 'standard'
            ? args.execution.toolAllowlist
            : undefined;
    const projectReferences =
        args.projectContextEnabled &&
        (!allowlist || allowlist.has('loadProjectContext'))
            ? (args.projectContext ?? []).map((entry) => ({
                  label: `Project ${entry.kind}: ${entry.id}`,
                  content: entry.content,
              }))
            : [];
    const loadedDocuments = (args.knowledgeDocuments ?? []).flatMap(
        (document) =>
            document.content
                ? [
                      {
                          label: `Document: ${document.name}`,
                          content: document.content,
                      },
                  ]
                : [],
    );
    let referenceBudget = 8_000;
    const references = [...projectReferences, ...loadedDocuments].filter(
        (reference) => {
            const size = reference.label.length + reference.content.length;
            if (size > referenceBudget) {
                incomplete = true;
                return false;
            }
            referenceBudget -= size;
            return true;
        },
    );
    return { messages, instruction, compactionSummary, references, incomplete };
};

export const getAgentQuestion = (
    args: Pick<AiAgentArgs, 'userQuestion' | 'messageHistory'>,
): string => {
    if (args.userQuestion !== undefined) return args.userQuestion;
    const message = args.messageHistory.findLast((m) => m.role === 'user');
    if (!message || message.role !== 'user') return '';
    return typeof message.content === 'string'
        ? message.content
        : message.content
              .filter((part) => part.type === 'text')
              .map((part) => part.text)
              .join(' ');
};

/** Retrieval needs prior scope, not tool payloads or another copy of the catalog.
 * Bound serialized UTF-8 bytes and retain whole messages/rules only. */
export const getAgentRetrievalContext = (
    args: Pick<
        AiAgentArgs,
        | 'messageHistory'
        | 'agentSettings'
        | 'compactionSummary'
        | 'userQuestion'
    >,
): Omit<AgentDecisionContext, 'references'> => {
    const context = getAgentDecisionContext({
        messageHistory: args.messageHistory,
        agentSettings: args.agentSettings,
        compactionSummary: args.compactionSummary,
    });
    const result: Omit<AgentDecisionContext, 'references'> = {
        messages: [],
        instruction: null,
        compactionSummary: null,
        incomplete: context.incomplete,
    };
    const fits = () => Buffer.byteLength(JSON.stringify(result)) <= 8_000;
    (['instruction', 'compactionSummary'] as const).forEach((key) => {
        result[key] = context[key];
        if (!fits()) {
            result[key] = null;
            result.incomplete = true;
        }
    });
    const currentQuestion = getAgentQuestion(args);
    const currentIndex = context.messages.findLastIndex(
        ({ role, text }) => role === 'user' && text === currentQuestion,
    );
    context.messages
        .map((message, index) => ({ message, index }))
        .reverse()
        .forEach(({ message, index }) => {
            // The current question already has its own state.query slot.
            if (index === currentIndex) return;
            result.messages.unshift(message);
            if (!fits()) {
                result.messages.shift();
                result.incomplete = true;
            }
        });
    return result;
};
