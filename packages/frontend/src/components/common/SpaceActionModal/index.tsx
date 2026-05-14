import {
    assertUnreachable,
    getErrorMessage,
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
import {
    useCreateMutation,
    useSpace,
    useSpaceDeleteMutation,
    useUpdateMutation,
} from '../../../hooks/useSpaces';
import MantineModal from '../MantineModal';
import { InheritanceType } from '../ShareSpaceModal/ShareSpaceModalUtils';
import CreateSpaceModalContent from './CreateSpaceModalContent';
import { DeleteSpaceModal } from './DeleteSpaceModal';
import { ActionType } from './types';
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
}

export interface SpaceModalBody {
    data?: Space;
    form: UseFormReturnType<Space>;
}

export interface DeleteSpaceModalBody
    extends SpaceModalBody, Pick<ActionModalProps, 'title' | 'icon'> {
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
}) => {
    const { showToastError } = useToaster();
    const { colorScheme } = useMantineColorScheme();

    const isNestedSpace = !!parentSpaceUuid;
    const [inheritanceValue, setInheritanceValue] = useState<InheritanceType>(
        InheritanceType.INHERIT,
    );

    const form = useForm<Space>({
        initialValues: actionType === ActionType.CREATE ? undefined : data,
        validate: zodResolver(validate),
    });

    const handleSubmit = (values: Space) => {
        try {
            if (actionType === ActionType.CREATE) {
                onSubmitForm?.({
                    ...values,
                    inheritParentPermissions: isNestedSpace
                        ? true
                        : inheritanceValue === InheritanceType.INHERIT,
                });
            } else {
                onSubmitForm?.(values);
            }
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
                        <Button
                            type="submit"
                            disabled={isDisabled || !form.isValid}
                            color={confirmButtonColor}
                            loading={isLoading}
                            form="form-space-action-modal"
                        >
                            {confirmButtonLabel}
                        </Button>
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
                            form={form}
                            projectUuid={projectUuid}
                            parentSpaceUuid={parentSpaceUuid}
                            inheritanceValue={inheritanceValue}
                            onInheritanceChange={setInheritanceValue}
                        />
                    ) : actionType === ActionType.UPDATE ? (
                        <UpdateSpaceModalContent
                            data={data}
                            form={form}
                            projectUuid={projectUuid}
                        />
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
                access: state.access?.map((access) => ({
                    userUuid: access.userUuid,
                    role: access.role,
                })),
                ...(parentSpaceUuid && {
                    parentSpaceUuid,
                }),
                ...(state.inheritParentPermissions !== undefined && {
                    inheritParentPermissions: state.inheritParentPermissions,
                }),
            });
            onSubmitForm?.(result);
        } else if (actionType === ActionType.UPDATE) {
            const result = await updateMutation({
                name: state.name,
                ...(!parentSpaceUuid && {
                    inheritParentPermissions: state.inheritParentPermissions,
                }),
                colorPaletteUuid: state.colorPaletteUuid,
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
            {...props}
        />
    );
};

export default SpaceActionModal;
