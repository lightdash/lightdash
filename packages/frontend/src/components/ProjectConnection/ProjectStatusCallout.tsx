import { Callout, Classes, Spinner } from '@blueprintjs/core';
import MDEditor from '@uiw/react-md-editor';
import React, { ComponentProps, FC } from 'react';
import { useCreateMutation, useUpdateMutation } from '../../hooks/useProject';

type CalloutProps = ComponentProps<typeof Callout>;

const ProjectStatusCallout: FC<
    CalloutProps & {
        mutation: ReturnType<
            typeof useUpdateMutation | typeof useCreateMutation
        >;
    } & { isCompiling: boolean }
> = ({
    mutation: { isSuccess, error, isLoading, isError },
    isCompiling,
    ...props
}) => {
    let stateProps: CalloutProps;

    if (isLoading) {
        stateProps = {
            intent: 'primary',
            title: 'Testing connection',
            icon: <Spinner size={20} className={Classes.ICON} />,
        };
    } else if (isCompiling) {
        stateProps = {
            intent: 'primary',
            title: 'Compiling schema.',
            icon: <Spinner size={20} className={Classes.ICON} />,
        };
    } else if (isSuccess) {
        stateProps = {
            intent: 'success',
            title: 'Successfully connected! Updated project settings.',
        };
    } else if (isError) {
        stateProps = {
            intent: 'danger',
            title: 'There was an error getting connected',
            children: error ? (
                <MDEditor.Markdown
                    source={error.error.message.replaceAll('\n', '\n\n')}
                    linkTarget="_blank"
                />
            ) : null,
        };
    } else {
        stateProps = {
            intent: 'primary',
            title: 'Testing connection',
            icon: <Spinner size={20} className={Classes.ICON} />,
        };
    }

    return <Callout {...props} {...stateProps} />;
};

export default ProjectStatusCallout;
