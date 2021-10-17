import React, { ReactNode } from 'react';

type WrapProps = {
    wrap: (children?: ReactNode) => JSX.Element;
    children: ReactNode;
};

const Wrap = ({ wrap, children }: WrapProps) => wrap(children);

export default Wrap;
