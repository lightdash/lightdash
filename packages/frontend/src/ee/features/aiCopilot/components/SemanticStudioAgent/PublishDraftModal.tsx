import { useQueryClient } from '@tanstack/react-query';
import { type FC } from 'react';
import MantineModal from '../../../../../components/common/MantineModal';
import { rememberGoingLive } from '../../../../../features/semanticStudio/useGoingLive';
import { usePublishCheckout } from '../../../../../features/semanticStudio/useSemanticLayerModel';

/** Confirms merging a dbt draft's pull request, which everyone sees once the project compiles. */
export const PublishDraftModal: FC<{
    projectUuid: string;
    prUrl: string;
    destination: string;
    onClose: () => void;
}> = ({ projectUuid, prUrl, destination, onClose }) => {
    const queryClient = useQueryClient();
    const { mutate: publish, isLoading } = usePublishCheckout(projectUuid);
    return (
        <MantineModal
            opened
            title="Publish draft"
            description={`This merges ${destination}, then the project updates for everyone.`}
            confirmLabel="Publish"
            confirmLoading={isLoading}
            onClose={onClose}
            onConfirm={() =>
                publish(
                    { prUrl },
                    {
                        // A failed publish keeps the dialog, under the toast that says why.
                        onSuccess: ({ compileJobUuid }) => {
                            onClose();
                            rememberGoingLive(
                                queryClient,
                                projectUuid,
                                prUrl,
                                compileJobUuid,
                            );
                        },
                    },
                )
            }
        />
    );
};
