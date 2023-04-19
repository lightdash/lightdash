import { Button } from '@blueprintjs/core';
import { FC, useState } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useApp } from '../../../providers/AppProvider';
import OrganizationDeleteModal from '../../common/modal/OrganizationDeleteModal';
import {
    CardContainer,
    Description,
    PanelContent,
    Title,
} from './DeleteOrganizationPanel.styles';

export const DeleteOrganizationPanel: FC = () => {
    const { isLoading: isLoading, data: organization } = useOrganization();

    const [showConfirmation, setShowConfirmation] = useState<boolean>(false);
    const { user } = useApp();

    if (isLoading || organization === undefined) return null;
    if (!user.data?.ability?.can('delete', 'Organization')) return null;

    return (
        <>
            <CardContainer>
                <div>
                    <Title>Danger zone </Title>
                    <Description>
                        This action deletes the whole workspace and all its
                        content, including users. This action is not reversible.
                    </Description>
                </div>
                <PanelContent>
                    <Button
                        outlined
                        intent="danger"
                        icon="trash"
                        text={`Delete '${organization.name}'`}
                        onClick={() => setShowConfirmation(true)}
                    />
                </PanelContent>
            </CardContainer>

            <OrganizationDeleteModal
                isOpen={showConfirmation}
                onClose={() => setShowConfirmation(false)}
                onConfirm={() => setShowConfirmation(false)}
            />
        </>
    );
};
