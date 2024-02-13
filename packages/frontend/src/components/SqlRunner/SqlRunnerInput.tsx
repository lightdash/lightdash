import { ProjectCatalog } from '@lightdash/common';
import 'ace-builds/src-noconflict/mode-sql';
import 'ace-builds/src-noconflict/theme-github';
import React, { FC } from 'react';
import AceEditor from 'react-ace';
import { useToggle } from 'react-use';
import { useProjectCatalogAceEditorCompleter } from '../../hooks/useProjectCatalogAceEditorCompleter';
import { SqlEditorActions } from './SqlEditorActions';

const SqlRunnerInput: FC<{
    sql: string;
    isDisabled: boolean;
    onChange: (value: string) => void;
    projectCatalog: ProjectCatalog | undefined;
}> = ({ sql, onChange, isDisabled, projectCatalog }) => {
    const { setAceEditor } =
        useProjectCatalogAceEditorCompleter(projectCatalog);

    const [isSoftWrapEnabled, toggleSoftWrap] = useToggle(false);

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
                wrapEnabled={isSoftWrapEnabled}
            />
            <SqlEditorActions
                isSoftWrapEnabled={isSoftWrapEnabled}
                onToggleSoftWrap={toggleSoftWrap}
                clipboardContent={sql}
            />
        </div>
    );
};

export default SqlRunnerInput;
