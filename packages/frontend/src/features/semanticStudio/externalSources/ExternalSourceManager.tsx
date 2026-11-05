/**
 * Everything a person does to an external source, wherever on the Semantic
 * Layer page they start it: add, preview, rename, replace the file and
 * delete. The dialogs live here once.
 */
import { type ExternalSource } from '@lightdash/common';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import { AddDataModal } from '../../externalSources/components/AddDataModal';
import { DeleteExternalSourceModal } from '../../externalSources/components/DeleteExternalSourceModal';
import { RenameExternalSourceModal } from '../../externalSources/components/RenameExternalSourceModal';
import { ReplaceCsvFileModal } from '../../externalSources/components/ReplaceCsvFileModal';
import { SourceTablePreviewDrawer } from '../../externalSources/components/SourceTablePreviewDrawer';
import {
    ExternalSourceActionsContext,
    type ExternalSourceActions,
} from './externalSourceActions';
import {
    getExternalSourceLabel,
    getExternalSourceRef,
} from './externalSourceRows';

type Dialog =
    | { kind: 'closed' }
    | { kind: 'add' }
    | {
          kind: 'preview' | 'rename' | 'replaceFile' | 'remove';
          source: ExternalSource;
      };

export const ExternalSourceManager: FC<{
    projectUuid: string;
    /** Whether the person manages external sources; otherwise a no-op. */
    enabled: boolean;
    /** Opens the explore a new source created. */
    onCreated: (exploreName: string) => void;
    /** Where to go after a source is deleted, so its page doesn't linger. */
    onRemoved: () => void;
    children: ReactNode;
}> = ({ projectUuid, enabled, onCreated, onRemoved, children }) => {
    const [dialog, setDialog] = useState<Dialog>({ kind: 'closed' });
    const close = () => setDialog({ kind: 'closed' });
    const actions = useMemo(
        (): ExternalSourceActions => ({
            add: () => setDialog({ kind: 'add' }),
            preview: (source) => setDialog({ kind: 'preview', source }),
            rename: (source) => setDialog({ kind: 'rename', source }),
            replaceFile: (source) => setDialog({ kind: 'replaceFile', source }),
            remove: (source) => setDialog({ kind: 'remove', source }),
        }),
        [],
    );

    if (!enabled) return <>{children}</>;
    const source = 'source' in dialog ? dialog.source : null;
    const sourceRef = source ? getExternalSourceRef(source) : null;
    const label = source ? getExternalSourceLabel(source) : '';
    return (
        <ExternalSourceActionsContext.Provider value={actions}>
            {children}
            <AddDataModal
                projectUuid={projectUuid}
                opened={dialog.kind === 'add'}
                onClose={close}
                onCreated={(exploreName) => {
                    close();
                    onCreated(exploreName);
                }}
            />
            {sourceRef && dialog.kind === 'rename' ? (
                <RenameExternalSourceModal
                    projectUuid={projectUuid}
                    sourceRef={sourceRef}
                    currentLabel={label}
                    opened
                    onClose={close}
                />
            ) : null}
            {sourceRef && dialog.kind === 'replaceFile' ? (
                <ReplaceCsvFileModal
                    projectUuid={projectUuid}
                    sourceRef={sourceRef}
                    tableLabel={label}
                    opened
                    onClose={close}
                />
            ) : null}
            {source && dialog.kind === 'remove' ? (
                <DeleteExternalSourceModal
                    projectUuid={projectUuid}
                    sourceRef={source}
                    tableLabel={label}
                    opened
                    onClose={close}
                    onDeleted={onRemoved}
                />
            ) : null}
            <SourceTablePreviewDrawer
                projectUuid={projectUuid}
                sourceRef={
                    dialog.kind === 'preview' && sourceRef
                        ? sourceRef
                        : undefined
                }
                tableLabel={label}
                onClose={close}
            />
        </ExternalSourceActionsContext.Provider>
    );
};
