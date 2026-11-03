import React, { useCallback, useEffect, useRef, useState } from 'react';

type StoryInfo = { id: string; title: string; name: string };

type FeedbackEntry = {
    storyId: string;
    storyTitle: string;
    storyName: string;
    selector: string;
    elementText: string;
    x: number;
    y: number;
    viewport: { width: number; height: number };
    comment: string;
    createdAt?: string;
};

type Draft = { x: number; y: number; target: Element };

const ROOT_ATTR = 'data-feedback-overlay';

const describe = (el: Element): string => {
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node !== document.body && parts.length < 5) {
        const testId = node.getAttribute('data-testid');
        const label = node.getAttribute('aria-label');
        const firstClass = node.classList[0];
        let part = node.tagName.toLowerCase();
        if (testId) part += `[data-testid="${testId}"]`;
        else if (label) part += `[aria-label="${label}"]`;
        else if (firstClass) part += `.${firstClass}`;
        parts.unshift(part);
        node = node.parentElement;
    }
    return parts.join(' > ');
};

const isOverlay = (el: Element | null) => !!el?.closest(`[${ROOT_ATTR}]`);

const box = (rect: DOMRect): React.CSSProperties => ({
    position: 'fixed',
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    outline: '2px solid #7262ff',
    background: 'rgba(114, 98, 255, 0.08)',
    pointerEvents: 'none',
    zIndex: 99998,
});

export const FeedbackOverlay = ({ story }: { story: StoryInfo }) => {
    const [active, setActive] = useState(false);
    const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [text, setText] = useState('');
    const [entries, setEntries] = useState<FeedbackEntry[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const load = useCallback(() => {
        fetch('/__feedback')
            .then((r) => r.json())
            .then((all: FeedbackEntry[]) =>
                setEntries(all.filter((e) => e.storyId === story.id)),
            )
            .catch(() => setEntries([]));
    }, [story.id]);

    useEffect(load, [load]);

    useEffect(() => {
        if (!active || draft) return undefined;
        const onMove = (e: MouseEvent) => {
            const el = document.elementFromPoint(e.clientX, e.clientY);
            setHoverRect(
                el && !isOverlay(el) ? el.getBoundingClientRect() : null,
            );
        };
        const onClick = (e: MouseEvent) => {
            const el = e.target instanceof Element ? e.target : null;
            if (!el || isOverlay(el)) return;
            e.preventDefault();
            e.stopPropagation();
            setDraft({ x: e.pageX, y: e.pageY, target: el });
            setHoverRect(el.getBoundingClientRect());
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setActive(false);
        };
        document.addEventListener('mousemove', onMove, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('mousemove', onMove, true);
            document.removeEventListener('click', onClick, true);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [active, draft]);

    useEffect(() => {
        if (draft) textareaRef.current?.focus();
    }, [draft]);

    const close = () => {
        setDraft(null);
        setText('');
        setHoverRect(null);
    };

    const save = async () => {
        if (!draft || !text.trim()) return;
        const entry: FeedbackEntry = {
            storyId: story.id,
            storyTitle: story.title,
            storyName: story.name,
            selector: describe(draft.target),
            elementText: (draft.target.textContent ?? '').trim().slice(0, 160),
            x: draft.x,
            y: draft.y,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            comment: text.trim(),
        };
        await fetch('/__feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry),
        });
        close();
        load();
    };

    return (
        <div {...{ [ROOT_ATTR]: true }}>
            {active && hoverRect && <div style={box(hoverRect)} />}

            {entries.map((entry, i) => (
                <div
                    key={`${entry.createdAt}-${i}`}
                    title={entry.comment}
                    style={{
                        position: 'absolute',
                        left: entry.x - 11,
                        top: entry.y - 11,
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        background: '#7262ff',
                        color: 'white',
                        fontSize: 11,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 99999,
                        cursor: 'default',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }}
                >
                    {i + 1}
                </div>
            ))}

            {draft && (
                <div
                    style={{
                        position: 'absolute',
                        left: Math.min(draft.x + 12, window.scrollX + window.innerWidth - 300),
                        top: draft.y + 12,
                        width: 280,
                        padding: 10,
                        background: 'white',
                        color: '#111',
                        border: '1px solid #ddd',
                        borderRadius: 8,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                        zIndex: 100000,
                        fontFamily: 'system-ui, sans-serif',
                        fontSize: 13,
                    }}
                >
                    <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey))
                                void save();
                            if (e.key === 'Escape') close();
                        }}
                        placeholder="What should change here?"
                        rows={4}
                        style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            resize: 'vertical',
                            font: 'inherit',
                            padding: 6,
                            border: '1px solid #ccc',
                            borderRadius: 6,
                        }}
                    />
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginTop: 6,
                            color: '#777',
                            fontSize: 11,
                        }}
                    >
                        <span>⌘↵ to save · Esc to cancel</span>
                        <button type="button" onClick={() => void save()}>
                            Save
                        </button>
                    </div>
                </div>
            )}

            <button
                type="button"
                onClick={() => {
                    setActive((v) => !v);
                    close();
                }}
                style={{
                    position: 'fixed',
                    right: 16,
                    bottom: 16,
                    zIndex: 100001,
                    padding: '8px 12px',
                    borderRadius: 999,
                    border: '1px solid #7262ff',
                    background: active ? '#7262ff' : 'white',
                    color: active ? 'white' : '#7262ff',
                    fontFamily: 'system-ui, sans-serif',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                }}
            >
                {active ? 'Commenting… (Esc)' : `Comment (${entries.length})`}
            </button>
        </div>
    );
};
