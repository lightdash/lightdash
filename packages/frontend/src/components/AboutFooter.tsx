import React, { useState } from 'react';
import {
    AnchorButton,
    Callout,
    Classes,
    Dialog,
    H5,
    H6,
    Intent,
    Tag,
} from '@blueprintjs/core';
import { useApp } from '../providers/AppProvider';

const AboutFooter = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { health: healthState } = useApp();
    const hasUpdate =
        healthState.data?.latest.version &&
        healthState.data.version !== healthState.data.latest.version;

    return (
        <>
            <footer
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    margin: '0 auto',
                    marginTop: '20px',
                    width: '100%',
                }}
            >
                <div
                    role="button"
                    tabIndex={0}
                    style={{
                        display: 'inline-flex',
                        gap: '10px',
                        alignItems: 'center',
                        flex: 1,
                        cursor: 'pointer',
                    }}
                    onClick={() => setIsOpen(true)}
                >
                    <img
                        src={`${process.env.PUBLIC_URL}/favicon-16x16.png`}
                        alt="Lightdash"
                    />
                    <H6 style={{ margin: 0, whiteSpace: 'nowrap' }}>
                        Lightdash
                        {healthState.data && ` - v${healthState.data.version}`}
                    </H6>
                    {hasUpdate && (
                        <Tag minimal intent={Intent.PRIMARY}>
                            New version available!
                        </Tag>
                    )}
                </div>
                <AnchorButton
                    href="https://docs.lightdash.com/"
                    target="_blank"
                    minimal
                    icon="lifesaver"
                >
                    Help
                </AnchorButton>
            </footer>
            <Dialog
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                icon="info-sign"
                title="About Lightdash"
            >
                <div className={Classes.DIALOG_BODY}>
                    <H5>
                        <b>Version:</b>{' '}
                        {healthState.data
                            ? `v${healthState.data.version}`
                            : 'n/a'}
                    </H5>
                    {hasUpdate && (
                        <Callout
                            title="New version available!"
                            intent={Intent.PRIMARY}
                        >
                            The version v{healthState.data?.latest.version} is
                            now available. Please follow the instructions in the{' '}
                            <a
                                href="https://docs.lightdash.com/guides/how-to-update-docker-image"
                                target="_blank"
                                rel="noreferrer"
                            >
                                How to update version
                            </a>{' '}
                            documentation.
                        </Callout>
                    )}
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <AnchorButton
                            href="https://docs.lightdash.com/"
                            target="_blank"
                            outlined
                            rightIcon="share"
                        >
                            Docs
                        </AnchorButton>
                        <AnchorButton
                            href="https://github.com/lightdash/lightdash"
                            target="_blank"
                            outlined
                            rightIcon="share"
                        >
                            Github
                        </AnchorButton>
                    </div>
                </div>
            </Dialog>
        </>
    );
};

export default AboutFooter;
