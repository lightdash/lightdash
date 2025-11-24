import { ChartKind, type AiAgentMessageAssistant } from '@lightdash/common';
import { Anchor, Text } from '@mantine-8/core';
import {
    IconArrowRight,
    IconChartBar,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { getChartIcon } from '../../../../../components/common/ResourceIcon/utils';
import { setArtifact } from '../../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import styles from './ContentLink.module.css';

type ContentLinkProps = {
    contentType: string | undefined;
    props: Record<string, unknown>;
    children: ReactNode;
    message: AiAgentMessageAssistant;
    projectUuid: string;
    agentUuid: string;
};

export const ContentLink: FC<ContentLinkProps> = ({
    contentType,
    props,
    children,
    message,
    projectUuid,
    agentUuid,
}) => {
    const dispatch = useAiAgentStoreDispatch();
    const currentArtifact = useAiAgentStoreSelector(
        (state) => state.aiArtifact.artifact,
    );

    switch (contentType) {
        case 'dashboard-link':
            return (
                <Anchor
                    {...props}
                    target="_blank"
                    fz="sm"
                    fw={500}
                    bg="ldGray.0"
                    c="ldGray.7"
                    td="none"
                    classNames={{
                        root: styles.contentLink,
                    }}
                >
                    <MantineIcon
                        icon={IconLayoutDashboard}
                        size="md"
                        color="green.7"
                        fill="green.6"
                        fillOpacity={0.2}
                        strokeWidth={1.9}
                    />

                    {/* margin is added by md package */}
                    <Text fz="sm" fw={500} m={0}>
                        {children}
                    </Text>

                    <MantineIcon
                        icon={IconArrowRight}
                        color="ldGray.7"
                        size="sm"
                        strokeWidth={2.0}
                    />
                </Anchor>
            );

        case 'chart-link': {
            const chartType =
                'data-chart-type' in props &&
                typeof props['data-chart-type'] === 'string'
                    ? props['data-chart-type']
                    : undefined;

            const chartTypeKind =
                chartType &&
                Object.values(ChartKind).includes(chartType as ChartKind)
                    ? (chartType as ChartKind)
                    : undefined;

            return (
                <Anchor
                    {...props}
                    target="_blank"
                    fz="sm"
                    fw={500}
                    bg="ldGray.0"
                    c="ldGray.7"
                    td="none"
                    classNames={{
                        root: styles.contentLink,
                    }}
                >
                    {chartTypeKind && (
                        <MantineIcon
                            icon={getChartIcon(chartTypeKind)}
                            size="md"
                            color="blue.7"
                            fill="blue.4"
                            fillOpacity={0.2}
                            strokeWidth={1.9}
                        />
                    )}

                    {/* margin is added by md package */}
                    <Text fz="sm" fw={500} m={0}>
                        {children}
                    </Text>

                    <MantineIcon
                        icon={IconArrowRight}
                        color="ldGray.7"
                        size="sm"
                        strokeWidth={2.0}
                    />
                </Anchor>
            );
        }

        case 'artifact-link': {
            const artifactUuid =
                'data-artifact-uuid' in props &&
                typeof props['data-artifact-uuid'] === 'string'
                    ? props['data-artifact-uuid']
                    : undefined;
            const versionUuid =
                'data-version-uuid' in props &&
                typeof props['data-version-uuid'] === 'string'
                    ? props['data-version-uuid']
                    : undefined;
            const artifactType =
                'data-artifact-type' in props &&
                typeof props['data-artifact-type'] === 'string'
                    ? props['data-artifact-type']
                    : undefined;

            const artifactIcon =
                artifactType === 'chart'
                    ? IconChartBar
                    : artifactType === 'dashboard'
                    ? IconLayoutDashboard
                    : IconChartBar;

            const isActive =
                currentArtifact &&
                currentArtifact.artifactUuid === artifactUuid &&
                currentArtifact.versionUuid === versionUuid;

            return (
                <Anchor
                    component="button"
                    type="button"
                    fz="sm"
                    fw={500}
                    bg="ldGray.0"
                    c="ldGray.7"
                    td="none"
                    classNames={{
                        root: styles.contentLink,
                    }}
                    data-artifact-active={isActive || undefined}
                    onClick={(e) => {
                        e.preventDefault();
                        if (artifactUuid && versionUuid) {
                            dispatch(
                                setArtifact({
                                    artifactUuid,
                                    versionUuid,
                                    messageUuid: message.uuid,
                                    threadUuid: message.threadUuid,
                                    projectUuid: projectUuid,
                                    agentUuid: agentUuid,
                                }),
                            );
                        }
                    }}
                >
                    <MantineIcon
                        icon={artifactIcon}
                        size="md"
                        color="indigo.6"
                        fill="indigo.1"
                        fillOpacity={0.2}
                        strokeWidth={1.9}
                    />

                    {/* margin is added by md package */}
                    <Text fz="sm" fw={500} m={0}>
                        {children}
                    </Text>
                </Anchor>
            );
        }

        default:
            return <a {...props}>{children}</a>;
    }
};
