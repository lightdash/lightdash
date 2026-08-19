import {
    ActionIcon,
    Anchor,
    Box,
    Group,
    Loader,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconArrowUp,
    IconPaperclip,
    IconPlayerStop,
    IconX,
} from '@tabler/icons-react';
import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
    type ClipboardEventHandler,
    type DragEventHandler,
} from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { ComposerSubmitButton } from '../../../components/common/PromptComposer/ComposerSubmitButton';
import PromptComposer, {
    type PromptComposerHandle,
} from '../../../components/common/PromptComposer/PromptComposer';
import {
    ModelPicker,
    SelectedAttachmentSection,
} from '../../apps/AppResourcePicker';
import AppVersionNarration from '../../apps/components/AppVersionNarration';
import { type ClarificationRound } from '../../apps/hooks/useClarificationRound';
import { type DataAppModelSelection } from '../../apps/hooks/useDataAppModelSelection';
import {
    hasVersionNarration,
    type AppVersionNarrationData,
} from '../../apps/utils/versionNarration';
import {
    type DataAppVizBuildState,
    type VizBuildRequest,
} from '../hooks/useDataAppVizBuild';
import { useVizComposerAttachments } from '../hooks/useVizComposerAttachments';
import classes from './BuilderPromptBar.module.css';
import ClarifyingQuestions from './ClarifyingQuestions';

type Props = {
    projectUuid: string;
    /** The viz, or the pre-claimed draft uuid while nothing exists yet. */
    composerAppUuid: string;
    /** Stable across the create route adopting its claimed app uuid. */
    sessionKey: string;
    hasVersions: boolean;
    isBuilding: boolean;
    buildingPrompt: string | null;
    elapsed: string | null;
    latestReadyVersion: number | null;
    build: DataAppVizBuildState;
    onCancelBuild: (() => void) | null;
    narration: AppVersionNarrationData;
    modelSelection: DataAppModelSelection;
    /** The pre-build clarifying round every send passes through. */
    clarification: ClarificationRound<VizBuildRequest>;
};

type QueuedPrompt = {
    id: number;
    request: VizBuildRequest;
};

export type BuilderPromptBarHandle = {
    /** Replaces the draft with `text` and focuses the composer. */
    setPrompt: (text: string) => void;
};

const QueuedPromptRow = ({
    item,
    state,
    canInterrupt,
    onEdit,
    onRemove,
    onSendNow,
}: {
    item: QueuedPrompt;
    state: 'queued' | 'next' | 'sending';
    canInterrupt: boolean;
    onEdit: () => void;
    onRemove: () => void;
    onSendNow: () => void;
}) => (
    <Box
        className={`${classes.stackRow} ${classes.queuedPrompt}`}
        data-state={state}
        role="listitem"
    >
        {state === 'sending' && <Loader size={12} color="ldGray.6" />}
        <UnstyledButton
            className={classes.queuedPromptText}
            aria-label={`Edit queued prompt: ${item.request.description}`}
            onClick={onEdit}
            disabled={state === 'sending'}
        >
            <Text fz="xs" lineClamp={1}>
                {item.request.description}
            </Text>
        </UnstyledButton>
        <Text className={classes.queueState} fz="xs">
            {state === 'sending'
                ? 'Sending…'
                : state === 'next'
                  ? 'Next up'
                  : 'Queued'}
        </Text>
        {state === 'queued' && canInterrupt && (
            <Anchor
                component="button"
                type="button"
                size="xs"
                fw={500}
                onClick={onSendNow}
            >
                Send now
            </Anchor>
        )}
        {state !== 'sending' && (
            <ActionIcon
                variant="subtle"
                color="ldGray"
                size="xs"
                aria-label={`Remove queued prompt: ${item.request.description}`}
                onClick={onRemove}
            >
                <MantineIcon icon={IconX} size={14} />
            </ActionIcon>
        )}
    </Box>
);

const PromptPill = forwardRef<BuilderPromptBarHandle, Props>(
    function PromptPill(
        {
            projectUuid,
            composerAppUuid,
            hasVersions,
            isBuilding,
            buildingPrompt,
            elapsed,
            latestReadyVersion,
            build,
            onCancelBuild,
            narration,
            modelSelection,
            clarification,
        },
        ref,
    ) {
        const attachments = useVizComposerAttachments({
            projectUuid,
            appUuid: composerAppUuid,
        });
        const composerRef = useRef<PromptComposerHandle>(null);
        const fileInputRef = useRef<HTMLInputElement>(null);
        const nextQueueId = useRef(0);
        const editingPrompt = useRef<QueuedPrompt | null>(null);
        const interruptPending = useRef(false);
        const lastHandledReadyVersion = useRef(latestReadyVersion);
        const [isEmpty, setIsEmpty] = useState(true);
        const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([]);
        const [sendingPrompt, setSendingPrompt] = useState<QueuedPrompt | null>(
            null,
        );
        const [interruptNext, setInterruptNext] = useState<QueuedPrompt | null>(
            null,
        );

        useImperativeHandle(ref, () => ({
            setPrompt: (text) => {
                editingPrompt.current = null;
                composerRef.current?.clear();
                composerRef.current?.insertContent([{ type: 'text', text }]);
            },
        }));

        const canSubmit = !attachments.isUploading;
        const sendBuild = build.send;
        const buildError = build.error;
        const cancelActiveBuild = interruptNext
            ? build.interrupt
            : onCancelBuild;
        const isCancelling = build.isCancelling;

        const handleSubmit = () => {
            const description = composerRef.current?.getText().trim() ?? '';
            if (!description || !canSubmit) return;
            const editing = editingPrompt.current;
            const request: VizBuildRequest = {
                description,
                fileIds:
                    attachments.fileIds.length > 0
                        ? attachments.fileIds
                        : (editing?.request.fileIds ?? []),
                ...modelSelection.modelRequest,
                clarifications: [],
            };
            const queuedPrompt: QueuedPrompt = {
                id: editing?.id ?? nextQueueId.current++,
                request,
            };
            editingPrompt.current = null;
            composerRef.current?.clear();
            attachments.clear();

            if (isBuilding) {
                setQueuedPrompts((current) => [...current, queuedPrompt]);
                return;
            }
            clarification.send(request);
        };

        // The pencil and Cancel end the same way: prompt back in the composer.
        const handleReclaimPrompt = () => {
            const prompt = clarification.abandon();
            if (prompt === null) return;
            composerRef.current?.insertContent([
                { type: 'text', text: prompt },
            ]);
            composerRef.current?.focus();
        };

        const handleEdit = (item: QueuedPrompt) => {
            setQueuedPrompts((current) =>
                current.filter((queued) => queued.id !== item.id),
            );
            editingPrompt.current = item;
            modelSelection.setModel(
                item.request.codexModel ?? item.request.claudeModel,
            );
            composerRef.current?.clear();
            composerRef.current?.insertContent([
                { type: 'text', text: item.request.description },
            ]);
        };

        const handleSendNow = (item: QueuedPrompt) => {
            if (!build.interrupt || interruptPending.current) return;
            interruptPending.current = true;
            setQueuedPrompts((current) =>
                current.filter((queued) => queued.id !== item.id),
            );
            setInterruptNext(item);
            build.interrupt();
        };

        const handleCancelBuild = () => {
            if (!cancelActiveBuild) return;
            if (!interruptNext) setSendingPrompt(null);
            cancelActiveBuild();
        };

        // Backend completion is the event that advances this session-local
        // queue; composer click handlers cannot know when that has settled.
        useEffect(
            function advanceQueueAfterBuildSettles() {
                if (isBuilding || isCancelling || buildError !== null) return;

                if (interruptNext) {
                    interruptPending.current = false;
                    setInterruptNext(null);
                    setSendingPrompt(interruptNext);
                    sendBuild(interruptNext.request);
                    return;
                }

                if (latestReadyVersion === lastHandledReadyVersion.current)
                    return;
                lastHandledReadyVersion.current = latestReadyVersion;

                const [next, ...remaining] = queuedPrompts;
                if (!next) {
                    setSendingPrompt(null);
                    return;
                }
                setQueuedPrompts(remaining);
                setSendingPrompt(next);
                sendBuild(next.request);
            },
            [
                buildError,
                interruptNext,
                isBuilding,
                isCancelling,
                latestReadyVersion,
                queuedPrompts,
                sendBuild,
            ],
        );

        const handlePaste: ClipboardEventHandler = (event) => {
            if (event.clipboardData.files.length === 0) return;
            event.preventDefault();
            attachments.add(Array.from(event.clipboardData.files));
        };

        const handleDragOver: DragEventHandler = (event) => {
            event.preventDefault();
        };

        const handleDrop: DragEventHandler = (event) => {
            event.preventDefault();
            attachments.add(Array.from(event.dataTransfer.files));
        };

        const visibleSendingPrompt =
            !isBuilding && buildError === null ? sendingPrompt : null;
        const queuedStackSize =
            queuedPrompts.length + (visibleSendingPrompt ? 1 : 0);
        const isClarifying = clarification.clarifyingPrompt !== null;
        const hasNarration = hasVersionNarration(narration);
        const questions = clarification.pending;
        const hasStack = queuedStackSize > 0 || isBuilding || isClarifying;
        // Read-only, not just unsubmittable: text typed here would be lost.
        const isComposerLocked = isClarifying || questions !== null;

        return (
            <Box
                className={classes.pillHost}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                {questions !== null && (
                    <ClarifyingQuestions
                        prompt={questions.prompt}
                        questions={questions.questions}
                        answers={clarification.answers}
                        onAnswer={clarification.answer}
                        onEditPrompt={handleReclaimPrompt}
                        onSkip={() => clarification.build(true)}
                        onBuild={() => clarification.build(false)}
                    />
                )}
                {hasStack && (
                    <Box
                        className={classes.queue}
                        data-building={isBuilding || isClarifying || undefined}
                        data-narration={
                            (isBuilding && hasNarration) || undefined
                        }
                    >
                        {isClarifying && (
                            <Box
                                className={`${classes.stackRow} ${classes.buildingStatus}`}
                            >
                                <Loader size={13} color="ldGray.6" />
                                <Text fz="xs" fw={600} c="ldGray.9" inherit>
                                    Reading your prompt…
                                </Text>
                                <Text
                                    className={classes.buildingPrompt}
                                    fz="xs"
                                    c="dimmed"
                                    lineClamp={1}
                                >
                                    “{clarification.clarifyingPrompt}”
                                </Text>
                                <Anchor
                                    className={classes.cancelBuild}
                                    component="button"
                                    type="button"
                                    size="xs"
                                    c="dimmed"
                                    fw={500}
                                    onClick={handleReclaimPrompt}
                                >
                                    Cancel
                                </Anchor>
                            </Box>
                        )}
                        {isBuilding && (
                            <Box
                                className={`${classes.stackRow} ${classes.buildingStatus}`}
                                data-has-narration={hasNarration || undefined}
                            >
                                <Loader size={13} color="ldGray.6" />
                                <Text fz="xs" fw={600} c="ldGray.9" inherit>
                                    Building…{elapsed ? ` ${elapsed}` : ''}
                                </Text>
                                {build.cancelError ? (
                                    <Text
                                        className={classes.buildingPrompt}
                                        fz="xs"
                                        c="red.6"
                                        lineClamp={1}
                                        role="alert"
                                    >
                                        Could not cancel: {build.cancelError}
                                    </Text>
                                ) : (
                                    buildingPrompt && (
                                        <Text
                                            className={classes.buildingPrompt}
                                            fz="xs"
                                            c="dimmed"
                                            lineClamp={1}
                                        >
                                            “{buildingPrompt}”
                                        </Text>
                                    )
                                )}
                                {queuedPrompts.length > 0 && (
                                    <Text
                                        fz="xs"
                                        c="dimmed"
                                        className={classes.queuedCount}
                                    >
                                        · {queuedPrompts.length} queued
                                    </Text>
                                )}
                                {cancelActiveBuild && (
                                    <Anchor
                                        className={classes.cancelBuild}
                                        component="button"
                                        type="button"
                                        size="xs"
                                        c="dimmed"
                                        fw={500}
                                        onClick={handleCancelBuild}
                                        disabled={isCancelling}
                                    >
                                        {isCancelling
                                            ? 'Cancelling…'
                                            : 'Cancel'}
                                    </Anchor>
                                )}
                            </Box>
                        )}
                        {isBuilding && hasNarration && (
                            <AppVersionNarration
                                narration={narration}
                                isLive
                                className={classes.liveNarration}
                            />
                        )}
                        {queuedStackSize > 0 && (
                            <Box
                                className={classes.queueList}
                                role="list"
                                aria-label={`${queuedStackSize} queued ${queuedStackSize === 1 ? 'prompt' : 'prompts'}`}
                            >
                                {visibleSendingPrompt && (
                                    <QueuedPromptRow
                                        item={visibleSendingPrompt}
                                        state="sending"
                                        canInterrupt={false}
                                        onEdit={() => undefined}
                                        onRemove={() => undefined}
                                        onSendNow={() => undefined}
                                    />
                                )}
                                {queuedPrompts.map((item, index) => (
                                    <QueuedPromptRow
                                        key={item.id}
                                        item={item}
                                        state={
                                            !isBuilding && index === 0
                                                ? 'next'
                                                : 'queued'
                                        }
                                        canInterrupt={
                                            isBuilding &&
                                            build.interrupt !== null &&
                                            interruptNext === null &&
                                            !isCancelling
                                        }
                                        onEdit={() => handleEdit(item)}
                                        onRemove={() =>
                                            setQueuedPrompts((current) =>
                                                current.filter(
                                                    (queued) =>
                                                        queued.id !== item.id,
                                                ),
                                            )
                                        }
                                        onSendNow={() => handleSendNow(item)}
                                    />
                                ))}
                            </Box>
                        )}
                    </Box>
                )}
                <PromptComposer
                    ref={composerRef}
                    variant="inline"
                    placeholder={
                        questions !== null
                            ? 'Answer the questions, or skip, to build…'
                            : isClarifying
                              ? 'Reading your prompt…'
                              : isBuilding
                                ? 'Ask for another change…'
                                : hasVersions
                                  ? 'Ask for a change…'
                                  : 'Describe a new chart type…'
                    }
                    disabled={isComposerLocked}
                    submitDisabled={!canSubmit || isComposerLocked}
                    onEmptyChange={setIsEmpty}
                    onSubmit={handleSubmit}
                    onPaste={handlePaste}
                    attachments={
                        attachments.attachments.length > 0 ? (
                            <SelectedAttachmentSection
                                attachments={attachments.attachments.map(
                                    (attachment) => ({
                                        id: attachment.key,
                                        previewUrl: attachment.previewUrl,
                                        filename: attachment.filename,
                                    }),
                                )}
                                onRemove={attachments.remove}
                            />
                        ) : undefined
                    }
                    toolbarRight={
                        <Group
                            gap="calc(var(--mantine-spacing-xs) / 2)"
                            align="center"
                            wrap="nowrap"
                        >
                            {questions !== null ? (
                                <Text
                                    className={classes.queueHint}
                                    fz="xs"
                                    c="dimmed"
                                >
                                    Answer or skip first
                                </Text>
                            ) : isBuilding && !isEmpty ? (
                                <Text
                                    className={classes.queueHint}
                                    fz="xs"
                                    c="dimmed"
                                >
                                    Enter to queue
                                </Text>
                            ) : (
                                <ModelPicker
                                    value={modelSelection.selectedModel}
                                    onChange={modelSelection.setModel}
                                    disabled={modelSelection.isLoading}
                                    visibleModels={modelSelection.visibleModels}
                                    codingAgent={modelSelection.codingAgent}
                                />
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                hidden
                                onChange={(event) => {
                                    attachments.add(
                                        Array.from(event.target.files ?? []),
                                    );
                                    event.target.value = '';
                                }}
                            />
                            <Tooltip withArrow label="Attach an image or file">
                                <ActionIcon
                                    variant="subtle"
                                    color="ldGray"
                                    size="sm"
                                    aria-label="Attach"
                                    onClick={() =>
                                        fileInputRef.current?.click()
                                    }
                                >
                                    <MantineIcon icon={IconPaperclip} />
                                </ActionIcon>
                            </Tooltip>
                            {isBuilding && isEmpty && cancelActiveBuild ? (
                                <ComposerSubmitButton
                                    icon={IconPlayerStop}
                                    label={
                                        isCancelling
                                            ? 'Cancelling generation'
                                            : 'Stop generation'
                                    }
                                    size="sm"
                                    destructive
                                    disabled={isCancelling}
                                    loading={isCancelling}
                                    onClick={handleCancelBuild}
                                />
                            ) : (
                                <ComposerSubmitButton
                                    icon={IconArrowUp}
                                    label={
                                        isBuilding ? 'Queue message' : 'Send'
                                    }
                                    size="sm"
                                    disabled={
                                        isEmpty ||
                                        !canSubmit ||
                                        isComposerLocked
                                    }
                                    onClick={handleSubmit}
                                />
                            )}
                        </Group>
                    }
                />
            </Box>
        );
    },
);

/** The floating prompt pill; a failed send reports itself right above it. */
const BuilderPromptBar = forwardRef<BuilderPromptBarHandle, Props>(
    function BuilderPromptBar(props, ref) {
        return (
            <Box className={classes.wrap}>
                {props.build.error !== null && (
                    <Box className={classes.failedPill}>
                        <Text fz={13} c="red.7" lineClamp={1}>
                            {props.build.error}
                        </Text>
                        {props.build.retry && (
                            <Anchor
                                component="button"
                                type="button"
                                size="xs"
                                onClick={props.build.retry}
                            >
                                Retry
                            </Anchor>
                        )}
                    </Box>
                )}
                {/* Remount on intentional app changes so drafts, attachments,
                    and queued prompts never leak between visualizations. */}
                <PromptPill key={props.sessionKey} ref={ref} {...props} />
            </Box>
        );
    },
);

export default BuilderPromptBar;
