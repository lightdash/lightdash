import { ActionIcon, Anchor, Box, Group, Text, Tooltip } from '@mantine/core';
import {
    IconArrowUp,
    IconPaperclip,
    IconPlayerStop,
} from '@tabler/icons-react';
import {
    useRef,
    useState,
    type ClipboardEventHandler,
    type DragEventHandler,
    type FC,
} from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { ComposerSubmitButton } from '../../../components/common/PromptComposer/ComposerSubmitButton';
import PromptComposer, {
    type PromptComposerHandle,
} from '../../../components/common/PromptComposer/PromptComposer';
import { SelectedAttachmentSection } from '../AppResourcePicker';
import { type DataAppVizBuildState } from '../hooks/useDataAppVizBuild';
import { useVizComposerAttachments } from '../hooks/useVizComposerAttachments';
import classes from './BuilderPromptBar.module.css';

type Props = {
    projectUuid: string;
    /** The viz, or the pre-claimed draft uuid while nothing exists yet. */
    composerAppUuid: string;
    hasVersions: boolean;
    build: DataAppVizBuildState;
    onCancelBuild: (() => void) | null;
};

const PromptPill: FC<Props> = ({
    projectUuid,
    composerAppUuid,
    hasVersions,
    build,
    onCancelBuild,
}) => {
    const attachments = useVizComposerAttachments({
        projectUuid,
        appUuid: composerAppUuid,
    });
    const composerRef = useRef<PromptComposerHandle>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isEmpty, setIsEmpty] = useState(true);

    const canSend = !build.isBuilding && !attachments.isUploading;

    const handleSubmit = () => {
        const description = composerRef.current?.getText().trim() ?? '';
        if (!description || !canSend) return;
        composerRef.current?.clear();
        build.send({ description, fileIds: attachments.fileIds });
        attachments.clear();
    };

    const handlePaste: ClipboardEventHandler = (event) => {
        if (build.isBuilding || event.clipboardData.files.length === 0) return;
        event.preventDefault();
        attachments.add(Array.from(event.clipboardData.files));
    };

    const handleDragOver: DragEventHandler = (event) => {
        event.preventDefault();
    };

    const handleDrop: DragEventHandler = (event) => {
        event.preventDefault();
        if (build.isBuilding) return;
        attachments.add(Array.from(event.dataTransfer.files));
    };

    return (
        <Box
            className={classes.pillHost}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            <PromptComposer
                ref={composerRef}
                variant="inline"
                placeholder={
                    hasVersions
                        ? 'Ask for a change…'
                        : 'Describe a new chart type…'
                }
                submitDisabled={!canSend}
                onEmptyChange={setIsEmpty}
                onSubmit={handleSubmit}
                onPaste={handlePaste}
                attachments={
                    attachments.attachments.length > 0 ? (
                        <SelectedAttachmentSection
                            attachments={attachments.attachments.map((a) => ({
                                id: a.key,
                                previewUrl: a.previewUrl,
                                filename: a.filename,
                            }))}
                            onRemove={attachments.remove}
                            disabled={build.isBuilding}
                        />
                    ) : undefined
                }
                toolbarRight={
                    <Group gap={4} align="center" wrap="nowrap">
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            hidden
                            onChange={(e) => {
                                attachments.add(
                                    Array.from(e.target.files ?? []),
                                );
                                e.target.value = '';
                            }}
                        />
                        <Tooltip withArrow label="Attach an image or file">
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                disabled={build.isBuilding}
                                aria-label="Attach"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <MantineIcon icon={IconPaperclip} />
                            </ActionIcon>
                        </Tooltip>
                        {build.isBuilding && onCancelBuild ? (
                            <ComposerSubmitButton
                                icon={IconPlayerStop}
                                label="Stop generation"
                                size="sm"
                                destructive
                                onClick={onCancelBuild}
                            />
                        ) : (
                            <ComposerSubmitButton
                                icon={IconArrowUp}
                                label="Send"
                                size="sm"
                                disabled={isEmpty || !canSend}
                                loading={build.isBuilding}
                                onClick={handleSubmit}
                            />
                        )}
                    </Group>
                }
            />
        </Box>
    );
};

/** The floating prompt pill; a failed send reports itself right above it. */
const BuilderPromptBar: FC<Props> = (props) => (
    <Box className={classes.wrap}>
        {props.build.error !== null && (
            <Box className={classes.failedPill}>
                <Text fz={13} c="red.7" lineClamp={1}>
                    {props.build.error}
                </Text>
                {props.build.retry && (
                    <Anchor
                        component="button"
                        type="button"
                        size="xs"
                        onClick={props.build.retry}
                    >
                        Retry
                    </Anchor>
                )}
            </Box>
        )}
        {/* Remount on app change so drafted text and attachments never leak
            across visualizations. */}
        <PromptPill key={props.composerAppUuid} {...props} />
    </Box>
);

export default BuilderPromptBar;
