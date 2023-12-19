import {
    assertUnreachable,
    OrganizationMemberProfile,
    Space,
} from '@lightdash/common';
import {
    Button,
    DefaultMantineColor,
    Group,
    MantineProvider,
    Modal,
    Title,
} from '@mantine/core';
import { useForm, UseFormReturnType, zodResolver } from '@mantine/form';
import { Icon } from '@tabler/icons-react';
import { FC, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { z } from 'zod';
import useToaster from '../../../hooks/toaster/useToaster';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import {
    useCreateMutation,
    useSpace,
    useSpaceDeleteMutation,
    useUpdateMutation,
} from '../../../hooks/useSpaces';
import MantineIcon from '../MantineIcon';
import CreateSpaceModalContent, {
    CreateModalStep,
} from './CreateSpaceModalContent';
import DeleteSpaceModalContent from './DeleteSpaceModalContent';
import UpdateSpaceModalContent from './UpdateSpaceModalContent';

export enum ActionType {
    CREATE,
    UPDATE,
    DELETE,
}

interface ActionModalProps {
    actionType: ActionType;
    title: string;
    icon?: Icon;
    confirmButtonLabel: string;
    confirmButtonColor?: DefaultMantineColor;
    data?: Space;
    projectUuid: string;
    spaceUuid?: string;
    onClose?: () => void;
    onSubmitForm?: (data?: Space) => void;
    isDisabled: boolean;
    shouldRedirect?: boolean;
}

export interface SpaceModalBody {
    data?: Space;
    form: UseFormReturnType<Space>;
}

export interface CreateSpaceModalBody {
    data?: Space;
    modalStep: CreateModalStep;
    projectUuid: string;
    form: UseFormReturnType<Space>;
    setIsShared: (isShared: boolean) => void;
    organizationUsers: OrganizationMemberProfile[] | undefined;
}

const validate = z.object({
    name: z.string().min(1, { message: 'Name is required' }),
});

const SpaceModal: FC<ActionModalProps> = ({
    data,
    icon,
    title,
    confirmButtonLabel,
    confirmButtonColor = 'blue',
    isDisabled,
    actionType,
    projectUuid,
    onClose = () => {},
    onSubmitForm,
}) => {
    const { showToastError } = useToaster();

    const form = useForm<Space>({
        initialValues: data,
        validate: zodResolver(validate),
    });

    const handleSubmit = (values: Space) => {
        try {
            onSubmitForm?.(values);
        } catch (e: any) {
            showToastError({
                title: 'Error saving',
                subtitle: e.message,
            });
        }
    };

    const [modalStep, setModalStep] = useState<CreateModalStep>(
        CreateModalStep.SET_NAME,
    );
    const [isShared, setIsShared] = useState<boolean>(false);
    const { data: organizationUsers } = useOrganizationUsers();

    return (
        <MantineProvider inherit theme={{ colorScheme: 'light' }}>
            <Modal
                opened
                size="lg"
                title={
                    <Group spacing="xs">
                        {icon && <MantineIcon icon={icon} size="lg" />}
                        <Title order={4}>{title}</Title>
                    </Group>
                }
                onClose={onClose}
            >
                <form name={title} onSubmit={form.onSubmit(handleSubmit)}>
                    {actionType === ActionType.CREATE ? (
                        <CreateSpaceModalContent
                            projectUuid={projectUuid}
                            data={data}
                            modalStep={modalStep}
                            form={form}
                            setIsShared={setIsShared}
                            organizationUsers={organizationUsers}
                        />
                    ) : actionType === ActionType.UPDATE ? (
                        <UpdateSpaceModalContent data={data} form={form} />
                    ) : actionType === ActionType.DELETE ? (
                        <DeleteSpaceModalContent data={data} form={form} />
                    ) : (
                        assertUnreachable(
                            actionType,
                            'Unexpected action in space',
                        )
                    )}

                    <Group spacing="xs" position="right" mt="xl">
                        {actionType === ActionType.CREATE &&
                            modalStep === CreateModalStep.SET_ACCESS && (
                                <>
                                    <Button
                                        variant="light"
                                        onClick={(ev) => {
                                            form.setValues({
                                                access: undefined,
                                            });
                                            setModalStep(
                                                CreateModalStep.SET_NAME,
                                            );
                                            ev.preventDefault();
                                        }}
                                    >
                                        Back
                                    </Button>

                                    <Button
                                        type="submit"
                                        disabled={isDisabled || !form.isValid}
                                        color={confirmButtonColor}
                                        loading={isDisabled}
                                    >
                                        {confirmButtonLabel}
                                    </Button>
                                </>
                            )}

                        {actionType === ActionType.CREATE &&
                            modalStep === CreateModalStep.SET_NAME &&
                            isShared && (
                                <Button
                                    disabled={isDisabled || !form.isValid}
                                    onClick={(e) => {
                                        setModalStep(
                                            CreateModalStep.SET_ACCESS,
                                        );
                                        e.preventDefault();
                                    }}
                                >
                                    Continue
                                </Button>
                            )}

                        {(actionType !== ActionType.CREATE ||
                            (actionType === ActionType.CREATE &&
                                modalStep === CreateModalStep.SET_NAME &&
                                !isShared)) && (
                            <Button
                                type="submit"
                                disabled={isDisabled || !form.isValid}
                                color={confirmButtonColor}
                                loading={isDisabled}
                            >
                                {confirmButtonLabel}
                            </Button>
                        )}
                    </Group>
                </form>
            </Modal>
        </MantineProvider>
    );
};

const SpaceActionModal: FC<Omit<ActionModalProps, 'data' | 'isDisabled'>> = ({
    actionType,
    projectUuid,
    spaceUuid,
    onSubmitForm,
    shouldRedirect = true,
    ...props
}) => {
    const { data, isLoading } = useSpace(projectUuid, spaceUuid!, {
        enabled: !!spaceUuid,
    });
    const history = useHistory();

    // Redirect to space on creation
    const { mutateAsync: createMutation, isLoading: isCreating } =
        useCreateMutation(projectUuid, {
            onSuccess: (space) => {
                if (shouldRedirect) {
                    history.push(
                        `/projects/${projectUuid}/spaces/${space.uuid}`,
                    );
                }
            },
        });

    const { mutateAsync: updateMutation, isLoading: isUpdating } =
        useUpdateMutation(projectUuid, spaceUuid!);

    const { mutateAsync: deleteMutation, isLoading: isDeleting } =
        useSpaceDeleteMutation(projectUuid);

    const handleSubmitForm = async (state?: Space) => {
        if (actionType === ActionType.CREATE) {
            const result = await createMutation({
                name: state!.name,
                isPrivate: state!.isPrivate,
                access: state!.access?.map((access) => ({
                    userUuid: access.userUuid,
                })),
            });
            onSubmitForm?.(result);
        } else if (actionType === ActionType.UPDATE) {
            const result = await updateMutation({
                name: state!.name,
                isPrivate: state!.isPrivate,
            });
            onSubmitForm?.(result);
        } else if (actionType === ActionType.DELETE) {
            const result = await deleteMutation(spaceUuid!);
            onSubmitForm?.(result);
        } else {
            return assertUnreachable(actionType, 'Unexpected action in space');
        }
        props.onClose?.();
    };

    if (isLoading) return null;

    const isWorking = isCreating || isUpdating || isDeleting;

    return (
        <SpaceModal
            data={data}
            projectUuid={projectUuid}
            spaceUuid={spaceUuid}
            actionType={actionType}
            onSubmitForm={handleSubmitForm}
            isDisabled={isWorking}
            {...props}
        />
    );
};

export default SpaceActionModal;
