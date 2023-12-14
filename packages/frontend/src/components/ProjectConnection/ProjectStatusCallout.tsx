import { Alert, AlertProps, Loader } from '@mantine/core';
import {
    IconAlertTriangleFilled,
    IconCircleCheckFilled,
} from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { FC } from 'react';
import { useCreateMutation, useUpdateMutation } from '../../hooks/useProject';
import MantineIcon from '../common/MantineIcon';

type ProjectStatusCalloutProps = Omit<AlertProps, 'children'> & {
    mutation: ReturnType<typeof useUpdateMutation | typeof useCreateMutation>;
};

const ProjectStatusCallout: FC<ProjectStatusCalloutProps> = ({
    mutation: { isSuccess, error, isLoading, isError },
    ...props
}) => {
    let stateProps: AlertProps;

    if (isLoading) {
        stateProps = {
            color: 'blue',
            title: 'Updating project settings...',
            icon: <Loader size="lg" />,
            children: undefined,
            styles: { title: { marginBottom: 0 } },
        };
    } else if (isSuccess) {
        stateProps = {
            color: 'green',
            title: 'Project settings updated!',
            icon: <MantineIcon icon={IconCircleCheckFilled} size="lg" />,
            children: undefined,
            styles: { title: { marginBottom: 0 } },
        };
    } else if (isError) {
        stateProps = {
            color: 'red',
            title: 'There was an error updating the project...',
            icon: <MantineIcon icon={IconAlertTriangleFilled} size="lg" />,
            children: error ? (
                <MDEditor.Markdown
                    source={error.error.message.replaceAll('\n', '\n\n')}
                    linkTarget="_blank"
                    style={{
                        background: 'transparent',
                        fontSize: '12px',
                    }}
                />
            ) : null,
            styles: error ? { title: { marginBottom: 0 } } : undefined,
        };
    } else {
        stateProps = {
            color: 'blue',
            title: 'Updating project settings...',
            icon: <Loader size="lg" />,
            children: undefined,
            styles: { title: { marginBottom: 0 } },
        };
    }

    return <Alert {...props} {...stateProps} />;
};

export default ProjectStatusCallout;
