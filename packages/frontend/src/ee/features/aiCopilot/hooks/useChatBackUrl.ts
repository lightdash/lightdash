import { createContext, useCallback, useContext, type RefObject } from 'react';
import { useLocation } from 'react-router';

export const CHAT_MESSAGE_PARAM = 'chatMessage';

export const ChatViewportContext =
    createContext<RefObject<HTMLDivElement | null> | null>(null);

const getTopVisibleMessageId = (viewport: HTMLElement) => {
    const viewportTop = viewport.getBoundingClientRect().top;
    return Array.from(
        viewport.querySelectorAll<HTMLElement>('[data-message-id]'),
    ).find((message) => message.getBoundingClientRect().bottom > viewportTop)
        ?.dataset.messageId;
};

/** The current conversation URL, carrying the message to return to. */
export const useChatBackUrl = () => {
    const viewport = useContext(ChatViewportContext);
    const { pathname, search } = useLocation();

    return useCallback(() => {
        const params = new URLSearchParams(search);
        const messageId =
            viewport?.current && getTopVisibleMessageId(viewport.current);
        if (messageId) {
            params.set(CHAT_MESSAGE_PARAM, messageId);
        } else {
            params.delete(CHAT_MESSAGE_PARAM);
        }
        const query = params.toString();
        return query ? `${pathname}?${query}` : pathname;
    }, [pathname, search, viewport]);
};
