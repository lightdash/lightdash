import {
    isTabularThreadFileName,
    type AiPromptContextItem,
} from '@lightdash/common';
import { Group, Loader, Pill } from '@mantine/core';
import { IconFileText, IconTable } from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { ElementRefPill } from '../../../../../features/apps/components/ElementRefPill';
import {
    elementRefKey,
    type ElementRef,
} from '../../../../../features/apps/utils/elementRefs';
import { type PendingCsvSource } from '../../hooks/useCsvSourceAttachment';
import {
    type PendingThreadFile,
    type ThreadFileAttachment,
} from '../../hooks/useThreadFileAttachment';

export type ExternalSourceAttachment = Extract<
    AiPromptContextItem,
    { type: 'external_source' }
>;

type Props<T extends ElementRef> = {
    externalSources: ExternalSourceAttachment[];
    onRemoveExternalSource: (sourceUuid: string) => void;
    pendingCsvFiles: PendingCsvSource[];
    threadFiles: ThreadFileAttachment[];
    onRemoveThreadFile: (fileUuid: string) => void;
    pendingThreadFiles: PendingThreadFile[];
    elementRefs: T[];
    /** Called with the same object from `elementRefs`, so hosts that tag
     *  references with extra fields (app, version) get them back intact. */
    onRemoveElementRef: (ref: T) => void;
};

/** The row of context attached to a prompt, shown between editor and toolbar. */
export const PromptAttachments = <T extends ElementRef>({
    externalSources,
    onRemoveExternalSource,
    pendingCsvFiles,
    threadFiles,
    onRemoveThreadFile,
    pendingThreadFiles,
    elementRefs,
    onRemoveElementRef,
}: Props<T>) => (
    <Pill.Group>
        {externalSources.map((attachment) => (
            <Pill
                key={attachment.sourceUuid}
                withRemoveButton
                onRemove={() => onRemoveExternalSource(attachment.sourceUuid)}
            >
                {attachment.displayName}
                {attachment.tables.length > 1
                    ? ` · ${attachment.tables.length} tables`
                    : ''}
            </Pill>
        ))}
        {pendingCsvFiles.map((file) => (
            <Pill key={file.id}>
                <Group gap={6} wrap="nowrap">
                    {file.status === 'preparing' && <Loader size={10} />}
                    {file.status === 'queued' ? 'Queued' : 'Preparing'}{' '}
                    {file.filename}
                </Group>
            </Pill>
        ))}
        {threadFiles.map((attachment) => (
            <Pill
                key={attachment.fileUuid}
                withRemoveButton
                onRemove={() => onRemoveThreadFile(attachment.fileUuid)}
            >
                <Group gap={4} wrap="nowrap">
                    <MantineIcon
                        icon={
                            isTabularThreadFileName(attachment.fileName)
                                ? IconTable
                                : IconFileText
                        }
                        size={12}
                    />
                    {attachment.fileName}
                </Group>
            </Pill>
        ))}
        {pendingThreadFiles.map((file) => (
            <Pill key={`document-${file.id}`}>
                <Group gap={6} wrap="nowrap">
                    <Loader size={10} />
                    Uploading {file.filename}
                </Group>
            </Pill>
        ))}
        {elementRefs.map((ref) => (
            <ElementRefPill
                key={elementRefKey(ref)}
                elementRef={ref}
                onRemove={() => onRemoveElementRef(ref)}
            />
        ))}
    </Pill.Group>
);
