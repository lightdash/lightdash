import type { GeneratedTableCalculation } from '@lightdash/common';
import {
    Alert,
    Anchor,
    ScrollArea,
    Text,
    useMantineTheme,
} from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconSparkles } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import AceEditor, { type IAceEditorProps } from 'react-ace';
import styled, { css } from 'styled-components';
import MantineIcon from '../../../components/common/MantineIcon';
import { SqlEditorActions } from '../../../components/SqlRunner/SqlEditorActions';
import { AiTableCalculationInput } from '../../../ee/features/ambientAi/components/tableCalculation';
import { useAmbientAiEnabled } from '../../../ee/features/ambientAi/hooks/useAmbientAiEnabled';
import { useTableCalculationAceEditorCompleter } from '../../../hooks/useExplorerAceEditorCompleter';
import { type TableCalculationForm } from '../types';

import 'ace-builds/src-noconflict/mode-sql';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-tomorrow_night';

const SQL_PLACEHOLDER = '${table_name.field_name} + ${table_name.metric_name}';
const SOFT_WRAP_LOCAL_STORAGE_KEY = 'lightdash-sql-form-soft-wrap';

type Props = {
    form: TableCalculationForm;
    isFullScreen: boolean;
    focusOnRender?: boolean;
    onCmdEnter?: () => void;
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
}) => {
    const theme = useMantineTheme();
    const [isSoftWrapEnabled, setSoftWrapEnabled] = useLocalStorage({
        key: SOFT_WRAP_LOCAL_STORAGE_KEY,
        defaultValue: true,
    });

    const { setAceEditor } = useTableCalculationAceEditorCompleter();
    const isAmbientAiEnabled = useAmbientAiEnabled();

    const handleAiApply = useCallback(
        (result: GeneratedTableCalculation) => {
            form.setFieldValue('sql', result.sql);
            form.setFieldValue('name', result.displayName);
            if (result.type) {
                form.setFieldValue('type', result.type);
            }
            if (result.format) {
                form.setFieldValue('format', result.format);
            }
        },
        [form],
    );

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
                // set timeout throws the focus to the end of the event loop (after the render)
                // without it the focus would be set before the editor is fully rendered (and not work)
                setTimeout(() => {
                    editor.focus(); // focus the editor
                    editor.navigateFileEnd(); // navigate to the end of the content
                }, 0);
            }
        },
        [setAceEditor, onCmdEnter, focusOnRender],
    );

    const handleToggleSoftWrap = useCallback(() => {
        setSoftWrapEnabled(!isSoftWrapEnabled);
    }, [isSoftWrapEnabled, setSoftWrapEnabled]);

    return (
        <>
            <ScrollArea h={isFullScreen ? '90%' : '150px'}>
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

            {isAmbientAiEnabled ? (
                <AiTableCalculationInput
                    currentSql={form.values.sql || undefined}
                    onApply={handleAiApply}
                />
            ) : (
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
            )}
        </>
    );
};
