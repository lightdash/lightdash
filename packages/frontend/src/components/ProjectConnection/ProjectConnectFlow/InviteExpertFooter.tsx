import React, { FC } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { FormFooterCopy, InviteLinkButton } from './ProjectConnectFlow.styles';

const InviteExpertFooter: FC = () => {
    const params = useParams<{ projectUuid: string | undefined }>();
    return (
        <>
            <FormFooterCopy>
                This step is best carried out by your organization’s analytics
                experts. If this is not you,{' '}
                <NavLink
                    to={`/projects/${params.projectUuid}/generalSettings/userManagement`}
                >
                    <InviteLinkButton>
                        invite them to Lightdash!
                    </InviteLinkButton>
                </NavLink>
            </FormFooterCopy>
        </>
    );
};

export default InviteExpertFooter;
