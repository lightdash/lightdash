import {
    Alert,
    Anchor,
    ScrollArea,
    Text,
    useMantineTheme,
} from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import styled from 'styled-components';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTableCalculationAutocompletions } from '../../../hooks/codemirror/useExplorerAutocompletions';
import { type TableCalculationForm } from '../types';

import { useLocalStorage } from '@mantine/hooks';
import { SqlEditor as CodeMirrorSqlEditor } from '../../../components/CodeMirror';
import { SqlEditorActions } from '../../../components/SqlRunner/SqlEditorActions';
import { useExplore } from '../../../hooks/useExplore';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';

const SQL_PLACEHOLDER = '${table_name.field_name} + ${table_name.metric_name}';
const SOFT_WRAP_LOCAL_STORAGE_KEY = 'lightdash-sql-form-soft-wrap';

type Props = {
    form: TableCalculationForm;
    isFullScreen: boolean;
    focusOnRender?: boolean;
    onCmdEnter?: () => void;
};

const EditorWrapper = styled.div<{ isFullScreen: boolean }>`
    width: 100%;
    min-height: ${({ isFullScreen }) => (isFullScreen ? '100px' : '250px')};

    .cm-editor {
        height: 100%;
    }
`;

export const SqlForm: FC<Props> = ({
    form,
    isFullScreen,
    focusOnRender: _focusOnRender = false,
    onCmdEnter,
}) => {
    const theme = useMantineTheme();
    const [isSoftWrapEnabled, setSoftWrapEnabled] = useLocalStorage({
        key: SOFT_WRAP_LOCAL_STORAGE_KEY,
        defaultValue: true,
    });

    const activeFields = useExplorerContext(
        (context) => context.state.activeFields,
    );
    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const additionalMetrics = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.additionalMetrics,
    );
    const customDimensions = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.customDimensions,
    );
    const tableCalculations = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.tableCalculations,
    );
    const explore = useExplore(tableName);

    const autocompletions = useTableCalculationAutocompletions({
        explore: explore.data,
        activeFields,
        additionalMetrics,
        customDimensions,
        tableCalculations,
    });

    return (
        <>
            <ScrollArea h={isFullScreen ? '90%' : '150px'}>
                <EditorWrapper isFullScreen={isFullScreen}>
                    <CodeMirrorSqlEditor
                        value={form.values.sql}
                        onChange={(value) => form.setFieldValue('sql', value)}
                        placeholder={SQL_PLACEHOLDER}
                        minHeight={isFullScreen ? '600px' : '150px'}
                        autocompletions={
                            autocompletions ? [autocompletions] : undefined
                        }
                        wrapEnabled={isSoftWrapEnabled}
                        onSubmit={onCmdEnter}
                    />
                </EditorWrapper>
                <SqlEditorActions
                    isSoftWrapEnabled={isSoftWrapEnabled}
                    onToggleSoftWrap={() =>
                        setSoftWrapEnabled(!isSoftWrapEnabled)
                    }
                    clipboardContent={form.values.sql}
                />
            </ScrollArea>

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
        </>
    );
};
