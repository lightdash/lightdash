import type {
    ApiError,
    GeneratedFormulaTableCalculation,
} from '@lightdash/common';
import { Button } from '@mantine-8/core';
import {
    Alert,
    Anchor,
    Box,
    Flex,
    ScrollArea,
    Text,
    useMantineTheme,
} from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconAlertCircle, IconSparkles, IconWand } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import AceEditor, { type IAceEditorProps } from 'react-ace';
import styled, { css } from 'styled-components';
import MantineIcon from '../../../components/common/MantineIcon';
import { SqlEditorActions } from '../../../components/SqlRunner/SqlEditorActions';
import {
    AiSlot,
    AiTableCalculationInputBody,
} from '../../../ee/features/ambientAi/components/tableCalculation';
import { useAmbientAiEnabled } from '../../../ee/features/ambientAi/hooks/useAmbientAiEnabled';
import { useTableCalculationAceEditorCompleter } from '../../../hooks/useExplorerAceEditorCompleter';
import { type TableCalculationForm } from '../types';
import FormulaConversionPreviewBody from './FormulaConversionPreview';
import classes from './SqlForm.module.css';
import 'ace-builds/src-noconflict/mode-sql';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-tomorrow_night';

const SQL_PLACEHOLDER = '${table_name.field_name} + ${table_name.metric_name}';
const SOFT_WRAP_LOCAL_STORAGE_KEY = 'lightdash-sql-form-soft-wrap';

export type SqlFormConversionState = {
    isLoading: boolean;
    error: ApiError | null;
    result: GeneratedFormulaTableCalculation | null;
    onApply: () => void;
    onDiscard: () => void;
    onRetry: () => void;
};

type Props = {
    form: TableCalculationForm;
    isFullScreen: boolean;
    focusOnRender?: boolean;
    onCmdEnter?: () => void;
    onAiApplied?: () => void;
    // Structured state for the SQL→formula conversion flow. When set,
    // the AI slot renders the conversion preview body instead of the
    // free-prompt AI input — the slot itself is the same <AiSlot> React
    // element either way, so React reconciles props rather than
    // unmount/remount the subtree.
    conversionState?: SqlFormConversionState;
};

export const SqlEditor = styled(AceEditor)<
    IAceEditorProps & { isFullScreen: boolean; gutterBackgroundColor: string }
>`
    width: 100%;
    & > .ace_gutter {
        background-color: ${({ gutterBackgroundColor }) =>
            gutterBackgroundColor};
    }
    ${({ isFullScreen }) =>
        isFullScreen
            ? css`
                  min-height: 100px;
              `
            : css`
                  min-height: 250px;
              `}
`;

export const SqlForm: FC<Props> = ({
    form,
    isFullScreen,
    focusOnRender = false,
    onCmdEnter,
    onAiApplied,
    conversionState,
}) => {
    const theme = useMantineTheme();
    const [isSoftWrapEnabled, setSoftWrapEnabled] = useLocalStorage({
        key: SOFT_WRAP_LOCAL_STORAGE_KEY,
        defaultValue: true,
    });

    const { setAceEditor } = useTableCalculationAceEditorCompleter();
    const isAmbientAiEnabled = useAmbientAiEnabled();

    const handleEditorLoad = useCallback(
        (editor: any) => {
            setAceEditor(editor);
            editor.commands.addCommand({
                name: 'executeCmdEnter',
                bindKey: { win: 'Ctrl-Enter', mac: 'Cmd-Enter' },
                exec: () => {
                    if (onCmdEnter) {
                        onCmdEnter();
                    }
                },
            });
            if (focusOnRender) {
                setTimeout(() => {
                    editor.focus();
                    editor.navigateFileEnd();
                }, 0);
            }
        },
        [setAceEditor, onCmdEnter, focusOnRender],
    );

    const handleToggleSoftWrap = useCallback(() => {
        setSoftWrapEnabled(!isSoftWrapEnabled);
    }, [isSoftWrapEnabled, setSoftWrapEnabled]);

    // Compute AiSlot props up-front. Both modes render the SAME <AiSlot>
    // at the SAME JSX position — React updates props in place.
    const slotIcon = conversionState
        ? conversionState.error
            ? IconAlertCircle
            : IconWand
        : IconSparkles;
    const slotIconColor = conversionState
        ? conversionState.error
            ? 'red'
            : 'indigo'
        : 'indigo.4';
    const slotTitle = conversionState
        ? conversionState.error
            ? "Couldn't convert to formula"
            : conversionState.isLoading
              ? 'Generating suggestion…'
              : 'Suggested formula'
        : 'Generate and improve your table calculation with AI';

    const slotRightSlot = conversionState ? (
        conversionState.error ? (
            <>
                <Button
                    variant="subtle"
                    color="gray"
                    size="compact-xs"
                    onClick={conversionState.onDiscard}
                >
                    Dismiss
                </Button>
                <Button size="compact-xs" onClick={conversionState.onRetry}>
                    Try again
                </Button>
            </>
        ) : (
            <>
                <Button
                    variant="subtle"
                    color="gray"
                    size="compact-xs"
                    onClick={conversionState.onDiscard}
                    disabled={conversionState.isLoading}
                >
                    Discard
                </Button>
                <Button
                    size="compact-xs"
                    onClick={conversionState.onApply}
                    disabled={
                        conversionState.isLoading || !conversionState.result
                    }
                >
                    Apply
                </Button>
            </>
        )
    ) : undefined;

    return (
        <Flex direction="column" h="100%">
            <ScrollArea
                style={{ flex: 1 }}
                className={conversionState ? classes.editorBlurred : undefined}
            >
                <SqlEditor
                    mode="sql"
                    theme={
                        theme.colorScheme === 'dark'
                            ? 'tomorrow_night'
                            : 'github'
                    }
                    width="100%"
                    placeholder={SQL_PLACEHOLDER}
                    maxLines={Infinity}
                    minLines={isFullScreen ? 40 : 8}
                    setOptions={{
                        autoScrollEditorIntoView: true,
                    }}
                    style={{ zIndex: 0 }}
                    onLoad={handleEditorLoad}
                    enableLiveAutocompletion
                    enableBasicAutocompletion
                    showPrintMargin={false}
                    isFullScreen={isFullScreen}
                    wrapEnabled={isSoftWrapEnabled}
                    gutterBackgroundColor={theme.colors.ldGray[1]}
                    {...form.getInputProps('sql')}
                />
                <SqlEditorActions
                    isSoftWrapEnabled={isSoftWrapEnabled}
                    onToggleSoftWrap={handleToggleSoftWrap}
                    clipboardContent={form.values.sql}
                />
            </ScrollArea>

            <Box style={{ flexShrink: 0 }}>
                {!isAmbientAiEnabled ? (
                    <Alert
                        radius={0}
                        icon={<MantineIcon icon={IconSparkles} />}
                        title={
                            <Text fz="xs">
                                Need inspiration?{' '}
                                <Anchor
                                    target="_blank"
                                    href="https://docs.lightdash.com/guides/table-calculations/sql-templates"
                                    rel="noreferrer"
                                >
                                    Check out our templates!
                                </Anchor>
                            </Text>
                        }
                        color="violet"
                        styles={{
                            root: {
                                paddingBottom: theme.spacing.sm,
                                paddingTop: theme.spacing.sm,
                            },
                            wrapper: {
                                alignItems: 'center',
                            },
                            title: {
                                marginBottom: 0,
                            },
                        }}
                    >
                        <></>
                    </Alert>
                ) : (
                    <AiSlot
                        icon={slotIcon}
                        iconColor={slotIconColor}
                        title={slotTitle}
                        rightSlot={slotRightSlot}
                    >
                        {conversionState ? (
                            <FormulaConversionPreviewBody
                                isLoading={conversionState.isLoading}
                                error={conversionState.error}
                                result={conversionState.result}
                            />
                        ) : (
                            <AiTableCalculationInputBody
                                currentSql={form.values.sql || undefined}
                                onApply={(result) => {
                                    form.setFieldValue('sql', result.sql);
                                    form.setFieldValue(
                                        'name',
                                        result.displayName,
                                    );
                                    if (result.type) {
                                        form.setFieldValue('type', result.type);
                                    }
                                    if (result.format) {
                                        form.setFieldValue(
                                            'format',
                                            result.format,
                                        );
                                    }
                                    onAiApplied?.();
                                }}
                            />
                        )}
                    </AiSlot>
                )}
            </Box>
        </Flex>
    );
};
