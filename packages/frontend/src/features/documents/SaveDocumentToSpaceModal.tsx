import {
    ContentType,
    ResourceViewItemType,
    type Document,
    type ResourceViewDocumentItem,
} from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { type FC } from 'react';
import TransferItemsModal from '../../components/common/TransferItemsModal/TransferItemsModal';
import { useContentAction } from '../../hooks/useContent';

type Props = {
    document: Document;
    opened: boolean;
    onClose: () => void;
};

const toResourceViewItem = (document: Document): ResourceViewDocumentItem => ({
    type: ResourceViewItemType.DOCUMENT,
    data: {
        uuid: document.documentUuid,
        slug: document.slug,
        name: document.name,
        description: document.description,
        spaceUuid: document.spaceUuid,
        projectUuid: document.projectUuid,
        organizationUuid: document.organizationUuid,
        createdByUserUuid: document.createdByUserUuid,
        directAccessRoles: document.directAccessRoles ?? [],
        views: 0,
        firstViewedAt: null,
        pinnedListUuid: document.pinnedListUuid,
        pinnedListOrder: null,
        updatedAt: document.updatedAt,
        verification: null,
        owner: document.owner,
    },
});

/** Saves a personal Document into a Space, keeping its URL and versions. */
const SaveDocumentToSpaceModal: FC<Props> = ({ document, opened, onClose }) => {
    const queryClient = useQueryClient();
    const { mutateAsync: contentAction, isLoading } = useContentAction(
        document.projectUuid,
    );

    return (
        <TransferItemsModal
            projectUuid={document.projectUuid}
            opened={opened}
            onClose={onClose}
            items={[toResourceViewItem(document)]}
            isLoading={isLoading}
            title="Save to a space"
            description="Everyone with access to the space will be able to see this document."
            confirmLabel="Save"
            createSpaceConfirmLabel="Create space & save"
            onConfirm={async (targetSpaceUuid) => {
                if (!targetSpaceUuid) {
                    return;
                }
                await contentAction({
                    item: {
                        uuid: document.documentUuid,
                        contentType: ContentType.DOCUMENT,
                    },
                    action: { type: 'move', targetSpaceUuid },
                });
                await queryClient.invalidateQueries({
                    queryKey: ['document', document.projectUuid],
                });
                onClose();
            }}
        />
    );
};

export default SaveDocumentToSpaceModal;
