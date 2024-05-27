import { useCallback, useState } from 'react';
import useToaster from './toaster/useToaster';

/**
 * Custom React hook to interact with the clipboard. This hook facilitates copying text to the clipboard
 * that is retrieved asynchronously, with special handling for different browsers.
 *
 * @param {() => Promise<string | undefined>} asyncOperation A function that returns a promise which resolves to the string to be copied.
 * @returns An object containing the `copied` state indicating if the copy operation was successful, and `handleCopy` method to trigger the copy.
 */
export const useAsyncClipboard = (
    asyncOperation: () => Promise<string | undefined>,
) => {
    const { showToastSuccess } = useToaster();
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        if ('clipboard' in navigator) {
            if (typeof ClipboardItem !== 'undefined' && navigator.clipboard) {
                // Safari-specific handling: Safari restricts clipboard API to direct user interactions.
                // The workaround involves using ClipboardItem with a Blob wrapping the promise.
                // Source: https://developer.apple.com/forums/thread/691873
                const shareUrl = new ClipboardItem({
                    'text/plain': asyncOperation().then(
                        (s) => new Blob([s ?? ''], { type: 'text/plain' }),
                    ),
                });
                await navigator.clipboard.write([shareUrl]);
            } else {
                // Firefox also support for ClipboardItem and navigator.clipboard.write,
                // but that is behind `dom.events.asyncClipboard.clipboardItem` preference.
                // Unlike Safari, Firefox does not restrict the Clipboard API to direct user interactions, so we can do the default async operation without any special handling.
                const response = await asyncOperation();
                await navigator.clipboard.writeText(response ?? '');
            }

            setCopied(true);
            showToastSuccess({ title: 'Link copied to clipboard' });
            setTimeout(() => setCopied(false), 1000);
        }
    }, [asyncOperation, showToastSuccess]);

    return {
        copied,
        handleCopy,
    };
};
