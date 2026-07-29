import { ActionIcon, Tooltip } from '@mantine-8/core';
import { IconArrowUp, IconPaperclip } from '@tabler/icons-react';
import { useRef, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { ComposerSubmitButton } from '../../../components/common/PromptComposer/ComposerSubmitButton';
import PromptComposer, {
    type PromptComposerHandle,
} from '../../../components/common/PromptComposer/PromptComposer';
import { SelectedAttachmentSection } from '../AppResourcePicker';
import { type VizBuildRequest } from '../hooks/useDataAppVizBuild';
import { useVizComposerAttachments } from '../hooks/useVizComposerAttachments';

type Props = {
    projectUuid: string | undefined;
    appUuid: string;
    placeholder: string;
    /** True while a build is running: keep typing, block sending. */
    isBuilding: boolean;
    onSubmit: (request: VizBuildRequest) => void;
};

/**
 * Describe-a-visualization input for the chart config panel.
 *
 * Only the author's words and any files they attach are sent. The visualization
 * is handed its rows and a mapping from its own field names to the query's
 * columns at render, so it is built to fit whatever query it is dropped into —
 * not just this one.
 */
const DataAppVizComposerContent: FC<Props> = ({
    projectUuid,
    appUuid,
    placeholder,
    isBuilding,
    onSubmit,
}) => {
    const attachments = useVizComposerAttachments({ projectUuid, appUuid });
    const composerRef = useRef<PromptComposerHandle>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isEmpty, setIsEmpty] = useState(true);

    const canSend = !isBuilding && !attachments.isUploading;

    const handleSubmit = () => {
        const description = composerRef.current?.getText().trim() ?? '';
        if (!description || !canSend) return;
        composerRef.current?.clear();
        onSubmit({ description, fileIds: attachments.fileIds });
        attachments.clear();
    };

    return (
        <PromptComposer
            ref={composerRef}
            size="md"
            placeholder={placeholder}
            submitDisabled={!canSend}
            onEmptyChange={setIsEmpty}
            onSubmit={handleSubmit}
            attachments={
                <SelectedAttachmentSection
                    attachments={attachments.attachments.map((a) => ({
                        id: a.key,
                        previewUrl: a.previewUrl,
                        filename: a.filename,
                    }))}
                    onRemove={attachments.remove}
                    disabled={isBuilding}
                />
            }
            toolbarLeft={
                <>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        hidden
                        onChange={(e) => {
                            attachments.add(Array.from(e.target.files ?? []));
                            e.target.value = '';
                        }}
                    />
                    <Tooltip withArrow label="Attach an image or file">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            disabled={isBuilding}
                            aria-label="Attach"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <MantineIcon icon={IconPaperclip} />
                        </ActionIcon>
                    </Tooltip>
                </>
            }
            toolbarRight={
                <ComposerSubmitButton
                    icon={IconArrowUp}
                    label="Send"
                    size="sm"
                    disabled={isEmpty || !canSend}
                    loading={isBuilding}
                    onClick={handleSubmit}
                />
            }
        />
    );
};

const DataAppVizComposer: FC<Props> = (props) => (
    <DataAppVizComposerContent key={props.appUuid} {...props} />
);

export default DataAppVizComposer;
