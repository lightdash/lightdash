import {
    ActionIcon,
    Alert,
    Anchor,
    Box,
    ScrollArea,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import {
    IconSparkles,
    IconTextWrap,
    IconTextWrapDisabled,
} from '@tabler/icons-react';
import { FC } from 'react';
import AceEditor, { IAceEditorProps } from 'react-ace';
import styled, { css } from 'styled-components';
import MantineIcon from '../../../components/common/MantineIcon';
import { useExplorerAceEditorCompleter } from '../../../hooks/useExplorerAceEditorCompleter';
import { TableCalculationForm } from '../types';

import 'ace-builds/src-noconflict/mode-sql';
import 'ace-builds/src-noconflict/theme-github';
import { useToggle } from 'react-use';

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

const SqlEditorActions: FC<{
    isSoftWrapEnabled: boolean;
    onToggleSoftWrap: () => void;
}> = ({ isSoftWrapEnabled, onToggleSoftWrap }) => (
    <Box
        pos="absolute"
        bottom={0}
        right={0}
        // Avoids potential collision with ScrollArea scrollbar:
        mr={5}
    >
        <Tooltip
            label={
                isSoftWrapEnabled
                    ? 'Disable editor soft-wrapping'
                    : 'Enable editor soft-wrapping'
            }
            withArrow
            position="left"
        >
            <ActionIcon onClick={onToggleSoftWrap}>
                {isSoftWrapEnabled ? (
                    <MantineIcon icon={IconTextWrapDisabled} />
                ) : (
                    <MantineIcon icon={IconTextWrap} />
                )}
            </ActionIcon>
        </Tooltip>
    </Box>
);

export const SqlForm: FC<Props> = ({ form, isFullScreen }) => {
    const theme = useMantineTheme();
    const [isSoftWrapEnabled, toggleSoftWrap] = useToggle(false);
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
                    wrapEnabled={isSoftWrapEnabled}
                    gutterBackgroundColor={theme.colors.gray['1']}
                    {...form.getInputProps('sql')}
                />
                <SqlEditorActions
                    isSoftWrapEnabled={isSoftWrapEnabled}
                    onToggleSoftWrap={toggleSoftWrap}
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
