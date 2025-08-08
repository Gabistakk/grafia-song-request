import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import RequestPage from './pages/RequestPage';
import DisplayPage from './pages/DisplayPage';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#4b1380' }, // roxo neon
    secondary: { main: '#9e9e9e' },
    background: { default: '#000000', paper: '#1f0934' },
    text: { primary: '#dcdcdc', secondary: '#9e9e9e' },
    divider: '#5e5e5e',
  },
  shape: { borderRadius: 10 },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#000000',
          borderBottom: '1px solid rgba(75, 19, 128, 0.4)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: '#1f0934',
          border: '1px solid rgba(75, 19, 128, 0.35)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        containedPrimary: {
          boxShadow: '0 0 8px rgba(75, 19, 128, 0.6)',
        },
      },
    },
  },
});

const router = createBrowserRouter([
  { path: '/', element: <RequestPage /> },
  { path: '/display', element: <DisplayPage /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>
);

