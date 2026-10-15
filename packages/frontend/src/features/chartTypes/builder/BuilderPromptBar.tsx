import { subject } from '@casl/ability';
import { getErrorMessage, type ApiAppVersionSummary } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Pill,
    Stack,
    Group,
    Loader,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconArrowUp,
    IconCamera,
    IconPlugConnected,
    IconPlayerStop,
    IconX,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
    type ClipboardEventHandler,
    type DragEventHandler,
} from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';
import { ComposerSubmitButton } from '../../../components/common/PromptComposer/ComposerSubmitButton';
import PromptComposer, {
    type PromptComposerHandle,
} from '../../../components/common/PromptComposer/PromptComposer';
import useToaster from '../../../hooks/toaster/useToaster';
import useApp from '../../../providers/App/useApp';
import {
    ModelPicker,
    SelectedAttachmentSection,
    type SelectedConnection,
} from '../../apps/AppResourcePicker';
import AppVersionNarration from '../../apps/components/AppVersionNarration';
import { ElementPickerButton } from '../../apps/components/ElementPickerButton';
import { ElementRefPill } from '../../apps/components/ElementRefPill';
import { SampleDataButton } from '../../apps/components/SampleDataButton';
import { type ClarificationRound } from '../../apps/hooks/useClarificationRound';
import { type DataAppModelSelection } from '../../apps/hooks/useDataAppModelSelection';
import { type UseElementPickerResult } from '../../apps/hooks/useElementPicker';
import { elementRefKey } from '../../apps/utils/elementRefs';
import {
    hasVersionNarration,
    type AppVersionNarrationData,
} from '../../apps/utils/versionNarration';
import { useAppExternalConnections } from '../../externalConnections/hooks/useAppExternalConnections';
import { ThemePicker } from '../../organizationDesigns/components/ThemePicker';
import { useOrganizationDesigns } from '../../organizationDesigns/hooks/useOrganizationDesigns';
import {
    type DataAppVizBuildState,
    type VizBuildRequest,
} from '../hooks/useDataAppVizBuild';
import { useVizComposerAttachments } from '../hooks/useVizComposerAttachments';
import { normalizeVizBuildContext } from '../utils/vizBuildContext';
import classes from './BuilderPromptBar.module.css';
import ChartTypeComposerActions, {
    type ComposerPanel,
} from './ChartTypeComposerActions';
import ClarifyingQuestions from './ClarifyingQuestions';
import DataSourceChip from './DataSourceChip';
import { type ExploreSourceControls } from './exploreSource';
import { type SavedChartSourceControls } from './savedChartSource';

type Props = {
    projectUuid: string;
    /** The viz, or the pre-claimed draft uuid while nothing exists yet. */
    composerAppUuid: string;
    /** Stable across the create route adopting its claimed app uuid. */
    sessionKey: string;
    hasVersions: boolean;
    isNewChart: boolean;
    latestVersion: ApiAppVersionSummary | null;
    isBuilding: boolean;
    buildingPrompt: string | null;
    elapsed: string | null;
    latestReadyVersion: number | null;
    build: DataAppVizBuildState;
    onCancelBuild: (() => void) | null;
    narration: AppVersionNarrationData;
    modelSelection: DataAppModelSelection;
    /** Existing schema and host-field mapping supplied with every revision. */
    buildContext?: VizBuildRequest['context'];
    /** The saved chart backing the session; null on hosts that offer none.
     *  Its chip replaces the round sample-data button. */
    savedChartSource?: SavedChartSourceControls | null;
    /** The explore backing the session; null on hosts that offer none. Its
     *  chip replaces the saved chart's while one is attached. */
    exploreSource?: ExploreSourceControls | null;
    /** The sample-data button's state; the host owns it so other surfaces
     *  can describe what the next prompt carries. */
    includeSampleData: boolean;
    onIncludeSampleDataChange: (included: boolean) => void;
    elementPicker?: UseElementPickerResult;
    onCaptureScreenshot?: () => Promise<File>;
    /** The pre-build clarifying round every send passes through. */
    clarification: ClarificationRound<VizBuildRequest>;
};

type QueuedPrompt = {
    id: number;
    request: VizBuildRequest;
    sourceIdentity: string | null;
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
}) => {
    const { t } = useTranslation('chartTypes');
    return (
        <Box
            className={`${classes.stackRow} ${classes.queuedPrompt}`}
            data-state={state}
            role="listitem"
        >
            {state === 'sending' && <Loader size={12} color="ldGray.6" />}
            <UnstyledButton
                className={classes.queuedPromptText}
                aria-label={t('promptBar.editQueued', {
                    description: item.request.description,
                })}
                onClick={onEdit}
                disabled={state === 'sending'}
            >
                <Text fz="xs" lineClamp={1}>
                    {item.request.description}
                </Text>
            </UnstyledButton>
            <Text className={classes.queueState} fz="xs">
                {state === 'sending'
                    ? t('promptBar.sending')
                    : state === 'next'
                      ? t('promptBar.nextUp')
                      : t('promptBar.queued')}
            </Text>
            {state === 'queued' && canInterrupt && (
                <Anchor
                    component="button"
                    type="button"
                    size="xs"
                    fw={500}
                    onClick={onSendNow}
                >
                    {t('promptBar.sendNow')}
                </Anchor>
            )}
            {state !== 'sending' && (
                <ActionIcon
                    color="ldGray"
                    size="xs"
                    aria-label={t('promptBar.removeQueued', {
                        description: item.request.description,
                    })}
                    onClick={onRemove}
                >
                    <MantineIcon icon={IconX} size={14} />
                </ActionIcon>
            )}
        </Box>
    );
};

const PromptPill = forwardRef<BuilderPromptBarHandle, Props>(
    function PromptPill(
        {
            projectUuid,
            composerAppUuid,
            hasVersions,
            isNewChart,
            latestVersion,
            isBuilding,
            buildingPrompt,
            elapsed,
            latestReadyVersion,
            build,
            onCancelBuild,
            narration,
            modelSelection,
            clarification,
            buildContext,
            savedChartSource = null,
            exploreSource = null,
            includeSampleData,
            onIncludeSampleDataChange,
            elementPicker,
            onCaptureScreenshot,
        },
        ref,
    ) {
        const { t } = useTranslation('chartTypes');
        const attachments = useVizComposerAttachments({
            projectUuid,
            appUuid: composerAppUuid,
        });
        const composerRef = useRef<PromptComposerHandle>(null);
        const fileInputRef = useRef<HTMLInputElement>(null);
        const nextQueueId = useRef(0);
        const editingPrompt = useRef<QueuedPrompt | null>(null);
        const clarifyingSourceIdentity = useRef<string | null>(null);
        const interruptPending = useRef(false);
        const queuePausedByStop = useRef(false);
        const lastHandledReadyVersion = useRef(latestReadyVersion);
        const [isEmpty, setIsEmpty] = useState(true);
        const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([]);
        const [sendingPrompt, setSendingPrompt] = useState<QueuedPrompt | null>(
            null,
        );
        const [interruptNext, setInterruptNext] = useState<QueuedPrompt | null>(
            null,
        );
        const [selectedConnections, setSelectedConnections] = useState<
            SelectedConnection[]
        >([]);
        const [isCapturingScreenshot, setIsCapturingScreenshot] =
            useState(false);
        const queryClient = useQueryClient();
        const { health, user } = useApp();
        const canIncludeSampleData =
            health.data?.dataApps.sampleDataEnabled !== false &&
            Boolean(buildContext?.sampleRows?.length);
        const sourceIdentity =
            savedChartSource?.sourceIdentity ??
            exploreSource?.sourceIdentity ??
            null;
        const { showToastError } = useToaster();
        const [composerPanel, setComposerPanel] = useState<ComposerPanel>(null);
        const { data: linkedConnections = [] } = useAppExternalConnections(
            projectUuid,
            hasVersions ? composerAppUuid : undefined,
        );
        const pendingConnections = selectedConnections.filter(
            (connection) =>
                !linkedConnections.some(
                    (link) =>
                        link.connection.externalConnectionUuid ===
                        connection.externalConnectionUuid,
                ),
        );
        const deselectConnection = (uuid: string) =>
            setSelectedConnections((current) =>
                current.filter(
                    (connection) => connection.externalConnectionUuid !== uuid,
                ),
            );
        // Org members without theme access get a 403 from the listing.
        const canViewThemes = Boolean(
            user.data?.ability.can(
                'view',
                subject('OrganizationDesign', {
                    organizationUuid: user.data.organizationUuid,
                }),
            ),
        );
        const themesQuery = useOrganizationDesigns({ enabled: canViewThemes });
        const themes = themesQuery.data ?? [];
        const [newThemeUuid, setNewThemeUuid] = useState<
            string | null | undefined
        >();
        const savedDesign = latestVersion?.resources?.design ?? null;
        const initialThemeUuid =
            newThemeUuid !== undefined
                ? newThemeUuid
                : (themes.find((theme) => theme.isDefault)?.designUuid ?? null);
        const selectedThemeUuid = isNewChart
            ? initialThemeUuid
            : (savedDesign?.designUuid ?? null);
        const themeName =
            themesQuery.isError && isNewChart
                ? t('promptBar.themesUnavailable')
                : themesQuery.isInitialLoading && isNewChart
                  ? t('promptBar.loadingThemes')
                  : selectedThemeUuid === null
                    ? t('promptBar.noTheme')
                    : (themes.find(
                          (theme) => theme.designUuid === selectedThemeUuid,
                      )?.name ??
                      (savedDesign?.designUuid === selectedThemeUuid
                          ? savedDesign.name
                          : t('promptBar.selectedTheme')));

        // A finished build may have linked connections; refresh the count.
        useEffect(() => {
            if (!hasVersions) return;
            void queryClient.invalidateQueries({
                queryKey: [
                    'app-external-connections',
                    projectUuid,
                    composerAppUuid,
                ],
            });
        }, [
            composerAppUuid,
            hasVersions,
            latestReadyVersion,
            projectUuid,
            queryClient,
        ]);

        useImperativeHandle(ref, () => ({
            setPrompt: (text) => {
                editingPrompt.current = null;
                composerRef.current?.clear();
                composerRef.current?.insertContent([{ type: 'text', text }]);
            },
        }));

        // Themes are optional; only wait for the first fetch so the default
        // theme can be attached.
        const canSubmit =
            !attachments.isUploading &&
            !(isNewChart && themesQuery.isInitialLoading);
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
            const sendSampleData = canIncludeSampleData && includeSampleData;
            const context = normalizeVizBuildContext(
                buildContext,
                sendSampleData,
            );
            const request: VizBuildRequest = {
                description,
                fileIds:
                    attachments.fileIds.length > 0
                        ? attachments.fileIds
                        : (editing?.request.fileIds ?? []),
                ...modelSelection.modelRequest,
                clarifications: [],
                externalConnections: selectedConnections,
                ...(sendSampleData ? { includeSampleData: true } : {}),
                ...(context ? { context } : {}),
                ...(isNewChart && !isBuilding && themesQuery.isSuccess
                    ? { designUuid: initialThemeUuid }
                    : {}),
            };
            const queuedPrompt: QueuedPrompt = {
                id: editing?.id ?? nextQueueId.current++,
                request,
                sourceIdentity,
            };
            editingPrompt.current = null;
            composerRef.current?.clear();
            attachments.clear();
            setSelectedConnections([]);
            onIncludeSampleDataChange(false);

            if (isBuilding) {
                setQueuedPrompts((current) => [...current, queuedPrompt]);
                return;
            }
            // Sending directly after a stop is an explicit request to resume
            // the session and lets the queue continue after that build.
            queuePausedByStop.current = false;
            clarifyingSourceIdentity.current = sourceIdentity;
            clarification.send(request);
        };

        // The pencil and Cancel end the same way: prompt back in the composer.
        const handleReclaimPrompt = () => {
            const request = clarification.abandon();
            if (request === null) return;
            setSelectedConnections(request.externalConnections);
            onIncludeSampleDataChange(
                request.includeSampleData === true &&
                    clarifyingSourceIdentity.current === sourceIdentity,
            );
            clarifyingSourceIdentity.current = null;
            composerRef.current?.insertContent([
                { type: 'text', text: request.description },
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
            setSelectedConnections(item.request.externalConnections);
            onIncludeSampleDataChange(
                item.request.includeSampleData === true &&
                    item.sourceIdentity === sourceIdentity,
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
            if (!interruptNext) {
                // A direct Stop pauses queued work. "Send now" owns the
                // interrupt path and deliberately starts its selected prompt.
                queuePausedByStop.current = true;
                setSendingPrompt(null);
            }
            cancelActiveBuild();
        };

        const refreshQueuedRequest = useCallback(
            (item: QueuedPrompt): VizBuildRequest => {
                const { request } = item;
                const sourceMatches = item.sourceIdentity === sourceIdentity;
                const sendSampleData =
                    sourceMatches &&
                    canIncludeSampleData &&
                    request.includeSampleData === true;
                const latestContext = buildContext
                    ? {
                          ...buildContext,
                          elementReferences: request.context?.elementReferences,
                      }
                    : request.context;
                return {
                    ...request,
                    includeSampleData: sendSampleData,
                    context: normalizeVizBuildContext(
                        latestContext,
                        sendSampleData,
                    ),
                };
            },
            [buildContext, canIncludeSampleData, sourceIdentity],
        );

        // Backend completion is the event that advances this session-local
        // queue; composer click handlers cannot know when that has settled.
        useEffect(
            function advanceQueueAfterBuildSettles() {
                if (isBuilding || isCancelling || buildError !== null) return;
                if (queuePausedByStop.current) return;
                if (
                    latestReadyVersion !== null &&
                    buildContext &&
                    !buildContext.schema
                )
                    return;

                if (interruptNext) {
                    interruptPending.current = false;
                    setInterruptNext(null);
                    setSendingPrompt(interruptNext);
                    sendBuild(refreshQueuedRequest(interruptNext));
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
                sendBuild(refreshQueuedRequest(next));
            },
            [
                buildError,
                buildContext,
                interruptNext,
                isBuilding,
                isCancelling,
                latestReadyVersion,
                queuedPrompts,
                refreshQueuedRequest,
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

        const handleCaptureScreenshot = async () => {
            if (!onCaptureScreenshot || isCapturingScreenshot) return;
            setIsCapturingScreenshot(true);
            try {
                attachments.add([await onCaptureScreenshot()], {
                    kind: 'screenshot',
                });
            } catch (error) {
                showToastError({
                    title: t('promptBar.screenshotFailed'),
                    subtitle: getErrorMessage(error),
                });
            } finally {
                setIsCapturingScreenshot(false);
            }
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
        const themePickerDisabled =
            isBuilding ||
            isComposerLocked ||
            !themesQuery.isSuccess ||
            modelSelection.isLoading ||
            queuedStackSize > 0;

        const handleThemeChange = (designUuid: string | null) => {
            if (themePickerDisabled || designUuid === selectedThemeUuid) return;
            if (isNewChart) {
                setNewThemeUuid(designUuid);
                return;
            }
            build.send({
                description:
                    designUuid === null
                        ? 'Remove theme'
                        : `Apply theme: ${themes.find((theme) => theme.designUuid === designUuid)?.name ?? 'Selected theme'}`,
                designUuid,
                fileIds: [],
                clarifications: [],
                externalConnections: [],
                ...modelSelection.modelRequest,
            });
        };

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
                                <Text
                                    className={classes.buildingLabel}
                                    fz="xs"
                                    fw={600}
                                    inherit
                                >
                                    {t('promptBar.readingPrompt')}
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
                                    {t('actions.cancel', { ns: 'common' })}
                                </Anchor>
                            </Box>
                        )}
                        {isBuilding && (
                            <Box
                                className={`${classes.stackRow} ${classes.buildingStatus}`}
                                data-has-narration={hasNarration || undefined}
                            >
                                <Loader size={13} color="ldGray.6" />
                                <Text
                                    className={classes.buildingLabel}
                                    fz="xs"
                                    fw={600}
                                    inherit
                                >
                                    {elapsed
                                        ? t('promptBar.buildingElapsed', {
                                              elapsed,
                                          })
                                        : t('promptBar.building')}
                                </Text>
                                {build.cancelError ? (
                                    <Text
                                        className={classes.buildingPrompt}
                                        fz="xs"
                                        c="red.6"
                                        lineClamp={1}
                                        role="alert"
                                    >
                                        {t('promptBar.couldNotCancel', {
                                            error: build.cancelError,
                                        })}
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
                                        ·{' '}
                                        {t('promptBar.queuedCount', {
                                            count: queuedPrompts.length,
                                        })}
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
                                            ? t('promptBar.cancelling')
                                            : t('actions.cancel', {
                                                  ns: 'common',
                                              })}
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
                                aria-label={t('promptBar.queuedPrompts', {
                                    count: queuedStackSize,
                                })}
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
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    onChange={(event) => {
                        attachments.add(Array.from(event.target.files ?? []));
                        event.target.value = '';
                    }}
                />
                <PromptComposer
                    ref={composerRef}
                    variant="card"
                    size="sm"
                    className={classes.composer}
                    placeholder={
                        questions !== null
                            ? t('promptBar.placeholders.answerQuestions')
                            : isClarifying
                              ? t('promptBar.readingPrompt')
                              : isBuilding
                                ? t('promptBar.placeholders.anotherChange')
                                : hasVersions
                                  ? t('promptBar.placeholders.change')
                                  : t('promptBar.placeholders.newChartType')
                    }
                    disabled={isComposerLocked}
                    submitDisabled={!canSubmit || isComposerLocked}
                    onEmptyChange={setIsEmpty}
                    onSubmit={handleSubmit}
                    onPaste={handlePaste}
                    toolbarLeft={
                        <Group
                            gap="calc(var(--mantine-spacing-xs) / 2)"
                            wrap="nowrap"
                            miw={0}
                        >
                            <ChartTypeComposerActions
                                panel={composerPanel}
                                onPanelChange={setComposerPanel}
                                disabled={isComposerLocked}
                                onAttach={() => fileInputRef.current?.click()}
                                selectedConnections={selectedConnections}
                                onSelectConnection={(connection) =>
                                    setSelectedConnections((current) => [
                                        ...current,
                                        connection,
                                    ])
                                }
                                onDeselectConnection={deselectConnection}
                                linkedAppUuid={
                                    hasVersions ? composerAppUuid : null
                                }
                            />
                            {elementPicker?.available && (
                                <ElementPickerButton
                                    enabled={elementPicker.enabled}
                                    onToggle={elementPicker.toggle}
                                    disabled={isComposerLocked}
                                />
                            )}
                            {onCaptureScreenshot && (
                                <Tooltip
                                    label={t(
                                        'promptBar.attachScreenshotTooltip',
                                    )}
                                >
                                    <ActionIcon
                                        variant="subtle"
                                        color="gray"
                                        radius="xl"
                                        aria-label={t(
                                            'promptBar.attachScreenshot',
                                        )}
                                        onClick={() =>
                                            void handleCaptureScreenshot()
                                        }
                                        disabled={
                                            isComposerLocked ||
                                            isCapturingScreenshot
                                        }
                                        loading={isCapturingScreenshot}
                                    >
                                        <MantineIcon
                                            icon={IconCamera}
                                            size={16}
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                            {canIncludeSampleData && (
                                <SampleDataButton
                                    enabled={includeSampleData}
                                    onToggle={() =>
                                        onIncludeSampleDataChange(
                                            !includeSampleData,
                                        )
                                    }
                                    disabled={isComposerLocked}
                                />
                            )}
                            <Box
                                className={classes.contextTray}
                                role="group"
                                aria-label={t('promptBar.selectedContext')}
                            >
                                {(!isNewChart || canViewThemes) && (
                                    <ThemePicker
                                        compact
                                        value={
                                            isNewChart && !themesQuery.isSuccess
                                                ? null
                                                : selectedThemeUuid
                                        }
                                        fallbackLabel={
                                            selectedThemeUuid !== null ||
                                            !themesQuery.isSuccess
                                                ? themeName
                                                : undefined
                                        }
                                        disabled={themePickerDisabled}
                                        opened={composerPanel === 'theme'}
                                        onOpenedChange={(opened) =>
                                            setComposerPanel(
                                                opened ? 'theme' : null,
                                            )
                                        }
                                        onChange={handleThemeChange}
                                        selectionHint={
                                            isNewChart
                                                ? undefined
                                                : t(
                                                      'promptBar.themeRebuildHint',
                                                  )
                                        }
                                    />
                                )}
                                {canViewThemes && themesQuery.isError && (
                                    <Button
                                        size="compact-xs"
                                        variant="subtle"
                                        onClick={() =>
                                            void themesQuery.refetch()
                                        }
                                    >
                                        {t('promptBar.retryThemes')}
                                    </Button>
                                )}
                                <DataSourceChip
                                    savedChartSource={savedChartSource}
                                    exploreSource={exploreSource}
                                    disabled={isComposerLocked}
                                />
                                {linkedConnections.map(({ connection }) => (
                                    <Tooltip
                                        key={connection.externalConnectionUuid}
                                        label={t('promptBar.manageConnection', {
                                            name: connection.name,
                                        })}
                                    >
                                        <Button
                                            size="compact-xs"
                                            variant="light"
                                            radius="xl"
                                            disabled={isComposerLocked}
                                            onClick={() =>
                                                setComposerPanel('connections')
                                            }
                                            aria-label={t(
                                                'promptBar.manageConnection',
                                                { name: connection.name },
                                            )}
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconPlugConnected}
                                                    size={14}
                                                />
                                            }
                                        >
                                            <Text
                                                span
                                                inherit
                                                truncate
                                                className={
                                                    classes.connectionName
                                                }
                                            >
                                                {connection.name}
                                            </Text>
                                        </Button>
                                    </Tooltip>
                                ))}
                                {pendingConnections.map((connection) => (
                                    <Pill
                                        key={connection.externalConnectionUuid}
                                        withRemoveButton
                                        disabled={isComposerLocked}
                                        onRemove={() =>
                                            deselectConnection(
                                                connection.externalConnectionUuid,
                                            )
                                        }
                                        removeButtonProps={{
                                            'aria-label': t(
                                                'promptBar.removeConnection',
                                                { name: connection.name },
                                            ),
                                            'aria-hidden': false,
                                            tabIndex: 0,
                                        }}
                                    >
                                        <Group gap={4} wrap="nowrap">
                                            <MantineIcon
                                                icon={IconPlugConnected}
                                                size={12}
                                            />
                                            <Text
                                                span
                                                inherit
                                                truncate
                                                className={
                                                    classes.connectionName
                                                }
                                            >
                                                {connection.name}
                                            </Text>
                                        </Group>
                                    </Pill>
                                ))}
                            </Box>
                        </Group>
                    }
                    attachments={
                        attachments.attachments.length > 0 ||
                        !!elementPicker?.refs.length ||
                        questions !== null ? (
                            <Stack gap="xs" pb="xs">
                                {!!elementPicker?.refs.length && (
                                    <Group gap={4}>
                                        {elementPicker.refs.map(
                                            (elementRef) => (
                                                <ElementRefPill
                                                    key={elementRefKey(
                                                        elementRef,
                                                    )}
                                                    elementRef={elementRef}
                                                    onRemove={
                                                        isComposerLocked
                                                            ? undefined
                                                            : () =>
                                                                  elementPicker.remove(
                                                                      elementRef,
                                                                  )
                                                    }
                                                />
                                            ),
                                        )}
                                    </Group>
                                )}
                                {attachments.attachments.length > 0 && (
                                    <SelectedAttachmentSection
                                        attachments={attachments.attachments.map(
                                            (attachment) => ({
                                                id: attachment.key,
                                                previewUrl:
                                                    attachment.previewUrl,
                                                filename: attachment.filename,
                                            }),
                                        )}
                                        onRemove={attachments.remove}
                                        disabled={isComposerLocked}
                                    />
                                )}
                                {questions !== null ? (
                                    <Text size="xs" c="dimmed">
                                        {t('promptBar.answerOrSkipFirst')}
                                    </Text>
                                ) : null}
                            </Stack>
                        ) : undefined
                    }
                    toolbarRight={
                        <Group
                            gap="calc(var(--mantine-spacing-xs) / 2)"
                            align="center"
                            wrap="nowrap"
                        >
                            <ModelPicker
                                value={modelSelection.selectedModel}
                                onChange={modelSelection.setModel}
                                disabled={
                                    modelSelection.isLoading || isComposerLocked
                                }
                                visibleModels={modelSelection.visibleModels}
                                codingAgent={modelSelection.codingAgent}
                            />
                            {isBuilding && isEmpty ? (
                                <ComposerSubmitButton
                                    icon={IconPlayerStop}
                                    label={
                                        isCancelling
                                            ? t(
                                                  'promptBar.cancellingGeneration',
                                              )
                                            : t('promptBar.stopGeneration')
                                    }
                                    size="sm"
                                    destructive
                                    disabled={
                                        isCancelling || !cancelActiveBuild
                                    }
                                    loading={isCancelling}
                                    onClick={handleCancelBuild}
                                />
                            ) : (
                                <ComposerSubmitButton
                                    icon={IconArrowUp}
                                    label={
                                        isBuilding
                                            ? t('promptBar.queueMessage')
                                            : t('promptBar.send')
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
        const { t } = useTranslation('chartTypes');
        return (
            <Box className={classes.wrap}>
                {props.build.error !== null && (
                    <Box className={classes.failedPill}>
                        <Text fz="sm" c="red.7" lineClamp={1}>
                            {props.build.error}
                        </Text>
                        {props.build.retry && (
                            <Anchor
                                component="button"
                                type="button"
                                size="xs"
                                onClick={props.build.retry}
                            >
                                {t('actions.retry', { ns: 'common' })}
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
