import {
    assertUnreachable,
    toolGenerateUiMetadataSchema,
    type GenerativeUiActionSubmission,
} from '@lightdash/common';
import { Group, Loader, Paper, Text } from '@mantine/core';
import { type FC } from 'react';
import InlineErrorState from '../../../../../../components/common/InlineErrorState';
import { type GenerativeUiCall } from './generativeUiCalls';
import {
    GenerativeUiCard,
    type GenerativeUiSubmitResult,
} from './GenerativeUiCard';
import { GenerativeUiResolvedView } from './GenerativeUiResolvedView';
import { useGenerativeUiOperations } from './useGenerativeUiOperations';

type GenerativeUiToolCardProps = {
    call: GenerativeUiCall;
    projectUuid: string;
    /** Only the thread's latest message can still act on its card. */
    isActive: boolean;
    /** A run for the message is streaming or pending. */
    isWaiting: boolean;
    onSubmit: (
        submission: GenerativeUiActionSubmission,
    ) => Promise<GenerativeUiSubmitResult>;
};

/** One generateUi call: the live card until it has a result, then a summary. */
export const GenerativeUiToolCard: FC<GenerativeUiToolCardProps> = ({
    call,
    projectUuid,
    isActive,
    isWaiting,
    onSubmit,
}) => {
    const operations = useGenerativeUiOperations({
        enabled: call.result === null && isActive,
    });

    if (call.result !== null) {
        // Stream types keep generateUi results opaque (recursive JSON), so parse here.
        const metadata = toolGenerateUiMetadataSchema.safeParse(
            call.result.metadata,
        );
        return metadata.success ? (
            <GenerativeUiResolvedView
                toolArgs={call.toolArgs}
                metadata={metadata.data}
            />
        ) : null;
    }

    if (!isActive) {
        return (
            <Paper variant="dotted" p="md">
                <Text fz="sm" c="dimmed">
                    This form is no longer active.
                </Text>
            </Paper>
        );
    }

    switch (operations.status) {
        case 'loading':
            return (
                <Group gap="xs">
                    <Loader size="xs" />
                    <Text fz="xs" c="dimmed">
                        Loading the form…
                    </Text>
                </Group>
            );
        case 'error':
            return (
                <InlineErrorState
                    message="The form could not be loaded."
                    onRetry={() => void operations.refetch()}
                />
            );
        case 'success':
            return (
                <GenerativeUiCard
                    toolCallId={call.toolCallId}
                    projectUuid={projectUuid}
                    toolArgs={call.toolArgs}
                    operations={operations.data}
                    waiting={isWaiting}
                    onSubmit={onSubmit}
                />
            );
        default:
            return assertUnreachable(
                operations,
                'Unknown generative UI operations status',
            );
    }
};
