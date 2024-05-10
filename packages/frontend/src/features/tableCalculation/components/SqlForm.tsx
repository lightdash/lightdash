import {
    Alert,
    Anchor,
    ScrollArea,
    Text,
    useMantineTheme,
} from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import AceEditor, { type IAceEditorProps } from 'react-ace';
import styled, { css } from 'styled-components';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTableCalculationAceEditorCompleter } from '../../../hooks/useExplorerAceEditorCompleter';
import { type TableCalculationForm } from '../types';

import { useLocalStorage } from '@mantine/hooks';
import 'ace-builds/src-noconflict/mode-sql';
import 'ace-builds/src-noconflict/theme-github';
import { SqlEditorActions } from '../../../components/SqlRunner/SqlEditorActions';

const SQL_PLACEHOLDER = '${table_name.field_name} + ${table_name.metric_name}';
const SOFT_WRAP_LOCAL_STORAGE_KEY = 'lightdash-sql-form-soft-wrap';

type Props = {
    form: TableCalculationForm;
    isFullScreen: boolean;
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

export const SqlForm: FC<Props> = ({ form, isFullScreen }) => {
    const theme = useMantineTheme();
    const [isSoftWrapEnabled, setSoftWrapEnabled] = useLocalStorage({
        key: SOFT_WRAP_LOCAL_STORAGE_KEY,
        defaultValue: true,
    });

    const { setAceEditor } = useTableCalculationAceEditorCompleter();

    return (
        <>
            <ScrollArea h={isFullScreen ? '95%' : '150px'}>
                <SqlEditor
                    mode="sql"
                    theme="github"
                    width="100%"
                    placeholder={SQL_PLACEHOLDER}
                    maxLines={Infinity}
                    minLines={isFullScreen ? 40 : 8}
                    setOptions={{
                        autoScrollEditorIntoView: true,
                    }}
                    onLoad={setAceEditor}
                    enableLiveAutocompletion
                    enableBasicAutocompletion
                    showPrintMargin={false}
                    isFullScreen={isFullScreen}
                    wrapEnabled={isSoftWrapEnabled}
                    gutterBackgroundColor={theme.colors.gray['1']}
                    {...form.getInputProps('sql')}
                />
                <SqlEditorActions
                    isSoftWrapEnabled={isSoftWrapEnabled}
                    onToggleSoftWrap={() =>
                        setSoftWrapEnabled(!isSoftWrapEnabled)
                    }
                    clipboardContent={form.values.sql}
                />
            </ScrollArea>

            <Alert
                p="xs"
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
