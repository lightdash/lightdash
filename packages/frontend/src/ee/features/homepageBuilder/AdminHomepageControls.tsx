import { subject } from '@casl/ability';
import { IconEdit, IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { Can } from '../../../providers/Ability';
import classes from './adminHomepageControls.module.css';
import { OpeningChoiceMenu } from './OpeningChoiceMenu';

type Props = {
    projectUuid: string;
    organizationUuid: string | undefined;
    showNewHomepage?: boolean;
    /** Day-0 only: there's no published layout yet, so the opening is the one
     * thing an admin can change without entering the builder. */
    showOpeningChoice?: boolean;
};

// Pinned top-right, just below the navbar, for anyone who can manage the
// project homepage — styled to match the builder's own toolbar buttons.
export const AdminHomepageControls: FC<Props> = ({
    projectUuid,
    organizationUuid,
    showNewHomepage = false,
    showOpeningChoice = false,
}) => {
    const navigate = useNavigate();
    return (
        <div className={classes.corner}>
            <Can
                I="manage"
                this={subject('ProjectHomepage', {
                    organizationUuid,
                    projectUuid,
                })}
            >
                {showOpeningChoice && (
                    <OpeningChoiceMenu projectUuid={projectUuid} />
                )}
                {showNewHomepage && (
                    <button
                        type="button"
                        className={classes.tbBtn}
                        aria-label="New homepage"
                        onClick={() =>
                            navigate(
                                `/projects/${projectUuid}/homepage-builder?create=1`,
                            )
                        }
                    >
                        <MantineIcon icon={IconPlus} size={15} />
                        <span className={classes.tbBtnLabel} aria-hidden="true">
                            New homepage
                        </span>
                    </button>
                )}
                <button
                    type="button"
                    className={classes.tbBtn}
                    aria-label="Customize homepage"
                    onClick={() =>
                        navigate(`/projects/${projectUuid}/homepage-builder`)
                    }
                >
                    <MantineIcon icon={IconEdit} size={15} />
                    <span className={classes.tbBtnLabel} aria-hidden="true">
                        Customize homepage
                    </span>
                </button>
            </Can>
        </div>
    );
};
