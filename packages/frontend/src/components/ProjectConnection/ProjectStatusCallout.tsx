import React, { ComponentProps, FC } from 'react';
import { Callout, Classes, Spinner } from '@blueprintjs/core';
import Markdown from 'markdown-to-jsx';
import { useCreateMutation, useUpdateMutation } from '../../hooks/useProject';

type CalloutProps = ComponentProps<typeof Callout>;

const ProjectStatusCallout: FC<
    CalloutProps & {
        mutation: ReturnType<
            typeof useUpdateMutation | typeof useCreateMutation
        >;
    }
> = ({ mutation: { isSuccess, error, isLoading, isError }, ...props }) => {
    let stateProps: CalloutProps;

    if (isLoading) {
        stateProps = {
            intent: 'primary',
            title: 'Testing connection',
            icon: <Spinner size={20} className={Classes.ICON} />,
        };
    } else if (isSuccess) {
        stateProps = {
            intent: 'success',
            title: 'Connected with success',
        };
    } else if (isError) {
        stateProps = {
            intent: 'danger',
            title: 'There was an error getting connected',
            children: error ? (
                <Markdown
                    options={{
                        overrides: {
                            a: {
                                props: {
                                    target: '_blank',
                                },
                            },
                        },
                    }}
                >
                    {error.error.message.replaceAll('\n', '\n\n')}
                </Markdown>
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
