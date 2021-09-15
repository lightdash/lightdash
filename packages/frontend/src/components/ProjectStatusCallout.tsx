import React, { ComponentProps, FC } from 'react';
import { Callout, Classes, Spinner } from '@blueprintjs/core';
import { useServerStatus } from '../hooks/useServerStatus';
import { useTables } from '../hooks/useTables';
import { useApp } from '../providers/AppProvider';
import { ShowErrorsButton } from './ShowErrorsButton';

type CalloutProps = ComponentProps<typeof Callout>;

const ErrorMessage = () => {
    const {
        errorLogs: { errorLogs, setErrorLogsVisible },
    } = useApp();
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
            }}
        >
            <p
                style={{
                    margin: 0,
                    alignSelf: 'center',
                }}
            >
                Check error logs for more details
            </p>
            <ShowErrorsButton
                errorLogs={errorLogs}
                setErrorLogsVisible={setErrorLogsVisible}
            />
        </div>
    );
};

const ProjectStatusCallout: FC<CalloutProps> = (props) => {
    const { data, error } = useServerStatus(2000);
    const { data: tables } = useTables();

    let stateProps: CalloutProps = {};

    if (data) {
        switch (data) {
            case 'ready':
                stateProps = {
                    intent: 'success',
                    title: 'Compiled successfully',
                    children: <p>Tables found: {tables?.length}</p>,
                };
                break;
            case 'loading':
                stateProps = {
                    intent: 'primary',
                    title: 'Compiling',
                    icon: <Spinner size={20} className={Classes.ICON} />,
                };
                break;
            default:
                stateProps = {
                    intent: 'danger',
                    title: 'Failed to compile',
                    children: <ErrorMessage />,
                };
                break;
        }
    } else if (error) {
        stateProps = {
            intent: 'danger',
            title: 'Failed to compile',
            children: <ErrorMessage />,
        };
    }

    return <Callout {...props} {...stateProps} />;
};

export default ProjectStatusCallout;
