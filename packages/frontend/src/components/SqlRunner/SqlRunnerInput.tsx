import { ProjectCatalog } from '@lightdash/common';
import { ActionIcon, CopyButton, Loader, Tooltip } from '@mantine/core';
import Editor, { EditorProps } from '@monaco-editor/react';
import { IconCheck, IconClipboard } from '@tabler/icons-react';
import 'ace-builds/src-noconflict/mode-sql';
import 'ace-builds/src-noconflict/theme-github';
import React, { FC } from 'react';

const MONACO_DEFAULT_OPTIONS: EditorProps['options'] = {
    cursorBlinking: 'smooth',
    folding: true,
    lineNumbersMinChars: 1,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    quickSuggestions: true,
    contextmenu: false,
};

const SqlRunnerInput: FC<{
    sql: string;
    isDisabled: boolean;
    onChange: (value: string) => void;
    projectCatalog: ProjectCatalog | undefined;
}> = ({ sql, onChange }) => {
    return (
        <div
            style={{
                padding: 0,
                position: 'relative',
            }}
        >
            <Editor
                width={'100%'}
                height={'300px'}
                loading={<Loader color="gray" size="xs" />}
                defaultLanguage="sql"
                options={{
                    ...MONACO_DEFAULT_OPTIONS,
                }}
                value={sql}
                onChange={(value) => {
                    onChange(value || '');
                }}
                defaultValue={'-- Write some sql'}
            />
            {/*<AceEditor*/}
            {/*    mode="sql"*/}
            {/*    theme="github"*/}
            {/*    readOnly={isDisabled}*/}
            {/*    value={sql}*/}
            {/*    height="300px"*/}
            {/*    width="100%"*/}
            {/*    editorProps={{ $blockScrolling: true }}*/}
            {/*    enableBasicAutocompletion*/}
            {/*    enableLiveAutocompletion*/}
            {/*    onChange={(value: string) => {*/}
            {/*        onChange(value);*/}
            {/*    }}*/}
            {/*    onLoad={setAceEditor}*/}
            {/*/>*/}
            <div
                style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                }}
            >
                <CopyButton value={sql} timeout={2000}>
                    {({ copied, copy }) => (
                        <Tooltip
                            label={copied ? 'Copied to clipboard!' : 'Copy'}
                            withArrow
                            position="right"
                            color={copied ? 'green' : 'dark'}
                        >
                            <ActionIcon
                                color={copied ? 'teal' : 'gray'}
                                onClick={copy}
                            >
                                {copied ? (
                                    <IconCheck size="1rem" />
                                ) : (
                                    <IconClipboard size="1rem" />
                                )}
                            </ActionIcon>
                        </Tooltip>
                    )}
                </CopyButton>
            </div>
        </div>
    );
};

export default SqlRunnerInput;
