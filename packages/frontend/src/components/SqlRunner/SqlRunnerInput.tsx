import { ProjectCatalog } from '@lightdash/common';
import { ActionIcon, CopyButton, Tooltip } from '@mantine/core';
import { IconCheck, IconClipboard } from '@tabler/icons-react';
import 'ace-builds/src-noconflict/mode-sql';
import 'ace-builds/src-noconflict/theme-github';
import React, { FC } from 'react';
import AceEditor from 'react-ace';
import { useProjectCatalogAceEditorCompleter } from '../../hooks/useProjectCatalogAceEditorCompleter';

const SqlRunnerInput: FC<{
    sql: string;
    isDisabled: boolean;
    onChange: (value: string) => void;
    projectCatalog: ProjectCatalog | undefined;
}> = ({ sql, onChange, isDisabled, projectCatalog }) => {
    const { setAceEditor } =
        useProjectCatalogAceEditorCompleter(projectCatalog);

    return (
        <div
            style={{
                padding: 10,
                position: 'relative',
            }}
        >
            <AceEditor
                mode="sql"
                theme="github"
                readOnly={isDisabled}
                value={sql}
                height="300px"
                width="100%"
                editorProps={{ $blockScrolling: true }}
                enableBasicAutocompletion
                enableLiveAutocompletion
                onChange={(value: string) => {
                    onChange(value);
                }}
                onLoad={setAceEditor}
            />
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
