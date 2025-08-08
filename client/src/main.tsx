import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import RequestPage from './pages/RequestPage';
import DisplayPage from './pages/DisplayPage';
import BG_PATTERN from './images/STAR.png';
import BG_WATERMARK from './images/TYPE_GRAFIA_BAR_ALPHA_W.png';

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
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#000000',
          backgroundImage: `linear-gradient(rgba(0,0,0,0.72), rgba(0,0,0,0.72)), url(${BG_PATTERN}), url(${BG_WATERMARK})`,
          backgroundRepeat: 'no-repeat, repeat, no-repeat',
          backgroundPosition: '0 0, center center, right -4vw bottom -4vh',
          backgroundSize: 'auto, 320px 320px, min(42vw, 560px) auto',
          backgroundAttachment: 'fixed, fixed, fixed',
        },
        '@media (max-width:900px)': {
          body: {
            backgroundImage: `linear-gradient(rgba(0,0,0,0.76), rgba(0,0,0,0.76)), url(${BG_PATTERN})`,
            backgroundRepeat: 'no-repeat, repeat',
            backgroundPosition: '0 0, center center',
            backgroundSize: 'auto, 260px 260px',
          },
        },
      },
    },
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

