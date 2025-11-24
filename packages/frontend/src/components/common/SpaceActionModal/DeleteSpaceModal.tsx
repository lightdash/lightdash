import { Alert, Button, Flex, Text, TextInput } from '@mantine/core';
import { useState, type FC } from 'react';
import { type DeleteSpaceModalBody } from '.';
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

const DeleteSpaceModalContent: FC<Pick<DeleteSpaceModalBody, 'data'>> = ({
    data,
}) => {
    if (
        !data ||
        !(
            data.queries.length > 0 ||
            data.dashboards.length > 0 ||
            data.childSpaces.length > 0
        )
    ) {
        return (
            <p>
                Are you sure you want to delete space <b>"{data?.name}"</b>?
            </p>
        );
    }

    return (
        <>
            <p>
                Are you sure you want to delete space <b>"{data?.name}"</b>?
            </p>

            <Alert color="red">
                <Text size="sm" color="ldGray.9">
                    <strong>This will permanently delete:</strong>
                </Text>
                <ul style={{ paddingLeft: '1rem' }}>
                    {data.queries.length > 0 ? (
                        <li>
                            {data.queries.length} chart
                            {data.queries.length === 1 ? '' : 's'}
                        </li>
                    ) : null}
                    {data.dashboards.length > 0 && (
                        <li>
                            {data.dashboards.length} dashboard
                            {data.dashboards.length === 1 ? '' : 's'}
                        </li>
                    )}
                    {data.childSpaces.length > 0 && (
                        <li>
                            {data.childSpaces.length} nested space
                            {data.childSpaces.length === 1 ? '' : 's'} (and all
                            its contents)
                        </li>
                    )}
                </ul>
            </Alert>
        </>
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
            actions={
                <form name={title} onSubmit={form.onSubmit(handleSubmit)}>
                    <Flex gap="sm">
                        <Button variant="default" h={32} onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            h={32}
                            type="submit"
                            color="red"
                            disabled={!canDelete || isLoading}
                            loading={isLoading}
                        >
                            Delete Space
                        </Button>
                    </Flex>
                </form>
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
