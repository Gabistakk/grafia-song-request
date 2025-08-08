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
          position: 'relative',
          // Stars layer as a rotated overlay behind content (darker via internal gradient)
          '&::before': {
            content: '""',
            position: 'fixed',
            inset: 0,
            backgroundImage: `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${BG_PATTERN})`,
            backgroundRepeat: 'no-repeat, repeat',
            backgroundPosition: '0 0, left -10vw top -10vh',
            backgroundSize: 'auto, 220px 220px',
            opacity: 1,
            filter: 'none',
            transform: 'rotate(-1.5deg) scale(1.04)',
            transformOrigin: '50% 50%',
            pointerEvents: 'none',
            zIndex: 0,
          },
          // Watermark above the stars (not dimmed)
          '&::after': {
            content: '""',
            position: 'fixed',
            inset: 0,
            backgroundImage: `url(${BG_WATERMARK})`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center center',
            backgroundSize: 'min(48vw, 680px) auto',
            pointerEvents: 'none',
            zIndex: 1,
          },
        },
        '#root': {
          position: 'relative',
          zIndex: 2,
        },
        // Hide scrollbars globally but keep scrolling functional
        'html, body, #root': {
          msOverflowStyle: 'none', // IE/Edge
          scrollbarWidth: 'none', // Firefox
        },
        '*': {
          scrollbarWidth: 'none', // Firefox
        },
        '*::-webkit-scrollbar': {
          width: 0,
          height: 0,
        },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: 'transparent',
          border: 'none',
        },
        // Keyframes globais para animações
        '@keyframes dialogPop': {
          '0%': { transform: 'scale(0.98)', opacity: 0 },
          '100%': { transform: 'scale(1)', opacity: 1 },
        },
        '@keyframes fadeIn': {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        '@media (max-width:900px)': {
          body: {
            '&::before': {
              backgroundPosition: 'left -15vw top -15vh',
              backgroundSize: '180px 180px',
              filter: 'none',
              transform: 'rotate(-1deg) scale(1.03)',
            },
            '&::after': {
              backgroundSize: '70vw auto',
            }
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          animation: 'dialogPop .24s cubic-bezier(0.2, 0.8, 0.2, 1)',
          transition: 'box-shadow .2s ease, border-color .2s ease',
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
          transition: 'background-color .2s ease, border-color .2s ease, box-shadow .2s ease',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          transition: 'transform .15s ease, box-shadow .2s ease, background-color .2s ease, border-color .2s ease',
          '&:hover': { transform: 'translateY(-1px)' },
          '&.Mui-focusVisible': { boxShadow: '0 0 0 3px rgba(75, 19, 128, 0.35)' },
        },
        containedPrimary: { boxShadow: '0 0 8px rgba(75, 19, 128, 0.6)' },
        outlinedPrimary: {
          borderColor: 'rgba(75, 19, 128, 0.6)',
          '&:hover': { borderColor: '#4b1380', backgroundColor: 'rgba(75,19,128,0.08)' },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: 'transform .15s ease, background-color .2s ease',
          '&:hover': { transform: 'translateY(-1px)' },
          '&.Mui-focusVisible': { boxShadow: '0 0 0 3px rgba(75, 19, 128, 0.35)' },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          transition: 'transform .15s ease, background-color .2s ease',
          '&:hover': { transform: 'translateX(2px)', backgroundColor: 'rgba(255,255,255,0.04)' },
          '&.Mui-focusVisible': { boxShadow: '0 0 0 3px rgba(75, 19, 128, 0.35)' },
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

