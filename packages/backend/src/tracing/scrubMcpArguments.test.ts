import type {
    ReadableSpan,
    SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
    removeMcpArgumentAttributes,
    scrubMcpArgumentsFromTransaction,
    ScrubMcpArgumentsSpanProcessor,
    type TransactionEvent,
} from './scrubMcpArguments';

const mcpSpanAttributes = () => ({
    'mcp.method.name': 'tools/call',
    'mcp.tool.name': 'run_sql',
    'mcp.request.argument.sql': '"select * from users"',
    'mcp.request.argument.prompt': '"show me revenue for acme corp"',
    'mcp.tool.result.is_error': false,
});

describe('removeMcpArgumentAttributes', () => {
    it('removes argument attributes and keeps the rest', () => {
        const attributes: Record<string, unknown> = mcpSpanAttributes();

        removeMcpArgumentAttributes(attributes);

        expect(attributes).toEqual({
            'mcp.method.name': 'tools/call',
            'mcp.tool.name': 'run_sql',
            'mcp.tool.result.is_error': false,
        });
    });
});

describe('scrubMcpArgumentsFromTransaction', () => {
    it('scrubs the root span and all child spans', () => {
        const event = {
            type: 'transaction',
            contexts: {
                trace: {
                    span_id: 'root',
                    trace_id: 'trace',
                    data: mcpSpanAttributes(),
                },
            },
            spans: [
                {
                    span_id: 'child',
                    trace_id: 'trace',
                    start_timestamp: 0,
                    data: mcpSpanAttributes(),
                },
            ],
        } as unknown as TransactionEvent;

        const scrubbed = scrubMcpArgumentsFromTransaction(event);

        const allData = [
            scrubbed.contexts?.trace?.data,
            ...(scrubbed.spans ?? []).map((span) => span.data),
        ];
        allData.forEach((data) => {
            expect(Object.keys(data ?? {})).toEqual([
                'mcp.method.name',
                'mcp.tool.name',
                'mcp.tool.result.is_error',
            ]);
        });
    });

    it('returns events without spans or trace data unchanged', () => {
        const event = { type: 'transaction' } as TransactionEvent;

        expect(scrubMcpArgumentsFromTransaction(event)).toBe(event);
    });
});

describe('ScrubMcpArgumentsSpanProcessor', () => {
    const makeInner = (): SpanProcessor => ({
        onStart: vi.fn(),
        onEnd: vi.fn(),
        shutdown: vi.fn().mockResolvedValue(undefined),
        forceFlush: vi.fn().mockResolvedValue(undefined),
    });

    it('scrubs attributes before delegating onEnd', () => {
        const inner = makeInner();
        const processor = new ScrubMcpArgumentsSpanProcessor(inner);
        const span = {
            attributes: mcpSpanAttributes(),
        } as unknown as ReadableSpan;

        processor.onEnd(span);

        expect(inner.onEnd).toHaveBeenCalledWith(span);
        expect(span.attributes).toEqual({
            'mcp.method.name': 'tools/call',
            'mcp.tool.name': 'run_sql',
            'mcp.tool.result.is_error': false,
        });
    });

    it('delegates onStart, shutdown and forceFlush', async () => {
        const inner = makeInner();
        const processor = new ScrubMcpArgumentsSpanProcessor(inner);
        const span = {} as Parameters<SpanProcessor['onStart']>[0];
        const parentContext = {} as Parameters<SpanProcessor['onStart']>[1];

        processor.onStart(span, parentContext);
        await processor.shutdown();
        await processor.forceFlush();

        expect(inner.onStart).toHaveBeenCalledWith(span, parentContext);
        expect(inner.shutdown).toHaveBeenCalled();
        expect(inner.forceFlush).toHaveBeenCalled();
    });
});
