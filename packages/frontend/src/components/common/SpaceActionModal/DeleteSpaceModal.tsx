import { Button, List, TextInput } from '@mantine-8/core';
import { useState, type FC } from 'react';
import { type DeleteSpaceModalBody } from '.';
import MantineModal from '../MantineModal';
import Callout from '../Callout';

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

const DeleteSpaceModalContent: FC<Pick<DeleteSpaceModalBody, 'data'>> = ({
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

export const DeleteSpaceModal: FC<DeleteSpaceModalBody> = ({
    data,
    title,
    onClose,
    icon,
    form,
    handleSubmit,
    isLoading,
}) => {
    const [canDelete, setCanDelete] = useState(false);

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={title}
            icon={icon}
            size="lg"
            description={`Are you sure you want to delete space "${data?.name}"?`}
            actions={
                <Button
                    color="red"
                    disabled={!canDelete || isLoading}
                    loading={isLoading}
                    onClick={() => form.onSubmit(handleSubmit)()}
                >
                    Delete Space
                </Button>
            }
        >
            <DeleteSpaceModalContent data={data} />
            <DeleteSpaceTextInputConfirmation
                data={data}
                setCanDelete={setCanDelete}
            />
        </MantineModal>
    );
};
