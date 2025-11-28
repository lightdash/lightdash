import {
    assertUnreachable,
    getErrorMessage,
    type OrganizationMemberProfile,
    type Space,
} from '@lightdash/common';
import {
    Button,
    Group,
    MantineProvider,
    useMantineColorScheme,
    type DefaultMantineColor,
} from '@mantine/core';
import { useForm, zodResolver, type UseFormReturnType } from '@mantine/form';
import { type Icon } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import useToaster from '../../../hooks/toaster/useToaster';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import {
    useCreateMutation,
    useSpace,
    useSpaceDeleteMutation,
    useUpdateMutation,
} from '../../../hooks/useSpaces';
import MantineModal from '../MantineModal';
import { SpacePrivateAccessType } from '../ShareSpaceModal/ShareSpaceSelect';
import CreateSpaceModalContent from './CreateSpaceModalContent';
import { DeleteSpaceModal } from './DeleteSpaceModal';
import { ActionType, CreateModalStep } from './types';
import UpdateSpaceModalContent from './UpdateSpaceModalContent';

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
    onSubmitForm?: (data: Space | null) => void;
    isDisabled: boolean;
    isLoading: boolean;
    shouldRedirect?: boolean;
    parentSpaceUuid: Space['parentSpaceUuid'];
    rootSpace?: Pick<Space, 'name' | 'uuid'>;
}

export interface SpaceModalBody {
    data?: Space;
    form: UseFormReturnType<Space>;
}

export interface CreateSpaceModalBody
    extends Pick<ActionModalProps, 'parentSpaceUuid' | 'onClose' | 'rootSpace'>,
        SpaceModalBody {
    modalStep: CreateModalStep;
    projectUuid: string;
    privateAccessType: SpacePrivateAccessType;
    onPrivateAccessTypeChange: (type: SpacePrivateAccessType) => void;
    organizationUsers: OrganizationMemberProfile[] | undefined;
}

export interface DeleteSpaceModalBody
    extends Pick<CreateSpaceModalBody, 'data' | 'form'>,
        Pick<ActionModalProps, 'title' | 'icon'> {
    isLoading: boolean;
    handleSubmit: (values: Space) => void;
    onClose: () => void;
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
    isLoading,
    actionType,
    projectUuid,
    onClose = () => {},
    onSubmitForm,
    parentSpaceUuid,
    rootSpace,
}) => {
    const { showToastError } = useToaster();
    const { colorScheme } = useMantineColorScheme();

    const { data: organizationUsers } = useOrganizationUsers();
    const [privateAccessType, setPrivateAccessType] = useState(
        SpacePrivateAccessType.PRIVATE,
    );

    const [modalStep, setModalStep] = useState(CreateModalStep.SET_NAME);

    const form = useForm<Space>({
        initialValues: actionType === ActionType.CREATE ? undefined : data,
        validate: zodResolver(validate),
    });

    const handleSubmit = (values: Space) => {
        if (
            actionType === ActionType.CREATE &&
            modalStep === CreateModalStep.SET_NAME &&
            privateAccessType === SpacePrivateAccessType.SHARED
        ) {
            setModalStep(CreateModalStep.SET_ACCESS);
            return;
        }

        try {
            onSubmitForm?.(values);
        } catch (e: any) {
            showToastError({
                title: 'Error saving',
                subtitle: getErrorMessage(e),
            });
        }
    };

    if (!projectUuid) {
        return null;
    }

    if (actionType === ActionType.DELETE) {
        return (
            <DeleteSpaceModal
                data={data}
                title={title}
                onClose={onClose}
                icon={icon}
                form={form}
                handleSubmit={handleSubmit}
                isLoading={isLoading}
            />
        );
    }

    return (
        <MantineProvider inherit theme={{ colorScheme }}>
            <MantineModal
                opened
                size="lg"
                icon={icon}
                title={title}
                onClose={onClose}
                actions={
                    <Group spacing="xs" position="right">
                        {actionType === ActionType.CREATE &&
                            modalStep === CreateModalStep.SET_ACCESS && (
                                <>
                                    <Button
                                        variant="outline"
                                        onClick={(
                                            ev: React.MouseEvent<HTMLButtonElement>,
                                        ) => {
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
                                        loading={isLoading}
                                        form="form-space-action-modal"
                                    >
                                        {confirmButtonLabel}
                                    </Button>
                                </>
                            )}

                        {actionType === ActionType.CREATE &&
                            modalStep === CreateModalStep.SET_NAME &&
                            !(
                                privateAccessType ===
                                SpacePrivateAccessType.PRIVATE
                            ) && (
                                <Button
                                    type="submit"
                                    disabled={isDisabled || !form.isValid}
                                    form="form-space-action-modal"
                                >
                                    Continue
                                </Button>
                            )}

                        {(actionType !== ActionType.CREATE ||
                            (actionType === ActionType.CREATE &&
                                modalStep === CreateModalStep.SET_NAME &&
                                privateAccessType ===
                                    SpacePrivateAccessType.PRIVATE)) && (
                            <Button
                                type="submit"
                                disabled={isDisabled || !form.isValid}
                                color={confirmButtonColor}
                                loading={isLoading}
                                form="form-space-action-modal"
                            >
                                {confirmButtonLabel}
                            </Button>
                        )}
                    </Group>
                }
            >
                <form
                    name={title}
                    onSubmit={form.onSubmit(handleSubmit)}
                    id="form-space-action-modal"
                >
                    {actionType === ActionType.CREATE ? (
                        <CreateSpaceModalContent
                            projectUuid={projectUuid}
                            data={data}
                            modalStep={modalStep}
                            form={form}
                            privateAccessType={privateAccessType}
                            onPrivateAccessTypeChange={setPrivateAccessType}
                            organizationUsers={organizationUsers}
                            parentSpaceUuid={parentSpaceUuid}
                            rootSpace={rootSpace}
                            onClose={onClose}
                        />
                    ) : actionType === ActionType.UPDATE ? (
                        <UpdateSpaceModalContent data={data} form={form} />
                    ) : (
                        assertUnreachable(
                            actionType,
                            'Unexpected action in space',
                        )
                    )}
                </form>
            </MantineModal>
        </MantineProvider>
    );
};

const SpaceActionModal: FC<
    Omit<ActionModalProps, 'data' | 'isDisabled' | 'isLoading'>
> = ({
    actionType,
    projectUuid,
    spaceUuid,
    onSubmitForm,
    shouldRedirect = true,
    parentSpaceUuid,
    ...props
}) => {
    const { data, isInitialLoading } = useSpace(projectUuid, spaceUuid, {
        enabled: !!spaceUuid,
    });
    const navigate = useNavigate();

    // Redirect to space on creation
    const { mutateAsync: createMutation, isLoading: isCreating } =
        useCreateMutation(projectUuid, {
            onSuccess: (space) => {
                if (shouldRedirect) {
                    void navigate(
                        `/projects/${projectUuid}/spaces/${space.uuid}`,
                    );
                }
            },
        });

    const { mutateAsync: updateMutation, isLoading: isUpdating } =
        useUpdateMutation(projectUuid, spaceUuid);

    const { mutateAsync: deleteMutation, isLoading: isDeleting } =
        useSpaceDeleteMutation(projectUuid);

    const handleSubmitForm = async (state: Space | null) => {
        if (!state) {
            return;
        }

        if (actionType === ActionType.CREATE) {
            const result = await createMutation({
                name: state.name,
                isPrivate: state.isPrivate,
                access: state.access?.map((access) => ({
                    userUuid: access.userUuid,
                    role: access.role,
                })),
                ...(parentSpaceUuid && {
                    parentSpaceUuid,
                }),
            });
            onSubmitForm?.(result);
        } else if (actionType === ActionType.UPDATE) {
            const result = await updateMutation({
                name: state.name,
                ...(!parentSpaceUuid && {
                    isPrivate: state.isPrivate,
                }),
            });
            onSubmitForm?.(result);
        } else if (actionType === ActionType.DELETE) {
            if (!spaceUuid) {
                return;
            }
            const result = await deleteMutation(spaceUuid);
            onSubmitForm?.(result);
        } else {
            return assertUnreachable(actionType, 'Unexpected action in space');
        }
        props.onClose?.();
    };

    if (isInitialLoading) return null;

    const isWorking = isCreating || isUpdating || isDeleting;

    return (
        <SpaceModal
            data={data}
            projectUuid={projectUuid}
            spaceUuid={spaceUuid}
            actionType={actionType}
            onSubmitForm={handleSubmitForm}
            isDisabled={isWorking}
            isLoading={isWorking}
            parentSpaceUuid={parentSpaceUuid}
            rootSpace={data?.breadcrumbs?.[0]}
            {...props}
        />
    );
};

export default SpaceActionModal;
