import { Loader, Text } from '@mantine/core';
import { IconCircleCheck } from '@tabler/icons-react';
import { type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineModal from '../../../components/common/MantineModal';
import { getSemanticStudioSourceUrl } from '../../semanticStudio/urls';
import { useLiveSourceFields } from '../hooks/useLiveSourceFields';

type Props = {
    projectUuid: string;
    connectionUuid: string;
    onClose: () => void;
};

/** The last step of adding a source, wherever it was added from. */
export const SourceConnectedModal: FC<Props> = ({
    projectUuid,
    connectionUuid,
    onClose,
}) => {
    const navigate = useNavigate();
    const { data } = useLiveSourceFields({ projectUuid, connectionUuid });
    const inUseCount = data?.fields.filter(({ inUse }) => inUse).length ?? 0;
    const availableCount = (data?.fields.length ?? 0) - inUseCount;

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Connected · ready to query"
            icon={IconCircleCheck}
            cancelLabel="Done"
            confirmLabel="View fields"
            onConfirm={() => {
                onClose();
                void navigate(
                    getSemanticStudioSourceUrl(projectUuid, connectionUuid),
                );
            }}
        >
            {data ? (
                <Text fz="sm">
                    Using {inUseCount} default fields, so charts and AI agents
                    can query this source now.
                    {availableCount > 0 &&
                        ` ${availableCount} more are available to use from Fields.`}
                </Text>
            ) : (
                <Loader size="sm" />
            )}
        </MantineModal>
    );
};
