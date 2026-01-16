import React from 'react';
import { Box, Typography, Link } from '@mui/material';
import { GitHub } from '@mui/icons-material';

interface FooterProps {
  version?: string;
}

export const Footer: React.FC<FooterProps> = ({ version }) => {
  return (
    <Box
      component="footer"
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        py: 1.5,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 2,
        backgroundColor: 'background.paper',
        zIndex: 1000,
      }}
    >
      <Link
        href="https://github.com/respawnlife/respawn-stocks-listen"
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          color: 'text.secondary',
          textDecoration: 'none',
          '&:hover': {
            color: 'primary.main',
          },
        }}
      >
        <GitHub fontSize="small" />
        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
          GitHub
        </Typography>
      </Link>
      {version && (
        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
          版本: {version}
        </Typography>
      )}
    </Box>
  );
};
