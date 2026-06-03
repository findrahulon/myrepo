import React from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  Container,
} from '@mui/material';
import { Login, AutoAwesome } from '@mui/icons-material';
import keycloak from '../services/keycloak';

const LoginPage: React.FC = () => {
  const handleLogin = () => {
    keycloak.login();
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        background: 'linear-gradient(135deg, #0a0e17 0%, #1a1f36 50%, #0a0e17 100%)',
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={8}
          sx={{
            p: 5,
            textAlign: 'center',
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <AutoAwesome sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />

          <Typography variant="h4" sx={{ mb: 1, fontWeight: 700 }}>
            RAGnarok
          </Typography>
          <Typography variant="subtitle1" sx={{ mb: 3, color: 'text.secondary' }}>
            Enterprise Knowledge Copilot
          </Typography>

          <Typography variant="body2" sx={{ mb: 4, color: 'text.secondary', maxWidth: 360, mx: 'auto' }}>
            Trusted, explainable, and auditable answers from your enterprise documents.
            Powered by RAG with inline citations and confidence scoring.
          </Typography>

          <Button
            variant="contained"
            size="large"
            startIcon={<Login />}
            onClick={handleLogin}
            sx={{
              px: 4,
              py: 1.5,
              fontSize: '1rem',
              background: 'linear-gradient(45deg, #7c4dff, #00e5ff)',
            }}
          >
            Sign in with Keycloak
          </Button>

          <Typography variant="caption" sx={{ mt: 3, display: 'block', color: 'text.disabled' }}>
            Demo credentials: admin / admin123 or user / user123
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
};

export default LoginPage;
