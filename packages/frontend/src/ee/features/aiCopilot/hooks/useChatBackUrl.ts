import { createContext, useCallback, useContext, type RefObject } from 'react';
import { useLocation } from 'react-router';

export const CHAT_MESSAGE_PARAM = 'chatMessage';

export const ChatViewportContext =
    createContext<RefObject<HTMLDivElement | null> | null>(null);

/** A message (`data-message-id`) or a clickable element (`data-chat-anchor`). */
export const findChatAnchor = (viewport: HTMLElement, anchorId: string) => {
    const id = CSS.escape(anchorId);
    return viewport.querySelector<HTMLElement>(
        `[data-chat-anchor="${id}"], [data-message-id="${id}"]`,
    );
};

const getTopVisibleMessageId = (viewport: HTMLElement) => {
    const viewportTop = viewport.getBoundingClientRect().top;
    return Array.from(
        viewport.querySelectorAll<HTMLElement>('[data-message-id]'),
    ).find((message) => message.getBoundingClientRect().bottom > viewportTop)
        ?.dataset.messageId;
};

/** The current conversation URL, carrying the element to return to. */
export const useChatBackUrl = () => {
    const viewport = useContext(ChatViewportContext);
    const { pathname, search } = useLocation();

    return useCallback(
        (anchorId: string | null) => {
            const params = new URLSearchParams(search);
            const container = viewport?.current;
            const returnId =
                container &&
                (anchorId && findChatAnchor(container, anchorId)
                    ? anchorId
                    : getTopVisibleMessageId(container));
            if (returnId) {
                params.set(CHAT_MESSAGE_PARAM, returnId);
            } else {
                params.delete(CHAT_MESSAGE_PARAM);
            }
            const query = params.toString();
            return query ? `${pathname}?${query}` : pathname;
        },
        [pathname, search, viewport],
    );
};
