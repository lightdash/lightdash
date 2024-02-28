import { ProjectCatalog } from '@lightdash/common';
import { useLocalStorage } from '@mantine/hooks';
import 'ace-builds/src-noconflict/ace';
import 'ace-builds/src-noconflict/mode-sql';
import 'ace-builds/src-noconflict/theme-github';
import { FC } from 'react';
import AceEditor from 'react-ace';
import { useProjectCatalogAceEditorCompleter } from '../../hooks/useProjectCatalogAceEditorCompleter';
import { SqlEditorActions } from './SqlEditorActions';

const SOFT_WRAP_LOCAL_STORAGE_KEY = 'lightdash-sql-runner-soft-wrap';

const SqlRunnerInput: FC<{
    sql: string;
    isDisabled: boolean;
    onChange: (value: string) => void;
    projectCatalog: ProjectCatalog | undefined;
}> = ({ sql, onChange, isDisabled, projectCatalog }) => {
    const { setAceEditor } =
        useProjectCatalogAceEditorCompleter(projectCatalog);

    const [isSoftWrapEnabled, setSoftWrapEnabled] = useLocalStorage({
        key: SOFT_WRAP_LOCAL_STORAGE_KEY,
        defaultValue: true,
    });

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
                onToggleSoftWrap={() => setSoftWrapEnabled(!isSoftWrapEnabled)}
                clipboardContent={sql}
            />
        </div>
    );
};

export default SqlRunnerInput;
