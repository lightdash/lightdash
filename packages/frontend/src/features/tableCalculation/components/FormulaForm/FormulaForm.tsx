import {
    type Explore,
    type GeneratedFormulaTableCalculation,
    type MetricQuery,
} from '@lightdash/common';
import { Anchor, Box, Flex, Group, Text } from '@mantine-8/core';
import { IconInfoCircle, IconSparkles } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useAmbientAiEnabled } from '../../../../ee/features/ambientAi/hooks/useAmbientAiEnabled';
import { useGenerateFormulaTableCalculation } from '../../../../hooks/useGenerateFormulaTableCalculation';
import { useProject } from '../../../../hooks/useProject';
import useApp from '../../../../providers/App/useApp';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import { useFormulaValidation } from '../../hooks/useFormulaValidation';
import { FormulaEditor } from './FormulaEditor';
import classes from './FormulaForm.module.css';
import { ImproveWithAiSlot } from './ImproveWithAiSlot';
import { getInputMode } from './inputMode';

type Props = {
    explore: Explore | undefined;
    metricQuery: MetricQuery;
    formula: string;
    initialFormula?: string;
    onChange: (formula: string) => void;
    onValidationChange: (error: string | null) => void;
    onAiApply?: (result: GeneratedFormulaTableCalculation) => void;
    isFullScreen?: boolean;
};

const AI_GENERIC_ERROR =
    "Couldn't generate a formula — try rephrasing or write it yourself.";

const PREVIEW_DEBOUNCE_MS = 800;
const PREVIEW_MIN_LENGTH = 5;

export const FormulaForm: FC<Props> = ({
    explore,
    metricQuery,
    formula,
    initialFormula,
    onChange,
    onValidationChange,
    onAiApply,
    isFullScreen,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: project } = useProject(projectUuid);
    const { user } = useApp();
    const { track } = useTracking();

    const { error, validate } = useFormulaValidation(formula, metricQuery);
    const isAmbientAiEnabled = useAmbientAiEnabled();
    const aiEnabled = isAmbientAiEnabled && !!onAiApply;

    const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
    const [provenancePrompt, setProvenancePrompt] = useState<string | null>(
        null,
    );
    const [generatedFormula, setGeneratedFormula] = useState<string | null>(
        null,
    );
    const [aiError, setAiError] = useState<string | null>(null);
    const [previewSuffix, setPreviewSuffix] = useState<string | null>(null);
    const previewCache = useRef<Map<string, GeneratedFormulaTableCalculation>>(
        new Map(),
    );
    const pendingPreviewPrompt = useRef<string | null>(null);
    const currentFormulaRef = useRef(formula);
    currentFormulaRef.current = formula;

    useEffect(() => {
        onValidationChange(error);
    }, [error, onValidationChange]);

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
                name: EventName.FORMULA_TABLE_CALCULATION_AI_GENERATE_CLICKED,
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
        isLoading: isGenerating,
        error: generationError,
    } = useGenerateFormulaTableCalculation({
        projectUuid,
        explore,
        metricQuery,
        onSuccess: (result) => {
            onAiApply?.(result);
            if (pendingPrompt) setProvenancePrompt(pendingPrompt);
            setGeneratedFormula(result.formula);
            setAiError(null);
            setPendingPrompt(null);
        },
    });

    const { generate: runPreview } = useGenerateFormulaTableCalculation({
        projectUuid,
        explore,
        metricQuery,
        onSuccess: (result) => {
            const expected = pendingPreviewPrompt.current;
            if (!expected) return;
            previewCache.current.set(expected, result);
            const currentTrimmed = currentFormulaRef.current.trim();
            if (currentTrimmed === expected) {
                setPreviewSuffix(result.formula);
            }
            pendingPreviewPrompt.current = null;
        },
    });

    // Drop caption once the user edits after generation.
    useEffect(() => {
        if (
            generatedFormula !== null &&
            formula !== generatedFormula &&
            provenancePrompt !== null
        ) {
            setProvenancePrompt(null);
            setGeneratedFormula(null);
        }
    }, [formula, generatedFormula, provenancePrompt]);

    useEffect(() => {
        if (generationError) {
            setAiError(AI_GENERIC_ERROR);
            setPendingPrompt(null);
        }
    }, [generationError]);

    useEffect(() => {
        if (!aiEnabled) {
            setPreviewSuffix(null);
            return;
        }
        const mode = getInputMode(formula);
        if (mode !== 'prompt') {
            setPreviewSuffix(null);
            pendingPreviewPrompt.current = null;
            return;
        }
        const trimmed = formula.trim();
        if (trimmed.length < PREVIEW_MIN_LENGTH) {
            setPreviewSuffix(null);
            return;
        }

        const cached = previewCache.current.get(trimmed);
        if (cached) {
            setPreviewSuffix(cached.formula);
            return;
        }

        setPreviewSuffix(null);

        const timer = setTimeout(() => {
            pendingPreviewPrompt.current = trimmed;
            runPreview(trimmed);
        }, PREVIEW_DEBOUNCE_MS);

        return () => {
            clearTimeout(timer);
        };
        // `runPreview` is intentionally excluded: the hook recreates the callback
        // whenever its mutation state flips (e.g. isLoading toggle), which would
        // otherwise cancel and reschedule the timer mid-request. Excluding it is
        // safe — the underlying hook aborts in-flight requests on re-fire.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formula, aiEnabled]);

    const generateFromPrompt = useCallback(
        (prompt: string, isEdit: boolean) => {
            if (!prompt.trim()) return;
            setPendingPrompt(prompt);
            setAiError(null);
            trackGenerate(isEdit);
            runGenerate(prompt, isEdit ? formula : undefined);
        },
        [runGenerate, trackGenerate, formula],
    );

    const handleTab = useCallback(
        (promptText: string) => {
            const trimmed = promptText.trim();
            const cached = previewCache.current.get(trimmed);
            if (cached) {
                onAiApply?.(cached);
                setProvenancePrompt(trimmed);
                setGeneratedFormula(cached.formula);
                setPreviewSuffix(null);
                setAiError(null);
                trackGenerate(false);
                return;
            }
            generateFromPrompt(promptText, false);
        },
        [generateFromPrompt, onAiApply, trackGenerate],
    );

    return (
        <Flex direction="column" h="100%">
            <Box
                className={`${classes.container} ${
                    error || aiError ? classes.containerError : ''
                }`}
            >
                <Box className={classes.editorArea}>
                    <FormulaEditor
                        explore={explore}
                        metricQuery={metricQuery}
                        initialContent={initialFormula}
                        onTextChange={onChange}
                        onBlur={validate}
                        isFullScreen={isFullScreen}
                        aiEnabled={aiEnabled}
                        onTabInPromptMode={handleTab}
                        isGenerating={isGenerating}
                        hasAiError={!!aiError}
                        previewSuffix={previewSuffix}
                    />
                </Box>
                {aiEnabled && getInputMode(formula) === 'formula' && (
                    <ImproveWithAiSlot
                        explore={explore}
                        metricQuery={metricQuery}
                        currentFormula={formula}
                        isGenerating={isGenerating}
                        onSubmit={(prompt) => generateFromPrompt(prompt, true)}
                    />
                )}
                {!aiEnabled && (
                    <Group gap={6} wrap="nowrap" className={classes.helpHint}>
                        <MantineIcon
                            icon={IconInfoCircle}
                            color="var(--mantine-color-dimmed)"
                            size="sm"
                        />
                        <Text fz="xs" c="dimmed">
                            New to formulas?{' '}
                            <Anchor
                                target="_blank"
                                href="https://docs.lightdash.com/guides/formula-table-calculations"
                                rel="noreferrer"
                                fz="xs"
                                c="dimmed"
                                underline="always"
                            >
                                Check out the formula guide
                            </Anchor>
                        </Text>
                    </Group>
                )}
            </Box>
            {error && <Text className={classes.errorText}>{error}</Text>}
            {aiError && !error && (
                <Text className={classes.errorText}>{aiError}</Text>
            )}
            {provenancePrompt && !aiError && (
                <Group gap={6} wrap="nowrap" className={classes.provenance}>
                    <MantineIcon icon={IconSparkles} size="xs" />
                    <Text span inherit>
                        Generated from &ldquo;{provenancePrompt}&rdquo;
                    </Text>
                </Group>
            )}
        </Flex>
    );
};
