import { FeatureFlags } from '@lightdash/common';
import {
    Badge,
    Group,
    List,
    Loader,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { IconLock } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { type DeleteSpaceModalBody } from '.';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useSpaceDeleteImpact } from '../../../hooks/useSpaceDeleteImpact';
import Callout from '../Callout';
import MantineIcon from '../MantineIcon';
import MantineModal from '../MantineModal';

const DeleteSpaceTextInputConfirmation: FC<{
    data: DeleteSpaceModalBody['data'];
    setCanDelete: (canDelete: boolean) => void;
}> = ({ data, setCanDelete }) => {
    const [value, setValue] = useState('');

    return (
        <TextInput
            label="Type the space name to confirm"
            placeholder="Space name"
            value={value}
            onChange={(e) => {
                setValue(e.target.value);
                if (e.target.value === data?.name) {
                    setCanDelete(true);
                } else {
                    setCanDelete(false);
                }
            }}
        />
    );
};

/** Legacy delete modal content - shows counts from Space object */
const LegacyDeleteSpaceModalContent: FC<Pick<DeleteSpaceModalBody, 'data'>> = ({
    data,
}) => {
    const hasContent =
        data &&
        (data.queries.length > 0 ||
            data.dashboards.length > 0 ||
            data.childSpaces.length > 0);

    if (!hasContent) {
        return null;
    }

    return (
        <Callout variant="danger" title="This will permanently delete:">
            <List size="sm">
                {data.queries.length > 0 && (
                    <List.Item>
                        {data.queries.length} chart
                        {data.queries.length === 1 ? '' : 's'}
                    </List.Item>
                )}
                {data.dashboards.length > 0 && (
                    <List.Item>
                        {data.dashboards.length} dashboard
                        {data.dashboards.length === 1 ? '' : 's'}
                    </List.Item>
                )}
                {data.childSpaces.length > 0 && (
                    <List.Item>
                        {data.childSpaces.length} nested space
                        {data.childSpaces.length === 1 ? '' : 's'} (and all its
                        contents)
                    </List.Item>
                )}
            </List>
        </Callout>
    );
};

/** Enhanced delete modal content - shows detailed impact from API */
const EnhancedDeleteSpaceModalContent: FC<{
    projectUuid: string;
    spaceUuid: string;
}> = ({ projectUuid, spaceUuid }) => {
    const { data: deleteImpact, isLoading } = useSpaceDeleteImpact(
        projectUuid,
        spaceUuid,
        { enabled: true },
    );

    if (isLoading) {
        return (
            <Group justify="center" p="md">
                <Loader size="sm" />
                <Text fz="sm" c="ldGray.6">
                    Loading impact details...
                </Text>
            </Group>
        );
    }

    if (!deleteImpact) {
        return null;
    }

    const hasContent =
        deleteImpact.totalCharts > 0 ||
        deleteImpact.totalDashboards > 0 ||
        deleteImpact.childSpaces.length > 0;

    if (!hasContent) {
        return null;
    }

    return (
        <Callout variant="danger" title="This will permanently delete:">
            <Stack gap="xs">
                <List size="sm">
                    {deleteImpact.totalCharts > 0 && (
                        <List.Item>
                            {deleteImpact.totalCharts} chart
                            {deleteImpact.totalCharts === 1 ? '' : 's'} total
                        </List.Item>
                    )}
                    {deleteImpact.totalDashboards > 0 && (
                        <List.Item>
                            {deleteImpact.totalDashboards} dashboard
                            {deleteImpact.totalDashboards === 1 ? '' : 's'}{' '}
                            total
                        </List.Item>
                    )}
                </List>

                {deleteImpact.childSpaces.length > 0 && (
                    <>
                        <Text fz="sm" fw={500}>
                            {deleteImpact.childSpaces.length} nested space
                            {deleteImpact.childSpaces.length === 1 ? '' : 's'}:
                        </Text>
                        <List size="sm" withPadding>
                            {deleteImpact.childSpaces.map((childSpace) => (
                                <List.Item key={childSpace.uuid}>
                                    <Group gap="xs">
                                        <Text fz="sm" fw={500}>
                                            "{childSpace.name}"
                                        </Text>
                                        {!childSpace.hasAccess && (
                                            <Badge
                                                size="xs"
                                                color="gray"
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconLock}
                                                        size={10}
                                                    />
                                                }
                                            >
                                                restricted access
                                            </Badge>
                                        )}
                                    </Group>
                                    <Text fz="xs" c="ldGray.6">
                                        {childSpace.chartCount} chart
                                        {childSpace.chartCount === 1 ? '' : 's'}
                                        , {childSpace.dashboardCount} dashboard
                                        {childSpace.dashboardCount === 1
                                            ? ''
                                            : 's'}
                                    </Text>
                                </List.Item>
                            ))}
                        </List>
                    </>
                )}
            </Stack>
        </Callout>
    );
};

export const DeleteSpaceModal: FC<DeleteSpaceModalBody> = ({
    data,
    title,
    onClose,
    form,
    handleSubmit,
    isLoading,
    projectUuid,
    spaceUuid,
}) => {
    const [canDelete, setCanDelete] = useState(false);

    // Feature flag for enhanced delete impact
    const { data: inheritanceFeatureFlag } = useServerFeatureFlag(
        FeatureFlags.NestedSpacesPermissions,
    );
    const isInheritanceEnabled = inheritanceFeatureFlag?.enabled ?? false;

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={title}
            variant="delete"
            resourceType="space"
            resourceLabel={data?.name}
            size="lg"
            onConfirm={() => form.onSubmit(handleSubmit)()}
            confirmDisabled={!canDelete || isLoading}
            confirmLoading={isLoading}
        >
            {/* Use enhanced content when flag is ON and we have space details */}
            {isInheritanceEnabled && projectUuid && spaceUuid ? (
                <EnhancedDeleteSpaceModalContent
                    projectUuid={projectUuid}
                    spaceUuid={spaceUuid}
                />
            ) : (
                <LegacyDeleteSpaceModalContent data={data} />
            )}
            <DeleteSpaceTextInputConfirmation
                data={data}
                setCanDelete={setCanDelete}
            />
        </MantineModal>
    );
};
