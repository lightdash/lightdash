import {
    type GenerateSqlRunnerQueryRequest,
    type SqlRunnerAiTableContext,
    type SqlRunnerAiTarget,
} from '@lightdash/common';
import { type editor } from 'monaco-editor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    buildAiInlineHint,
    buildAiPreviewBlock,
} from '../../../components/common/AiInlineHint';
import { type Monaco } from '../../../components/MonacoEditor';
import { useProject } from '../../../hooks/useProject';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import {
    getActiveSqlAiPrompt,
    isSqlAiResponseStale,
    type SqlAiActivePrompt,
    type SqlAiRequestSnapshot,
} from '../utils/sqlAiPrompt';
import { useGenerateSqlRunnerQuery } from './useGenerateSqlRunnerQuery';

const AI_GENERIC_ERROR =
    "Couldn't generate SQL — try rephrasing or write it yourself.";
const PREVIEW_DEBOUNCE_MS = 800;
const PREVIEW_MIN_LENGTH = 5;
const PREVIEW_MAX_LINES = 12;
const PROMPT_CONTEXT_KEY = 'lightdashSqlAiPromptActive';
const HINT_WIDGET_ID = 'lightdash.sqlAi.inlineHint';
const TAB_CONTEXT = `${PROMPT_CONTEXT_KEY} && !suggestWidgetVisible && !editorHasSelection && !inSnippetMode`;

// A preview made before the known tables loaded, or for another target, is stale
const requestKey = ({
    prompt,
    currentSql,
    target,
    knownTables,
}: GenerateSqlRunnerQueryRequest) =>
    [
        prompt,
        currentSql ?? '',
        JSON.stringify(target),
        knownTables.map((table) => `${table.schema}.${table.table}`).join(','),
    ].join('\u0000');

const isSamePrompt = (
    a: SqlAiActivePrompt | null,
    b: SqlAiActivePrompt | null,
) =>
    a?.lineNumber === b?.lineNumber &&
    a?.prompt === b?.prompt &&
    a?.currentSql === b?.currentSql;

const readActivePrompt = (
    codeEditor: editor.IStandaloneCodeEditor,
): SqlAiActivePrompt | null => {
    const model = codeEditor.getModel();
    const position = codeEditor.getPosition();
    if (!model || !position) return null;
    return getActiveSqlAiPrompt({
        sql: model.getValue(),
        lineNumber: position.lineNumber,
        hasSelection: !(codeEditor.getSelection()?.isEmpty() ?? true),
    });
};

type Options = {
    codeEditor: editor.IStandaloneCodeEditor | null;
    monaco: Monaco | null;
    enabled: boolean;
    projectUuid: string | undefined;
    /** Null until the editor knows which warehouse it queries. */
    target: SqlRunnerAiTarget | null;
    knownTables: SqlRunnerAiTableContext[];
};

/**
 * Turns a `-- comment` under the cursor into an AI prompt: shows the Tab
 * keycap and a ghost preview, and Tab replaces the query with the result.
 */
export const useSqlAiAutocomplete = ({
    codeEditor,
    monaco,
    enabled,
    projectUuid,
    target,
    knownTables,
}: Options) => {
    const { data: project } = useProject(projectUuid);
    const { user } = useApp();
    const { track } = useTracking();

    const [activePrompt, setActivePrompt] = useState<SqlAiActivePrompt | null>(
        null,
    );
    const [previews, setPreviews] = useState<Record<string, string>>({});
    const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);
    const [provenance, setProvenance] = useState<{
        prompt: string;
        sql: string;
    } | null>(null);

    const activeRequest = useMemo(
        (): GenerateSqlRunnerQueryRequest | null =>
            activePrompt && target
                ? {
                      prompt: activePrompt.prompt,
                      currentSql: activePrompt.currentSql,
                      target,
                      knownTables,
                  }
                : null,
        [activePrompt, target, knownTables],
    );
    // Responses apply only to the query and warehouse they were requested for
    const startedRef = useRef<SqlAiRequestSnapshot | null>(null);
    const targetRef = useRef(target);
    targetRef.current = target;
    const readSnapshot = useCallback((): SqlAiRequestSnapshot | null => {
        const model = codeEditor?.getModel();
        const currentTarget = targetRef.current;
        if (!model || !currentTarget) return null;
        return {
            versionId: model.getAlternativeVersionId(),
            target: currentTarget,
        };
    }, [codeEditor]);

    const previewSql = activeRequest
        ? (previews[requestKey(activeRequest)] ?? null)
        : null;

    const applySql = useCallback(
        (sql: string, prompt: string) => {
            const model = codeEditor?.getModel();
            if (!codeEditor || !model) return;
            codeEditor.pushUndoStop();
            codeEditor.executeEdits('sql-ai', [
                { range: model.getFullModelRange(), text: sql },
            ]);
            codeEditor.pushUndoStop();
            codeEditor.setPosition(model.getPositionAt(sql.length));
            codeEditor.focus();
            setProvenance({ prompt, sql });
            setAiError(null);
            setPendingPrompt(null);
        },
        [codeEditor],
    );

    const trackGenerate = useCallback(
        (isEdit: boolean) => {
            if (
                !projectUuid ||
                !project?.organizationUuid ||
                !user?.data?.userUuid
            ) {
                return;
            }
            track({
                name: EventName.SQL_RUNNER_AI_GENERATE_CLICKED,
                properties: {
                    userId: user.data.userUuid,
                    organizationId: project.organizationUuid,
                    projectId: projectUuid,
                    isEdit,
                },
            });
        },
        [track, projectUuid, project?.organizationUuid, user?.data?.userUuid],
    );

    const {
        generate: runGenerate,
        cancel: cancelGenerate,
        isLoading: isGenerating,
    } = useGenerateSqlRunnerQuery({
        projectUuid,
        onSuccess: (result, request) => {
            const started = startedRef.current;
            startedRef.current = null;
            if (!started || isSqlAiResponseStale(started, readSnapshot())) {
                setPendingPrompt(null);
                return;
            }
            applySql(result.sql, request.prompt);
        },
        onError: () => {
            const wasCancelled = startedRef.current === null;
            startedRef.current = null;
            setPendingPrompt(null);
            if (!wasCancelled) setAiError(AI_GENERIC_ERROR);
        },
    });

    const {
        generate: runPreview,
        cancel: cancelPreview,
        isLoading: isPreviewing,
    } = useGenerateSqlRunnerQuery({
        projectUuid,
        onSuccess: (result, request) =>
            setPreviews((prev) => ({
                ...prev,
                [requestKey(request)]: result.sql,
            })),
        onError: () => {},
    });

    // Follow the prompt line under the cursor
    useEffect(() => {
        if (!codeEditor || !enabled) {
            setActivePrompt(null);
            return;
        }
        const sync = () => {
            const next = readActivePrompt(codeEditor);
            setActivePrompt((prev) => (isSamePrompt(prev, next) ? prev : next));
        };
        sync();
        const subscriptions = [
            codeEditor.onDidChangeCursorSelection(sync),
            codeEditor.onDidChangeModelContent(sync),
        ];
        return () => subscriptions.forEach((s) => s.dispose());
    }, [codeEditor, enabled]);

    // Hide provenance as soon as the generated query is edited
    useEffect(() => {
        if (!codeEditor || !provenance) return;
        const subscription = codeEditor.onDidChangeModelContent(() => {
            if (codeEditor.getValue() !== provenance.sql) setProvenance(null);
        });
        return () => subscription.dispose();
    }, [codeEditor, provenance]);

    // A request for the previous warehouse can't apply to the new one
    const cancelGenerateRef = useRef(cancelGenerate);
    cancelGenerateRef.current = cancelGenerate;
    const cancelPreviewRef = useRef(cancelPreview);
    cancelPreviewRef.current = cancelPreview;
    useEffect(
        () => () => {
            startedRef.current = null;
            cancelGenerateRef.current();
            cancelPreviewRef.current();
        },
        [target],
    );

    // Debounced background preview for the active prompt
    const runPreviewRef = useRef(runPreview);
    runPreviewRef.current = runPreview;
    useEffect(() => {
        if (
            !activeRequest ||
            activeRequest.prompt.length < PREVIEW_MIN_LENGTH ||
            previewSql
        )
            return;
        const timer = setTimeout(() => {
            runPreviewRef.current(activeRequest);
        }, PREVIEW_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [activeRequest, previewSql]);

    const handleTab = () => {
        if (isGenerating || !activeRequest) return;
        trackGenerate(activeRequest.currentSql !== null);
        if (previewSql) {
            applySql(previewSql, activeRequest.prompt);
            return;
        }
        const snapshot = readSnapshot();
        if (!snapshot) return;
        startedRef.current = snapshot;
        setPendingPrompt(activeRequest.prompt);
        setAiError(null);
        runGenerate(activeRequest);
    };
    const handleTabRef = useRef(handleTab);
    handleTabRef.current = handleTab;

    // Tab generates only on a prompt line, and never steals Tab from suggestions, selections or snippets
    const promptContextKeyRef = useRef<editor.IContextKey<boolean> | null>(
        null,
    );
    useEffect(() => {
        if (!codeEditor || !monaco || !enabled) return;
        const contextKey = codeEditor.createContextKey<boolean>(
            PROMPT_CONTEXT_KEY,
            false,
        );
        promptContextKeyRef.current = contextKey;
        const action = codeEditor.addAction({
            id: 'lightdash.sqlAi.generate',
            label: 'Generate SQL from comment',
            keybindings: [monaco.KeyCode.Tab],
            precondition: TAB_CONTEXT,
            keybindingContext: TAB_CONTEXT,
            run: () => handleTabRef.current(),
        });
        return () => {
            action.dispose();
            contextKey.reset();
            promptContextKeyRef.current = null;
        };
    }, [codeEditor, monaco, enabled]);

    useEffect(() => {
        promptContextKeyRef.current?.set(!!activePrompt);
    }, [activePrompt]);

    // Keycap after the prompt line, ghost preview below it
    useEffect(() => {
        if (!codeEditor || !monaco || !activePrompt) return;
        const cleanups: (() => void)[] = [];

        const hint = buildAiInlineHint({
            preview: null,
            showTab: !aiError && !isGenerating,
            showRetry: !!aiError && !isGenerating,
            showLoading: isPreviewing,
        });
        if (hint) {
            const widget: editor.IContentWidget = {
                getId: () => HINT_WIDGET_ID,
                getDomNode: () => hint,
                getPosition: () => ({
                    position: {
                        lineNumber: activePrompt.lineNumber,
                        column:
                            codeEditor
                                .getModel()
                                ?.getLineMaxColumn(activePrompt.lineNumber) ??
                            1,
                    },
                    preference: [
                        monaco.editor.ContentWidgetPositionPreference.EXACT,
                    ],
                }),
            };
            codeEditor.addContentWidget(widget);
            cleanups.push(() => codeEditor.removeContentWidget(widget));
        }

        if (previewSql && !isGenerating) {
            const lines = previewSql.split('\n');
            const shown =
                lines.length > PREVIEW_MAX_LINES
                    ? [...lines.slice(0, PREVIEW_MAX_LINES), '…']
                    : lines;
            const block = buildAiPreviewBlock(shown.join('\n'));
            const fontInfo = codeEditor.getOption(
                monaco.editor.EditorOption.fontInfo,
            );
            block.style.fontFamily = fontInfo.fontFamily;
            block.style.fontSize = `${fontInfo.fontSize}px`;
            block.style.lineHeight = `${fontInfo.lineHeight}px`;
            let zoneId = '';
            codeEditor.changeViewZones((accessor) => {
                zoneId = accessor.addZone({
                    afterLineNumber: activePrompt.lineNumber,
                    heightInLines: shown.length,
                    domNode: block,
                });
            });
            cleanups.push(() =>
                codeEditor.changeViewZones((accessor) =>
                    accessor.removeZone(zoneId),
                ),
            );
        }

        return () => cleanups.forEach((cleanup) => cleanup());
    }, [
        codeEditor,
        monaco,
        activePrompt,
        previewSql,
        aiError,
        isGenerating,
        isPreviewing,
    ]);

    return {
        error: aiError,
        generatingPrompt: isGenerating ? pendingPrompt : null,
        provenancePrompt: provenance?.prompt ?? null,
    };
};
