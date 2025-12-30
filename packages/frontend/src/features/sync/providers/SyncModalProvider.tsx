import { useState, type FC } from 'react';
import SyncModalContext from './context';
import { type SyncFormConfig, SyncModalAction } from './types';

export const SyncModalProvider: FC<React.PropsWithChildren<{}>> = ({
    children,
}) => {
    const [action, setAction] = useState<SyncModalAction>(SyncModalAction.VIEW);
    const [currentSchedulerUuid, setCurrentSchedulerUuid] = useState<string>();
    const [formConfig, setFormConfig] = useState<SyncFormConfig | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    return (
        <SyncModalContext.Provider
            value={{
                action,
                setAction,
                currentSchedulerUuid,
                setCurrentSchedulerUuid,
                formConfig,
                setFormConfig,
                isDeleting,
                setIsDeleting,
            }}
        >
            {children}
        </SyncModalContext.Provider>
    );
};
