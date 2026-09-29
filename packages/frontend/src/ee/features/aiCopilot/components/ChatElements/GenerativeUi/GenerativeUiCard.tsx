import {
    assertUnreachable,
    compileGenerativeUiSpec,
    isApiError,
    toolGenerateUiArgsSchema,
    type GenerativeUiAction,
    type GenerativeUiActionSubmission,
    type GenerativeUiCompiledSpec,
    type GenerativeUiCompileResult,
    type GenerativeUiOperation,
    type GenerativeUiState,
} from '@lightdash/common';
import {
    Button,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconForms } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import Callout from '../../../../../../components/common/Callout';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { BlockList } from './blocks/BlockRenderer';
import { type GenerativeUiRenderContext } from './blocks/renderContext';
import { fieldsOf, initialStateOf, validateFields } from './fields';
import { lightdashApiFetcher, type GenerativeUiFetcher } from './requests';
import {
    runGenerativeUiAction,
    type GenerativeUiRunProgress,
} from './runGenerativeUiAction';
import { useGenerativeUiQueries } from './useGenerativeUiQueries';

type Phase =
    | { kind: 'editing' }
    | { kind: 'confirming' }
    | { kind: 'running'; progress: GenerativeUiRunProgress | null }
    | { kind: 'sending'; submission: GenerativeUiActionSubmission }
    | { kind: 'sent'; submission: GenerativeUiActionSubmission }
    | { kind: 'resolvedElsewhere'; submission: GenerativeUiActionSubmission }
    | {
          kind: 'sendFailed';
          submission: GenerativeUiActionSubmission;
          message: string;
      };

/** What the host did with a submission: sent it on, or found the card already resolved. */
export type GenerativeUiSubmitResult =
    | { kind: 'sent' }
    | { kind: 'resolvedElsewhere' };

type GenerativeUiCardProps = {
    toolCallId: string;
    projectUuid: string;
    toolArgs: unknown;
    operations: GenerativeUiOperation[];
    /** A run for this message is in flight, so the form cannot act yet. */
    waiting: boolean;
    fetcher?: GenerativeUiFetcher;
    onSubmit: (
        submission: GenerativeUiActionSubmission,
    ) => Promise<GenerativeUiSubmitResult>;
};

const errorMessageOf = (error: unknown): string => {
    if (isApiError(error)) return error.error.message;
    if (error instanceof Error) return error.message;
    return 'Could not send the result to the agent';
};

const progressText = (progress: GenerativeUiRunProgress | null): string => {
    if (progress === null) return 'Starting…';
    const step = `Step ${progress.stepIndex + 1} of ${progress.stepCount}`;
    return progress.itemIndex === null || progress.itemCount === null
        ? step
        : `${step} · item ${progress.itemIndex + 1} of ${progress.itemCount}`;
};

const OutcomeNotice: FC<{
    submission: GenerativeUiActionSubmission;
    compiled: GenerativeUiCompiledSpec;
}> = ({ submission, compiled }) => {
    switch (submission.status) {
        case 'success':
            return (
                <Callout variant="success">
                    {compiled.spec.action.successMessage ?? 'Done.'}
                </Callout>
            );
        case 'failed': {
            const { stepId, itemIndex, error } = submission.failure;
            const stepNumber =
                compiled.steps.findIndex(({ step }) => step.id === stepId) + 1;
            const item = itemIndex === null ? '' : `, item ${itemIndex + 1}`;
            return (
                <Callout
                    variant="danger"
                    title={`Step ${stepNumber} of ${compiled.steps.length} failed${item}`}
                >
                    {error.message}
                </Callout>
            );
        }
        case 'dismissed':
            return (
                <Text fz="sm" c="dimmed">
                    Skipped.
                </Text>
            );
        default:
            return assertUnreachable(submission, 'Unknown submission status');
    }
};

const Footer: FC<{
    phase: Phase;
    waiting: boolean;
    action: GenerativeUiAction;
    destructive: boolean;
    compiled: GenerativeUiCompiledSpec;
    onAction: () => void;
    onConfirm: () => void;
    onCancel: () => void;
    onSkip: () => void;
    onResend: (submission: GenerativeUiActionSubmission) => void;
}> = ({
    phase,
    waiting,
    action,
    destructive,
    compiled,
    onAction,
    onConfirm,
    onCancel,
    onSkip,
    onResend,
}) => {
    const actionColor = destructive ? 'red' : undefined;
    if (waiting && (phase.kind === 'editing' || phase.kind === 'confirming')) {
        return (
            <Group gap="xs">
                <Loader size="xs" />
                <Text fz="xs" c="dimmed">
                    Waiting for the agent…
                </Text>
            </Group>
        );
    }
    switch (phase.kind) {
        case 'editing':
            return (
                <Group justify="flex-end" gap="xs">
                    <Button size="xs" variant="default" onClick={onSkip}>
                        Skip
                    </Button>
                    <Button size="xs" color={actionColor} onClick={onAction}>
                        {action.label}
                    </Button>
                </Group>
            );
        case 'confirming':
            return (
                <Stack gap="xs">
                    <Text fz="sm">{action.confirm}</Text>
                    <Group justify="flex-end" gap="xs">
                        <Button size="xs" variant="default" onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button
                            size="xs"
                            color={actionColor}
                            onClick={onConfirm}
                        >
                            Confirm
                        </Button>
                    </Group>
                </Stack>
            );
        case 'running':
            return (
                <Group justify="space-between" gap="xs">
                    <Text fz="xs" c="dimmed">
                        {progressText(phase.progress)}
                    </Text>
                    <Button size="xs" color={actionColor} loading>
                        {action.label}
                    </Button>
                </Group>
            );
        case 'sending':
            return (
                <Stack gap="xs">
                    <OutcomeNotice
                        submission={phase.submission}
                        compiled={compiled}
                    />
                    <Group gap="xs">
                        <Loader size="xs" />
                        <Text fz="xs" c="dimmed">
                            Sending to the agent…
                        </Text>
                    </Group>
                </Stack>
            );
        case 'sent':
            return (
                <Stack gap="xs">
                    <OutcomeNotice
                        submission={phase.submission}
                        compiled={compiled}
                    />
                    <Text fz="xs" c="dimmed">
                        Sent to the agent.
                    </Text>
                </Stack>
            );
        case 'sendFailed':
            return (
                <Stack gap="xs">
                    <OutcomeNotice
                        submission={phase.submission}
                        compiled={compiled}
                    />
                    <Group justify="space-between" gap="xs">
                        <Text fz="xs" c="red">
                            {phase.message}
                        </Text>
                        <Button
                            size="xs"
                            variant="default"
                            onClick={() => onResend(phase.submission)}
                        >
                            Send again
                        </Button>
                    </Group>
                </Stack>
            );
        case 'resolvedElsewhere':
            return (
                <Text fz="xs" c="dimmed">
                    This form was already completed elsewhere.
                </Text>
            );
        default:
            return assertUnreachable(phase, 'Unknown generative UI phase');
    }
};

const GenerativeUiForm: FC<{
    toolCallId: string;
    compiled: GenerativeUiCompiledSpec;
    waiting: boolean;
    fetcher: GenerativeUiFetcher;
    onSubmit: (
        submission: GenerativeUiActionSubmission,
    ) => Promise<GenerativeUiSubmitResult>;
}> = ({ toolCallId, compiled, waiting, fetcher, onSubmit }) => {
    const { spec } = compiled;
    const fields = useMemo(() => fieldsOf(spec.blocks), [spec]);
    const labels = useMemo(
        () => new Map(fields.map((field) => [field.key, field.label])),
        [fields],
    );
    const form = useForm<GenerativeUiState>({
        initialValues: initialStateOf(fields),
    });
    const [phase, setPhase] = useState<Phase>({ kind: 'editing' });
    const { queryStates, loaded } = useGenerativeUiQueries({
        toolCallId,
        compiled,
        state: form.values,
        fetcher,
    });

    const send = async (submission: GenerativeUiActionSubmission) => {
        setPhase({ kind: 'sending', submission });
        try {
            const result = await onSubmit(submission);
            switch (result.kind) {
                case 'sent':
                    setPhase({ kind: 'sent', submission });
                    return;
                case 'resolvedElsewhere':
                    setPhase({ kind: 'resolvedElsewhere', submission });
                    return;
                default:
                    assertUnreachable(
                        result,
                        'Unknown generative UI submit result',
                    );
            }
        } catch (error) {
            setPhase({
                kind: 'sendFailed',
                submission,
                message: errorMessageOf(error),
            });
        }
    };

    const run = async () => {
        setPhase({ kind: 'running', progress: null });
        const submission = await runGenerativeUiAction({
            compiled,
            state: form.values,
            queries: loaded,
            fetcher,
            onProgress: (progress) => setPhase({ kind: 'running', progress }),
        });
        await send(submission);
    };

    const onAction = () => {
        const errors = validateFields(fields, form.values);
        form.setErrors(errors);
        if (Object.keys(errors).length > 0) return;
        if (spec.action.confirm === undefined) {
            void run();
            return;
        }
        setPhase({ kind: 'confirming' });
    };

    const context: GenerativeUiRenderContext = {
        state: form.values,
        errors: form.errors,
        locked: phase.kind !== 'editing' || waiting,
        queryStates,
        loadedQueries: loaded,
        labels,
        setValue: (key, value) => form.setFieldValue(key, value),
    };

    return (
        <Paper p="md">
            <Stack gap="md">
                <Stack gap={4}>
                    <Group gap="xs" wrap="nowrap">
                        <MantineIcon icon={IconForms} color="indigo.5" />
                        <Title order={5}>{spec.title}</Title>
                    </Group>
                    {spec.description === undefined ? null : (
                        <Text fz="sm" c="dimmed">
                            {spec.description}
                        </Text>
                    )}
                </Stack>
                <Stack gap="sm">
                    <BlockList blocks={spec.blocks} context={context} />
                </Stack>
                <Footer
                    phase={phase}
                    waiting={waiting}
                    action={spec.action}
                    destructive={compiled.steps.some(
                        ({ operation }) => operation.method === 'DELETE',
                    )}
                    compiled={compiled}
                    onAction={onAction}
                    onConfirm={() => void run()}
                    onCancel={() => setPhase({ kind: 'editing' })}
                    onSkip={() =>
                        void send({ status: 'dismissed', state: form.values })
                    }
                    onResend={(submission) => void send(submission)}
                />
            </Stack>
        </Paper>
    );
};

/**
 * The card the agent renders with generateUi: inputs, read-only queries and
 * one action that runs as the signed-in user. The outcome goes to onSubmit.
 */
export const GenerativeUiCard: FC<GenerativeUiCardProps> = ({
    toolCallId,
    projectUuid,
    toolArgs,
    operations,
    waiting,
    fetcher = lightdashApiFetcher,
    onSubmit,
}) => {
    const result = useMemo((): GenerativeUiCompileResult => {
        const parsed = toolGenerateUiArgsSchema.safeParse(toolArgs);
        if (!parsed.success) {
            return {
                ok: false,
                problems: parsed.error.issues.map(
                    (issue) =>
                        `${issue.path.map(String).join('.')}: ${issue.message}`,
                ),
            };
        }
        return compileGenerativeUiSpec(parsed.data, {
            operations: new Map(
                operations.map((operation) => [
                    operation.operationId,
                    operation,
                ]),
            ),
            projectUuid,
        });
    }, [toolArgs, operations, projectUuid]);

    if (!result.ok) {
        return (
            <Callout variant="danger" title="This card could not be shown">
                <Stack gap={2}>
                    {result.problems.map((problem, index) => (
                        <Text key={`${index}:${problem}`} fz="xs">
                            {problem}
                        </Text>
                    ))}
                </Stack>
            </Callout>
        );
    }

    return (
        <GenerativeUiForm
            key={toolCallId}
            toolCallId={toolCallId}
            compiled={result.compiled}
            waiting={waiting}
            fetcher={fetcher}
            onSubmit={onSubmit}
        />
    );
};
