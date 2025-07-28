import * as React from 'react';
import Typography from '@mui/material/Typography';
import { PageContainer } from '@toolpad/core/PageContainer';
import Link from 'next/link';

export default function HomePage() {
  

  return (    
    <PageContainer>
      <Typography>
        Welcome to <Link href="https://mui.com/toolpad/core/introduction">Toolpad Core!</Link>
      </Typography>
    </PageContainer>
  );
}
