import { useState, type FC } from 'react';
import { useClearAgentContext } from '../hooks/useClearAgentContext';
import ClearAgentContextButton from './ClearAgentContextButton';
import ClearAgentContextModal from './ClearAgentContextModal';

type Props = {
    projectUuid: string;
    appUuid: string;
    /** A build is running: clearing is refused until it lands. */
    disabled: boolean;
};

/** The clear button with its confirm dialog and request. */
const ClearAgentContextAction: FC<Props> = ({
    projectUuid,
    appUuid,
    disabled,
}) => {
    const [isConfirming, setIsConfirming] = useState(false);
    const { mutate, isLoading } = useClearAgentContext(projectUuid, appUuid);

    return (
        <>
            <ClearAgentContextButton
                disabled={disabled}
                onClick={() => setIsConfirming(true)}
            />
            <ClearAgentContextModal
                opened={isConfirming}
                loading={isLoading}
                onClose={() => setIsConfirming(false)}
                onConfirm={() =>
                    mutate(undefined, {
                        onSuccess: () => setIsConfirming(false),
                    })
                }
            />
        </>
    );
};

export default ClearAgentContextAction;
