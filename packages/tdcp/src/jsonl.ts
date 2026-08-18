/**
 * Streaming JSONL over the data plane. Rows are yielded as each newline
 * lands, so a million-row dataset flows fetch -> consumer with one line in
 * memory at a time. Sources without a streaming body (test shims, exotic
 * fetch polyfills) fall back to a buffered read of the same contract.
 */

type JsonlSource = {
    body?: ReadableStream<Uint8Array> | null;
    text: () => Promise<string>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const parseLine = (line: string): Record<string, unknown> => {
    let row: unknown;
    try {
        row = JSON.parse(line);
    } catch (e) {
        throw new Error('TDCP data plane returned malformed JSONL');
    }
    if (!isRecord(row)) {
        throw new Error('TDCP data plane returned a non-object JSONL row');
    }
    return row;
};

export async function* jsonlRows(
    source: JsonlSource,
): AsyncGenerator<Record<string, unknown>> {
    if (!source.body) {
        const text = await source.text();
        for (const line of text.split('\n')) {
            if (line.trim().length > 0) yield parseLine(line);
        }
        return;
    }

    const reader = source.body.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffered += decoder.decode(value, { stream: true });
            let newlineAt = buffered.indexOf('\n');
            while (newlineAt !== -1) {
                const line = buffered.slice(0, newlineAt);
                buffered = buffered.slice(newlineAt + 1);
                if (line.trim().length > 0) yield parseLine(line);
                newlineAt = buffered.indexOf('\n');
            }
        }
        buffered += decoder.decode();
        if (buffered.trim().length > 0) yield parseLine(buffered);
    } finally {
        reader.releaseLock();
    }
}
