import { type ContentType } from '@lightdash/common';
import { type Editor } from '@tiptap/react';
import {
    useEffect,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
} from 'react';
import { useNavigate } from 'react-router';
import { mentionUrl } from '../../../ee/features/homepageBuilder/blocks/markdownEditor/contentMentionMarkdown';

const MENTION_CHIP_SELECTOR = '.node-contentMention';

/**
 * Read mode: mention chips are React node views that swallow ProseMirror's
 * click handling, so open them from a DOM-level event and expose them to
 * assistive tech.
 */
export const useMentionNavigation = (
    editor: Editor | null,
    projectUuid: string,
) => {
    const navigate = useNavigate();

    useEffect(() => {
        if (!editor) {
            return undefined;
        }
        const root = editor.view.dom;
        const label = () => {
            root.querySelectorAll(MENTION_CHIP_SELECTOR).forEach((chip) => {
                chip.setAttribute('tabindex', '0');
                chip.setAttribute('role', 'link');
                chip.setAttribute(
                    'aria-label',
                    `Open ${chip.textContent ?? ''}`.trim(),
                );
            });
        };
        label();
        const observer = new MutationObserver(label);
        observer.observe(root, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, [editor]);

    const open = (target: EventTarget | null): boolean => {
        if (!editor || !(target instanceof HTMLElement)) {
            return false;
        }
        const chip = target.closest(MENTION_CHIP_SELECTOR);
        if (!chip) {
            return false;
        }
        const position = editor.view.posAtDOM(chip, 0);
        if (position < 0) {
            return false;
        }
        const node =
            editor.state.doc.nodeAt(position) ??
            (position > 0 ? editor.state.doc.nodeAt(position - 1) : null);
        if (!node || node.type.name !== 'contentMention') {
            return false;
        }
        const contentType = node.attrs.contentType as ContentType | null;
        const uuid = node.attrs.uuid as string | null;
        if (!contentType || !uuid) {
            return false;
        }
        void navigate(mentionUrl(projectUuid, contentType, uuid));
        return true;
    };

    return {
        onClick: (event: ReactMouseEvent<HTMLDivElement>) => {
            open(event.target);
        },
        onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => {
            if (
                (event.key === 'Enter' || event.key === ' ') &&
                open(event.target)
            ) {
                event.preventDefault();
            }
        },
    };
};
