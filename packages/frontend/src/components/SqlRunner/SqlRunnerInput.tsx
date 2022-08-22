import { Button, PopoverPosition } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { ProjectCatalog } from '@lightdash/common';
import 'ace-builds/src-noconflict/mode-sql';
import 'ace-builds/src-noconflict/theme-github';
import { FC, useState } from 'react';
import AceEditor from 'react-ace';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { useProjectCatalogAceEditorCompleter } from '../../hooks/useProjectCatalogAceEditorCompleter';

const SqlRunnerInput: FC<{
    sql: string;
    isDisabled: boolean;
    onChange: (value: string) => void;
    projectCatalog: ProjectCatalog | undefined;
}> = ({ sql, onChange, isDisabled, projectCatalog }) => {
    const [copied, setCopied] = useState<boolean>(false);
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
                    setCopied(false);
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
                <Tooltip2
                    isOpen={copied}
                    content="Copied to clipboard!"
                    intent="success"
                    position={PopoverPosition.RIGHT}
                >
                    <CopyToClipboard text={sql} onCopy={() => setCopied(true)}>
                        <Button minimal icon="clipboard" />
                    </CopyToClipboard>
                </Tooltip2>
            </div>
        </div>
    );
};

export default SqlRunnerInput;
