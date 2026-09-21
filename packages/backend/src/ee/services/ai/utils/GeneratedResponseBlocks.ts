import type { StreamTextTransform, TextStreamPart, ToolSet } from 'ai';
import { randomUUID } from 'node:crypto';

export class GeneratedResponseBlocks {
    private readonly blocks = new Map<string, string>();

    register(markdown: string): string {
        if (this.blocks.size >= 20 || markdown.length > 500_000) {
            throw new Error('Generated response export limit reached.');
        }
        const token = `[[lightdash-export:${randomUUID()}]]`;
        this.blocks.set(token, markdown);
        return token;
    }

    render(text: string): string {
        return text.replace(
            /\[\[lightdash-export:[a-f0-9-]{36}\]\]/g,
            (token) => this.blocks.get(token) ?? token,
        );
    }

    splitChunk(text: string): { ready: string; pending: string } {
        let pendingLength = 0;
        for (const token of this.blocks.keys()) {
            for (let length = 1; length < token.length; length += 1) {
                if (text.endsWith(token.slice(0, length))) {
                    pendingLength = Math.max(pendingLength, length);
                }
            }
        }
        const boundary = text.length - pendingLength;
        return {
            ready: this.render(text.slice(0, boundary)),
            pending: text.slice(boundary),
        };
    }
}

export const generatedResponseTransform =
    (blocks: GeneratedResponseBlocks): StreamTextTransform<ToolSet> =>
    () => {
        type TextDelta = Extract<
            TextStreamPart<ToolSet>,
            { type: 'text-delta' }
        >;
        const pending = new Map<string, TextDelta>();
        return new TransformStream<
            TextStreamPart<ToolSet>,
            TextStreamPart<ToolSet>
        >({
            transform(chunk, controller) {
                if (chunk.type === 'text-delta') {
                    const previous = pending.get(chunk.id);
                    const split = blocks.splitChunk(
                        (previous?.text ?? '') + chunk.text,
                    );
                    if (split.ready)
                        controller.enqueue({ ...chunk, text: split.ready });
                    if (split.pending)
                        pending.set(chunk.id, {
                            ...chunk,
                            text: split.pending,
                        });
                    else pending.delete(chunk.id);
                    return;
                }
                if (chunk.type === 'text-end') {
                    const remainder = pending.get(chunk.id);
                    if (remainder) controller.enqueue(remainder);
                    pending.delete(chunk.id);
                }
                controller.enqueue(chunk);
            },
            flush(controller) {
                for (const remainder of pending.values())
                    controller.enqueue(remainder);
            },
        });
    };

export const syntheticTextTransform =
    (
        getText: () => string | null,
        delayMs = 16,
    ): StreamTextTransform<ToolSet> =>
    () => {
        let sawText = false;
        const sleep = (milliseconds: number) =>
            new Promise<void>((resolve) => {
                setTimeout(resolve, milliseconds);
            });
        const enqueueWords = async (
            controller: TransformStreamDefaultController<
                TextStreamPart<ToolSet>
            >,
            id: string,
            [text, ...remaining]: string[],
        ): Promise<void> => {
            if (!text) return;
            controller.enqueue({ type: 'text-delta', id, text });
            if (delayMs > 0 && remaining.length > 0) await sleep(delayMs);
            await enqueueWords(controller, id, remaining);
        };
        return new TransformStream<
            TextStreamPart<ToolSet>,
            TextStreamPart<ToolSet>
        >({
            async transform(chunk, controller) {
                if (chunk.type === 'text-delta') sawText = true;
                if (chunk.type === 'finish' && !sawText) {
                    const fallback = getText()?.trim();
                    if (fallback) {
                        const id = `synthetic-${randomUUID()}`;
                        controller.enqueue({ type: 'text-start', id });
                        await enqueueWords(
                            controller,
                            id,
                            fallback.match(/\S+\s*/gu) ?? [fallback],
                        );
                        controller.enqueue({ type: 'text-end', id });
                    }
                }
                controller.enqueue(chunk);
            },
        });
    };

export const yamlCodeBlock = (yaml: string): string => {
    const longest = (yaml.match(/`+/g) ?? []).reduce(
        (max, run) => Math.max(max, run.length),
        0,
    );
    const fence = '`'.repeat(Math.max(3, longest + 1));
    return `${fence}yaml\n${yaml}\n${fence}`;
};
