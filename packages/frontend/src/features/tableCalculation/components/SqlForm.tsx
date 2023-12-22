import {
    Alert,
    Anchor,
    ScrollArea,
    Text,
    useMantineTheme,
} from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { FC } from 'react';
import AceEditor, { IAceEditorProps } from 'react-ace';
import styled, { css } from 'styled-components';
import MantineIcon from '../../../components/common/MantineIcon';
import { useExplorerAceEditorCompleter } from '../../../hooks/useExplorerAceEditorCompleter';
import { TableCalculationForm } from '../types';

import 'ace-builds/src-noconflict/mode-sql';
import 'ace-builds/src-noconflict/theme-github';

const SQL_PLACEHOLDER = '${table_name.field_name} + ${table_name.metric_name}';

type Props = {
    form: TableCalculationForm;
    isFullScreen: boolean;
};

const SqlEditor = styled(AceEditor)<
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
    const { setAceEditor } = useExplorerAceEditorCompleter();
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
                    gutterBackgroundColor={theme.colors.gray['1']}
                    {...form.getInputProps('sql')}
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
