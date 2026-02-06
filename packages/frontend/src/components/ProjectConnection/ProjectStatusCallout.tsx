import { type ApiError } from '@lightdash/common';
import { Alert, Loader, type AlertProps } from '@mantine-8/core';
import {
    IconAlertTriangleFilled,
    IconCircleCheckFilled,
} from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { type FC } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import MantineIcon from '../common/MantineIcon';
import styles from './ProjectStatusCallout.module.css';

type ProjectStatusCalloutProps = Omit<AlertProps, 'children'> & {
    isSuccess: boolean;
    isError: boolean;
    isLoading: boolean;
    error: ApiError | null;
};

const ProjectStatusCallout: FC<ProjectStatusCalloutProps> = ({
    isSuccess,
    isError,
    isLoading,
    error,
    ...props
}) => {
    let stateProps: AlertProps;

    if (isLoading) {
        stateProps = {
            color: 'blue',
            title: 'Updating project settings...',
            icon: <Loader size="lg" />,
            children: undefined,
            classNames: { title: styles.titleNoMargin },
        };
    } else if (isSuccess) {
        stateProps = {
            color: 'green',
            title: 'Project settings updated!',
            icon: <MantineIcon icon={IconCircleCheckFilled} size="lg" />,
            children: undefined,
            classNames: { title: styles.titleNoMargin },
        };
    } else if (isError) {
        stateProps = {
            color: 'red',
            title: 'There was an error updating the project...',
            icon: <MantineIcon icon={IconAlertTriangleFilled} size="lg" />,
            children: error ? (
                <MDEditor.Markdown
                    source={error.error.message.replaceAll('\n', '\n\n')}
                    rehypePlugins={[
                        [rehypeExternalLinks, { target: '_blank' }],
                    ]}
                    className={styles.markdown}
                />
            ) : null,
            classNames: error ? { title: styles.titleNoMargin } : undefined,
        };
    } else {
        stateProps = {
            color: 'blue',
            title: 'Updating project settings...',
            icon: <Loader size="lg" />,
            children: undefined,
            classNames: { title: styles.titleNoMargin },
        };
    }

    return <Alert {...props} {...stateProps} />;
};

export default ProjectStatusCallout;
