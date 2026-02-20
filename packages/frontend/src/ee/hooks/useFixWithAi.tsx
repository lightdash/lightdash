import { type ApiErrorDetail } from '@lightdash/common';
import { IconSparkles } from '@tabler/icons-react';
import { useCallback } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import { type NotificationData } from '../../hooks/toaster/types';
import { useAgentCodingContextSafe } from '../features/agentCodingSessions/hooks/useAgentCodingContext';

/**
 * Hook that provides a function to create a "Fix with AI" action button
 * for error toasts. When clicked, opens the agent coding drawer and
 * creates a new session with the error details.
 */
export const useFixWithAi = () => {
    const agentCodingContext = useAgentCodingContextSafe();

    /**
     * Creates action button props for the "Fix with AI" button
     * Returns undefined if agent coding is not available
     */
    const getFixWithAiAction = useCallback(
        (errorDetails: string) => {
            if (!agentCodingContext) {
                return undefined;
            }

            const currentUrl = window.location.href;
            const prompt = `Fix this error, viewing page: ${currentUrl}\n\nError: ${errorDetails}`;

            return {
                children: 'Fix with AI',
                icon: IconSparkles,
                onClick: () => {
                    agentCodingContext.openDrawerWithPrompt(prompt);
                },
            };
        },
        [agentCodingContext],
    );

    return {
        getFixWithAiAction,
        isAvailable: !!agentCodingContext,
    };
};

/**
 * Extended toaster hook that adds "Fix with AI" support to error toasts.
 * Use this instead of useToaster when you want error toasts to include
 * the "Fix with AI" button automatically.
 */
export const useToasterWithAiFix = () => {
    const toaster = useToaster();
    const { getFixWithAiAction, isAvailable } = useFixWithAi();

    /**
     * Shows an error toast with an optional "Fix with AI" button.
     * @param props - Toast configuration
     * @param props.enableFixWithAi - If true, adds a "Fix with AI" button (default: true when available)
     */
    const showToastError = useCallback(
        (props: NotificationData & { enableFixWithAi?: boolean }) => {
            const { enableFixWithAi = true, ...toastProps } = props;

            // Only add the AI fix action if:
            // 1. The feature is available (context exists)
            // 2. enableFixWithAi is true
            // 3. There's no existing action (don't override)
            const shouldAddAiFix = isAvailable && enableFixWithAi && !toastProps.action;

            const errorText = typeof toastProps.subtitle === 'string'
                ? toastProps.subtitle
                : typeof toastProps.title === 'string'
                    ? toastProps.title
                    : 'Unknown error';

            const action = shouldAddAiFix
                ? getFixWithAiAction(errorText)
                : toastProps.action;

            toaster.showToastError({
                ...toastProps,
                action,
            });
        },
        [toaster, getFixWithAiAction, isAvailable],
    );

    /**
     * Shows an API error toast with an optional "Fix with AI" button.
     * @param props - Toast configuration
     * @param props.enableFixWithAi - If true, adds a "Fix with AI" button (default: true when available)
     */
    const showToastApiError = useCallback(
        (props: Omit<NotificationData, 'subtitle'> & {
            apiError: ApiErrorDetail;
            enableFixWithAi?: boolean;
        }) => {
            const { enableFixWithAi = true, ...toastProps } = props;

            // Only add the AI fix action if:
            // 1. The feature is available (context exists)
            // 2. enableFixWithAi is true
            // 3. There's no existing action (don't override)
            const shouldAddAiFix = isAvailable && enableFixWithAi && !toastProps.action;

            // Build error text from API error
            const errorText = toastProps.apiError?.message
                || (typeof toastProps.title === 'string' ? toastProps.title : 'Unknown error');

            const action = shouldAddAiFix
                ? getFixWithAiAction(errorText)
                : toastProps.action;

            toaster.showToastApiError({
                ...toastProps,
                action,
            });
        },
        [toaster, getFixWithAiAction, isAvailable],
    );

    return {
        ...toaster,
        showToastError,
        showToastApiError,
    };
};
