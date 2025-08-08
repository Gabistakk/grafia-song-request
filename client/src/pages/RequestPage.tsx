import React, { useEffect, useMemo, useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  TextField,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemAvatar,
  Avatar,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Paper,
  Snackbar,
  Alert,
  CircularProgress,
  Skeleton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
// import ClearIcon from '@mui/icons-material/ClearAll';
import axios from 'axios';
import { getSocket } from '../lib/realtime';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
import LOGO_URL from '../images/TYPE_GRAFIA_BAR_ALPHA.png';
import ICON_CUTOUT from '../images/ICON_CUTOUT.png';

type Track = {
  id: string;
  title: string;
  artist: string;
  albumArt: string | null;
  spotifyUri: string;
};

type QueueItem = Track & {
  requestedBy: string;
  addedAt: number;
};

export default function RequestPage(): JSX.Element {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selected, setSelected] = useState<Track | null>(null);
  const [name, setName] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [nowPlaying, setNowPlaying] = useState<QueueItem | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [snackOpen, setSnackOpen] = useState(false);
  const [snackMsg, setSnackMsg] = useState('');
  const [snackSeverity, setSnackSeverity] = useState<'success' | 'error' | 'info'>('info');
  const [queueLoading, setQueueLoading] = useState(true);

  useEffect(() => {
    // Persist requester name for convenience
    const saved = localStorage.getItem('grafia_requester_name');
    if (saved) setName(saved);
  }, []);

  useEffect(() => {
    if (name) localStorage.setItem('grafia_requester_name', name);
  }, [name]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      setError(null);
      axios
        .get(`${API_BASE}/api/search`, { params: { q: query } })
        .then((res) => setResults(res.data.items || []))
        .catch((e) => setError(e?.response?.data?.error || 'Erro na busca'))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    axios.get(`${API_BASE}/api/queue`).then((res) => {
      setQueue(res.data.queue || []);
      setNowPlaying(res.data.nowPlaying || null);
    }).finally(() => setQueueLoading(false));
    const socket = getSocket();
    socket.on('queue:update', ({ nowPlaying, queue }) => {
      setQueue(queue || []);
      setNowPlaying(nowPlaying || null);
    });
    return () => {
      socket.off('queue:update');
    };
  }, []);

  const openConfirm = (track: Track) => {
    setSelected(track);
    setConfirmOpen(true);
  };

  const addToQueue = async () => {
    if (!selected || !name.trim()) return;
    try {
      setIsAdding(true);
      await axios.post(`${API_BASE}/api/queue`, {
        track: selected,
        requestedBy: name.trim(),
      });
      setConfirmOpen(false);
      setName(''); // limpa o nome de quem pediu
      try { localStorage.removeItem('grafia_requester_name'); } catch {}
      setQuery(''); // limpa a busca
      setResults([]);
      setSelected(null);
      setSnackSeverity('success');
      setSnackMsg('Música adicionada à fila!');
      setSnackOpen(true);
    } catch (e: any) {
      const msg = e?.response?.status === 409
        ? 'Esta música já está na fila ou tocando.'
        : (e?.response?.data?.error || 'Falha ao adicionar');
      setSnackSeverity('error');
      setSnackMsg(msg);
      setSnackOpen(true);
    }
    finally {
      setIsAdding(false);
    }
  };

  // Tela principal não possui mais ações administrativas

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static">
        <Toolbar>
          <Box component="img" src={LOGO_URL} alt="Grafia Bar" sx={{ height: { xs: 24, sm: 28 }, mr: 1, borderRadius: 0.5, filter: 'drop-shadow(0 0 8px rgba(75,19,128,0.4))' }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Grafia Bar - Pedidos de Música
          </Typography>
        </Toolbar>
      </AppBar>

      <Container sx={{ py: 2, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          fullWidth
          autoFocus
          placeholder="Buscar música ou artista"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                {loading ? <CircularProgress size={20} /> : null}
              </InputAdornment>
            ),
          }}
        />
        <Paper variant="outlined" sx={{ flex: 1, overflow: 'auto', backdropFilter: 'blur(2px)', backgroundColor: 'rgba(31,9,52,0.85)' }}>
          {loading && <Typography sx={{ p: 2 }}>Buscando…</Typography>}
          {error && (
            <Typography color="error" sx={{ p: 2 }}>{error}</Typography>
          )}
          {!loading && !error && query && results.length === 0 && (
            <Typography sx={{ p: 2 }}>Nenhum resultado para "{query}"</Typography>
          )}
          <List>
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <ListItem key={`sk-${i}`}>
                <ListItemAvatar>
                  <Skeleton variant="rounded" width={64} height={64} sx={{ mr: 1 }} />
                </ListItemAvatar>
                <Box sx={{ flex: 1 }}>
                  <Skeleton width="60%" />
                  <Skeleton width="40%" />
                </Box>
              </ListItem>
            ))}
            {!loading && results.map((t) => (
              <ListItem key={t.id} disablePadding>
                <ListItemButton onClick={() => openConfirm(t)} sx={{ py: 1 }}>
                  <ListItemAvatar>
                    <Avatar
                      src={t.albumArt || undefined}
                      variant="rounded"
                      sx={{ width: 64, height: 64, mr: 1, border: '1px solid rgba(220,220,220,0.1)' }}
                    />
                  </ListItemAvatar>
                  <ListItemText
                    primaryTypographyProps={{
                      variant: 'subtitle1',
                      sx: { color: 'text.primary', fontWeight: 600, lineHeight: 1.2 },
                    }}
                    secondaryTypographyProps={{
                      variant: 'body2',
                      sx: { color: 'text.secondary' },
                    }}
                    primary={t.title}
                    secondary={t.artist}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Paper>

        <Paper variant="outlined" sx={{ maxHeight: 220, overflow: 'auto', backdropFilter: 'blur(2px)', backgroundColor: 'rgba(31,9,52,0.85)' }}>
          <Typography variant="subtitle1" sx={{ p: 1 }}>
            Fila
          </Typography>
          <List>
            {queueLoading && (
              <ListItem>
                <ListItemAvatar>
                  <Skeleton variant="rounded" width={56} height={56} sx={{ mr: 1 }} />
                </ListItemAvatar>
                <Box sx={{ flex: 1 }}>
                  <Skeleton width="70%" />
                  <Skeleton width="40%" />
                </Box>
              </ListItem>
            )}
            {!queueLoading && nowPlaying && (
              <ListItem>
                <ListItemAvatar>
                  <Avatar src={nowPlaying.albumArt || undefined} variant="rounded" sx={{ width: 56, height: 56, mr: 1 }} />
                </ListItemAvatar>
                <ListItemText
                  primaryTypographyProps={{ variant: 'subtitle1', sx: { fontWeight: 700 } }}
                  secondaryTypographyProps={{ variant: 'body2' }}
                  primary={`Tocando agora: ${nowPlaying.title}`}
                  secondary={`${nowPlaying.artist} • Pedido por: ${nowPlaying.requestedBy}`}
                />
              </ListItem>
            )}
            {queueLoading && Array.from({ length: 3 }).map((_, i) => (
              <ListItem key={`qsk-${i}`}>
                <ListItemAvatar>
                  <Skeleton variant="rounded" width={48} height={48} sx={{ mr: 1 }} />
                </ListItemAvatar>
                <Box sx={{ flex: 1 }}>
                  <Skeleton width="60%" />
                  <Skeleton width="30%" />
                </Box>
              </ListItem>
            ))}
            {!queueLoading && queue.map((q) => (
              <ListItem key={`${q.id}-${q.requestedBy}-${q.addedAt}`}>
                <ListItemAvatar>
                  <Avatar src={q.albumArt || undefined} variant="rounded" sx={{ width: 48, height: 48, mr: 1 }} />
                </ListItemAvatar>
                <ListItemText
                  primaryTypographyProps={{ variant: 'body1', sx: { fontWeight: 600 } }}
                  secondaryTypographyProps={{ variant: 'body2' }}
                  primary={q.title}
                  secondary={`${q.artist} • Pedido por: ${q.requestedBy}`}
                />
              </ListItem>
            ))}
            {!queueLoading && !nowPlaying && queue.length === 0 && (
              <Typography sx={{ p: 2, color: 'text.secondary' }}>Fila vazia no momento.</Typography>
            )}
          </List>
        </Paper>
      </Container>

       <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: '#1f0934',
            color: '#dcdcdc',
             border: '1px solid rgba(75, 19, 128, 0.35)',
             backgroundImage: `radial-gradient(circle at 8% 0%, rgba(75,19,128,0.25), transparent 40%), radial-gradient(circle at 92% 100%, rgba(75,19,128,0.25), transparent 40%)`,
          }
        }}
      >
        <DialogTitle sx={{ color: '#dcdcdc', fontWeight: 700 }}>Quem está pedindo?</DialogTitle>
        <DialogContent>
          <TextField
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome"
            fullWidth
            autoFocus
            helperText="Seu nome aparecerá no display."
            variant="outlined"
            FormHelperTextProps={{ sx: { color: '#9e9e9e' } }}
            sx={{
              mt: 1,
              '& .MuiInputBase-root': {
                bgcolor: '#000000',
                color: '#dcdcdc',
                borderRadius: 1,
              },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#5e5e5e' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#9e9e9e' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#4b1380' },
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} sx={{ color: '#dcdcdc' }}>Cancelar</Button>
          <Button onClick={addToQueue} variant="contained" color="primary" disabled={!name.trim() || isAdding}>
            Confirmar
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackOpen} autoHideDuration={2500} onClose={() => setSnackOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnackOpen(false)} severity={snackSeverity} sx={{ width: '100%' }}>
          {snackMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

