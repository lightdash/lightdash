import {
    ActionIcon,
    Anchor,
    Divider,
    Flex,
    Loader,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { IconSend } from '@tabler/icons-react';
import ReactMarkdownPreview from '@uiw/react-markdown-preview';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type FormEvent,
} from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import MantineIcon from '../common/MantineIcon';
import classes from './DocsAssistantChat.module.css';

const MINTLIFY_DOMAIN = 'lightdash';
const MINTLIFY_DOCS_URL = 'https://docs.lightdash.com';
const MINTLIFY_API_URL = `https://api-dsc.mintlify.com/v1/assistant/${MINTLIFY_DOMAIN}/message`;
// This is a public client-side token designed to be bundled into the frontend.
// It only grants read access to the public Lightdash documentation.
// See https://www.mintlify.com/docs/guides/assistant-embed
const MINTLIFY_TOKEN = 'mint_dsc_P95XqyyAQrTkQqwpTFkGZL';

type Source = {
    title: string;
    url: string;
};

type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    sources: Source[];
};

type StreamSearchResult = {
    path?: string;
    url?: string;
    metadata?: { title?: string };
};

type StreamToolResult = {
    toolCallId: string;
    result?: { results?: StreamSearchResult[] };
};

/**
 * Convert a path or URL from Mintlify search results into an absolute docs URL.
 */
const resolveSourceUrl = (source: StreamSearchResult): string => {
    const raw = source.url ?? source.path ?? '';
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    const path = raw.startsWith('/') ? raw : `/${raw}`;
    return `${MINTLIFY_DOCS_URL}${path}`;
};

/**
 * Parse Mintlify's AI SDK data stream format.
 * Lines are prefixed with type codes:
 * - `0:` = text content (JSON string)
 * - `9:` = tool call (args)
 * - `a:` = tool call result (for `search` contains source docs)
 * - `e:` = finish reason for a step
 * - `d:` = done signal
 * - `f:` = new message boundary
 */
type ParsedChunk =
    | { type: 'text'; text: string }
    | { type: 'search-sources'; sources: Source[] }
    | { type: 'ignore' };

const parseStreamChunk = (line: string): ParsedChunk => {
    if (line.startsWith('0:')) {
        try {
            const text = JSON.parse(line.slice(2)) as string;
            return { type: 'text', text };
        } catch {
            return { type: 'ignore' };
        }
    }
    if (line.startsWith('a:')) {
        try {
            const parsed = JSON.parse(line.slice(2)) as StreamToolResult;
            const results = parsed.result?.results;
            if (!Array.isArray(results)) return { type: 'ignore' };
            const sources: Source[] = results.map((r) => ({
                title: r.metadata?.title ?? r.path ?? 'Untitled',
                url: resolveSourceUrl(r),
            }));
            return { type: 'search-sources', sources };
        } catch {
            return { type: 'ignore' };
        }
    }
    return { type: 'ignore' };
};

/**
 * Mintlify includes a non-standard `suggestions` code block with `(text)[/path]`
 * format. Strip these from the main content — they are rendered separately.
 */
const SUGGESTIONS_BLOCK_RE = /```suggestions\n([\s\S]*?)```/g;

const extractSuggestions = (
    content: string,
): { body: string; suggestions: Source[] } => {
    const suggestions: Source[] = [];
    const body = content.replace(SUGGESTIONS_BLOCK_RE, (_, inner: string) => {
        inner.split('\n').forEach((line) => {
            const match = line.match(/\(([^)]+)\)\[([^\]]+)\]/);
            if (match) {
                const [, title, path] = match;
                const url = path.startsWith('http')
                    ? path
                    : `${MINTLIFY_DOCS_URL}${
                          path.startsWith('/') ? path : `/${path}`
                      }`;
                suggestions.push({ title, url });
            }
        });
        return '';
    });
    return { body: body.trim(), suggestions };
};

/**
 * Convert relative markdown links `](/path)` to absolute URLs pointing at docs.
 */
const resolveRelativeLinks = (content: string): string =>
    content.replace(/\]\(\//g, `](${MINTLIFY_DOCS_URL}/`);

/**
 * Deduplicate a list of sources by URL, preserving order.
 */
const dedupeByUrl = (sources: Source[]): Source[] => {
    const seen = new Set<string>();
    return sources.filter((s) => {
        if (seen.has(s.url)) return false;
        seen.add(s.url);
        return true;
    });
};

const makeMessageId = (role: 'user' | 'assistant'): string =>
    `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type AssistantMessageProps = {
    message: ChatMessage;
};

const AssistantMessage: FC<AssistantMessageProps> = ({ message }) => {
    const { body, suggestions } = useMemo(
        () => extractSuggestions(message.content),
        [message.content],
    );
    const resolvedBody = useMemo(() => resolveRelativeLinks(body), [body]);

    if (!message.content) {
        return <Loader size="xs" />;
    }

    return (
        <Stack gap="xs">
            <ReactMarkdownPreview
                source={resolvedBody}
                rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }]]}
                style={{ backgroundColor: 'transparent' }}
            />
            {suggestions.length > 0 && (
                <Stack gap={4}>
                    {suggestions.map((s) => (
                        <Anchor
                            key={s.url}
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="sm"
                            className={classes.suggestionLink}
                        >
                            {s.title}
                        </Anchor>
                    ))}
                </Stack>
            )}
            {message.sources.length > 0 && (
                <>
                    <Divider my={4} />
                    <Text fz="xs" fw={600} c="dimmed">
                        Sources
                    </Text>
                    <Stack gap={2}>
                        {message.sources.map((s) => (
                            <Anchor
                                key={s.url}
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                size="xs"
                            >
                                {s.title}
                            </Anchor>
                        ))}
                    </Stack>
                </>
            )}
        </Stack>
    );
};

const DocsAssistantChat: FC = () => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    // Cleanup abort controller on unmount
    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
        };
    }, []);

    const handleSubmit = useCallback(
        async (e: FormEvent) => {
            e.preventDefault();
            const trimmed = input.trim();
            if (!trimmed || isLoading) return;

            const userMessage: ChatMessage = {
                id: makeMessageId('user'),
                role: 'user',
                content: trimmed,
                sources: [],
            };

            const assistantMessage: ChatMessage = {
                id: makeMessageId('assistant'),
                role: 'assistant',
                content: '',
                sources: [],
            };

            setMessages((prev) => [...prev, userMessage, assistantMessage]);
            setInput('');
            setIsLoading(true);

            const abortController = new AbortController();
            abortControllerRef.current = abortController;

            try {
                // Mintlify expects AI SDK UIMessage format: each message needs
                // `id`, `role`, `content`, and `parts: [{ type: 'text', text }]`.
                // Filter out the empty placeholder assistant message that was
                // just added for streaming into.
                const allMessages = [...messages, userMessage]
                    .filter((m) => m.content.length > 0)
                    .map((m) => ({
                        id: m.id,
                        role: m.role,
                        content: m.content,
                        parts: [{ type: 'text', text: m.content }],
                    }));

                const response = await fetch(MINTLIFY_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${MINTLIFY_TOKEN}`,
                    },
                    body: JSON.stringify({
                        messages: allMessages,
                        fp: 'anonymous',
                        retrievalPageSize: 5,
                    }),
                    signal: abortController.signal,
                });

                if (!response.ok || !response.body) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                const applyChunk = (line: string) => {
                    const chunk = parseStreamChunk(line);
                    if (chunk.type === 'text') {
                        setMessages((prev) =>
                            prev.map((m) =>
                                m.id === assistantMessage.id
                                    ? {
                                          ...m,
                                          content: m.content + chunk.text,
                                      }
                                    : m,
                            ),
                        );
                    } else if (chunk.type === 'search-sources') {
                        setMessages((prev) =>
                            prev.map((m) =>
                                m.id === assistantMessage.id
                                    ? {
                                          ...m,
                                          sources: dedupeByUrl([
                                              ...m.sources,
                                              ...chunk.sources,
                                          ]),
                                      }
                                    : m,
                            ),
                        );
                    }
                };

                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';
                    lines.forEach(applyChunk);
                }
                if (buffer) applyChunk(buffer);
            } catch (error) {
                if (
                    error instanceof DOMException &&
                    error.name === 'AbortError'
                ) {
                    return;
                }
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === assistantMessage.id
                            ? {
                                  ...m,
                                  content:
                                      'Sorry, something went wrong. Please try again.',
                              }
                            : m,
                    ),
                );
            } finally {
                setIsLoading(false);
                abortControllerRef.current = null;
            }
        },
        [input, isLoading, messages],
    );

    return (
        <Stack h={500} gap={0}>
            <div className={classes.messagesContainer}>
                {messages.length === 0 && (
                    <div className={classes.emptyState}>
                        <Text c="dimmed" fz="sm">
                            Ask a question about Lightdash docs
                        </Text>
                    </div>
                )}
                {messages.map((message) => (
                    <div
                        key={message.id}
                        className={
                            message.role === 'user'
                                ? classes.userMessage
                                : classes.assistantMessage
                        }
                    >
                        {message.role === 'user' ? (
                            message.content
                        ) : (
                            <AssistantMessage message={message} />
                        )}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit}>
                <Flex className={classes.inputArea} gap="xs">
                    <TextInput
                        flex={1}
                        value={input}
                        onChange={(e) => setInput(e.currentTarget.value)}
                        placeholder="Ask a question..."
                        disabled={isLoading}
                        size="sm"
                    />
                    <ActionIcon
                        type="submit"
                        variant="filled"
                        size="lg"
                        disabled={isLoading || !input.trim()}
                    >
                        <MantineIcon icon={IconSend} />
                    </ActionIcon>
                </Flex>
            </form>
        </Stack>
    );
};

export default DocsAssistantChat;
