import React, { useState, useEffect } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  Divider,
  Button,
  Avatar,
  Chip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Logout,
  AutoAwesome,
  FolderOpen,
} from '@mui/icons-material';
import theme from './theme/theme';
import keycloak from './services/keycloak';
import LoginPage from './components/LoginPage';
import ChatInterface from './components/ChatInterface';
import DocumentUpload from './components/DocumentUpload';
import DocumentList from './components/DocumentList';

const DRAWER_WIDTH = 320;

const App: React.FC = () => {
  const [authenticated, setAuthenticated] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [refreshDocs, setRefreshDocs] = useState(0);

  useEffect(() => {
    keycloak
      .init({ onLoad: 'check-sso', silentCheckSsoRedirectUri: undefined })
      .then((auth) => {
        setAuthenticated(auth);
        setInitialized(true);
      })
      .catch(() => {
        setInitialized(true);
      });
  }, []);

  if (!initialized) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', bgcolor: 'background.default' }}>
          <Typography variant="h6" sx={{ color: 'text.secondary' }}>
            Initializing RAGnarok...
          </Typography>
        </Box>
      </ThemeProvider>
    );
  }

  if (!authenticated) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LoginPage />
      </ThemeProvider>
    );
  }

  const username = keycloak.tokenParsed?.preferred_username || 'User';
  const roles = keycloak.tokenParsed?.realm_access?.roles || [];
  const isAdmin = roles.includes('admin');

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', height: '100vh' }}>
        {/* App Bar */}
        <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Toolbar>
            <IconButton edge="start" onClick={() => setDrawerOpen(!drawerOpen)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
            <AutoAwesome sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
              RAGnarok
            </Typography>
            <Chip
              label={isAdmin ? 'Admin' : 'User'}
              size="small"
              color={isAdmin ? 'primary' : 'default'}
              sx={{ mr: 1 }}
            />
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', mr: 1, fontSize: 14 }}>
              {username[0].toUpperCase()}
            </Avatar>
            <Typography variant="body2" sx={{ mr: 2 }}>
              {username}
            </Typography>
            <IconButton onClick={() => keycloak.logout()} size="small" title="Logout">
              <Logout />
            </IconButton>
          </Toolbar>
        </AppBar>

        {/* Side Drawer */}
        <Drawer
          variant="persistent"
          open={drawerOpen}
          sx={{
            width: drawerOpen ? DRAWER_WIDTH : 0,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              bgcolor: 'background.paper',
              borderRight: '1px solid',
              borderColor: 'divider',
            },
          }}
        >
          <Toolbar />
          <Box sx={{ p: 2, overflow: 'auto' }}>
            <DocumentUpload onUploadComplete={() => setRefreshDocs((n) => n + 1)} />

            <Divider sx={{ my: 2 }} />

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <FolderOpen fontSize="small" color="primary" />
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Documents
              </Typography>
            </Box>
            <DocumentList refreshTrigger={refreshDocs} />
          </Box>
        </Drawer>

        {/* Main Chat Area */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            overflow: 'hidden',
          }}
        >
          <Toolbar />
          <ChatInterface />
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default App;
