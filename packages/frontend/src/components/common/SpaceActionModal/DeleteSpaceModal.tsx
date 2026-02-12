import { List, TextInput } from '@mantine-8/core';
import { useState, type FC } from 'react';
import { type DeleteSpaceModalBody } from '.';
import useApp from '../../../providers/App/useApp';
import Callout from '../Callout';
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

const DeleteSpaceModalContent: FC<
    Pick<DeleteSpaceModalBody, 'data'> & { softDeleteEnabled: boolean }
> = ({ data, softDeleteEnabled }) => {
    const hasContent =
        data &&
        (data.queries.length > 0 ||
            data.dashboards.length > 0 ||
            data.childSpaces.length > 0);

    if (!hasContent) {
        return null;
    }

    const title = softDeleteEnabled
        ? 'This will also delete:'
        : 'This will permanently delete:';

    return (
        <Callout
            variant={softDeleteEnabled ? 'warning' : 'danger'}
            title={title}
        >
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

export const DeleteSpaceModal: FC<DeleteSpaceModalBody> = ({
    data,
    title,
    onClose,
    form,
    handleSubmit,
    isLoading,
}) => {
    const { health } = useApp();
    const softDeleteEnabled = health.data?.softDelete.enabled ?? false;
    const retentionDays = health.data?.softDelete.retentionDays ?? 30;

    const [canDelete, setCanDelete] = useState(false);

    const description = softDeleteEnabled
        ? `Are you sure you want to delete the space "${data?.name}"? This space and its contents will be moved to Recently deleted and permanently removed after ${retentionDays} days.`
        : undefined;

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={title}
            variant="delete"
            resourceType="space"
            resourceLabel={data?.name}
            description={description}
            size="lg"
            onConfirm={form.onSubmit(handleSubmit)}
            confirmDisabled={!canDelete || isLoading}
            confirmLoading={isLoading}
        >
            <DeleteSpaceModalContent
                data={data}
                softDeleteEnabled={softDeleteEnabled}
            />
            <DeleteSpaceTextInputConfirmation
                data={data}
                setCanDelete={setCanDelete}
            />
        </MantineModal>
    );
};
