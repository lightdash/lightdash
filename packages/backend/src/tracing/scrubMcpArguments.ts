import type {
    ReadableSpan,
    SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import type { NodeOptions } from '@sentry/node';

// Derived from the hook signature so it matches the @sentry/node version we
// call (two @sentry/core versions coexist in the dependency tree).
export type TransactionEvent = Parameters<
    NonNullable<NodeOptions['beforeSendTransaction']>
>[0];

type SdkSpan = Parameters<SpanProcessor['onStart']>[0];
type SdkContext = Parameters<SpanProcessor['onStart']>[1];

// Sentry's MCP wrapper attaches tool-call arguments (user prompts, raw SQL) as
// span attributes; 9.x drops them unless sendDefaultPii is set, 10.x keeps them.
const MCP_ARGUMENT_ATTRIBUTE_PREFIX = 'mcp.request.argument.';

export const removeMcpArgumentAttributes = (
    attributes: Record<string, unknown>,
): void => {
    const target = attributes;
    Object.keys(target)
        .filter((key) => key.startsWith(MCP_ARGUMENT_ATTRIBUTE_PREFIX))
        .forEach((key) => {
            delete target[key];
        });
};

export const scrubMcpArgumentsFromTransaction = (
    event: TransactionEvent,
): TransactionEvent => {
    const traceData = event.contexts?.trace?.data;
    if (traceData) {
        removeMcpArgumentAttributes(traceData);
    }
    event.spans?.forEach((span) => {
        if (span.data) {
            removeMcpArgumentAttributes(span.data);
        }
    });
    return event;
};

export class ScrubMcpArgumentsSpanProcessor implements SpanProcessor {
    constructor(private readonly inner: SpanProcessor) {}

    onStart(span: SdkSpan, parentContext: SdkContext): void {
        this.inner.onStart(span, parentContext);
    }

    onEnd(span: ReadableSpan): void {
        removeMcpArgumentAttributes(span.attributes as Record<string, unknown>);
        this.inner.onEnd(span);
    }

    shutdown(): Promise<void> {
        return this.inner.shutdown();
    }

    forceFlush(): Promise<void> {
        return this.inner.forceFlush();
    }
}
