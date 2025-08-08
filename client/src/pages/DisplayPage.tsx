import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { AppBar, Toolbar, Typography, Container, List, ListItem, ListItemAvatar, Avatar, ListItemText, Paper, Box, Button, Stack, IconButton, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, Snackbar, Alert, Skeleton } from '@mui/material';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
import LOGO_URL from '../images/grafia-logo.png';

type QueueItem = {
  id: string;
  title: string;
  artist: string;
  albumArt: string | null;
  spotifyUri: string;
  requestedBy: string;
  addedAt: number;
};
type AuthStatus = { authorized: boolean; playlistId?: string; userId?: string; playlistName?: string };
type Device = { id: string; name: string; is_active?: boolean };

export default function DisplayPage(): JSX.Element {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [nowPlaying, setNowPlaying] = useState<QueueItem | null>(null);
  const [auth, setAuth] = useState<AuthStatus>({ authorized: false });
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [snackOpen, setSnackOpen] = useState(false);
  const [snackMsg, setSnackMsg] = useState('');
  const [snackSeverity, setSnackSeverity] = useState<'success' | 'error' | 'info'>('info');
  const [loadingQueue, setLoadingQueue] = useState(true);

  useEffect(() => {
    axios.get(`${API_BASE}/api/queue`).then((res) => {
      setQueue(res.data.queue || []);
      setNowPlaying(res.data.nowPlaying || null);
    }).finally(() => setLoadingQueue(false));
    const fetchAuth = async () => {
      try { const { data } = await axios.get(`${API_BASE}/auth/status`); setAuth(data); } catch {}
    };
    fetchAuth();
    const authTimer = setInterval(fetchAuth, 5000);
    const socket: Socket = io(API_BASE, { transports: ['websocket'] });
    socket.on('queue:update', ({ nowPlaying, queue }) => {
      setQueue(queue || []);
      setNowPlaying(nowPlaying || null);
    });
    return () => {
      socket.disconnect();
      clearInterval(authTimer);
    };
  }, []);

  const next = async () => {
    await axios.post(`${API_BASE}/api/next`);
  };

  const call = async (fn: () => Promise<any>, successMsg?: string) => {
    try { await fn(); if (successMsg) { setSnackSeverity('success'); setSnackMsg(successMsg); setSnackOpen(true); } }
    catch (e: any) { setSnackSeverity('error'); setSnackMsg(e?.response?.data?.error || 'Ação falhou'); setSnackOpen(true); }
  };
  const play = async () => call(() => axios.post(`${API_BASE}/api/player/play`), 'Tocar');
  const pause = async () => call(() => axios.post(`${API_BASE}/api/player/pause`), 'Pausar');
  const nextSpotify = async () => call(() => axios.post(`${API_BASE}/api/player/next`), 'Próxima');
  const prevSpotify = async () => call(() => axios.post(`${API_BASE}/api/player/previous`), 'Anterior');
  const startPlaylist = async () => call(() => axios.post(`${API_BASE}/api/player/play-playlist`), 'Playlist iniciada');
  const removeFromQueue = async (item: QueueItem) => call(() => axios.post(`${API_BASE}/api/queue/remove`, { id: item.id, spotifyUri: item.spotifyUri }), 'Removido');
  const playNow = async (item: QueueItem) => call(() => axios.post(`${API_BASE}/api/player/play-track`, { spotifyUri: item.spotifyUri }), 'Tocando agora');
  const clearQueue = async () => call(() => axios.post(`${API_BASE}/api/queue/clear`), 'Fila limpa');
  const clearPlaylist = async () => call(() => axios.post(`${API_BASE}/api/playlist/clear`), 'Playlist limpa');
  const forceSync = async () => call(() => axios.post(`${API_BASE}/api/sync`), 'Sincronizado');
  const loginSpotify = () => { window.open(`${API_BASE}/auth/login`, '_blank'); };
  const openPlaylist = () => { if (auth.playlistId) window.open(`https://open.spotify.com/playlist/${auth.playlistId}`, '_blank'); };
  const refreshDevices = async () => {
    try { const { data } = await axios.get(`${API_BASE}/api/player/devices`); setDevices(data.devices || []); setDevicesOpen(true); } catch {}
  };
  const transferTo = async (deviceId: string) => {
    await axios.post(`${API_BASE}/api/player/transfer`, { deviceId, play: true });
    setDevicesOpen(false);
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static">
        <Toolbar>
          <Box component="img" src={LOGO_URL} alt="Grafia Bar" sx={{ height: 28, mr: 1, borderRadius: 0.5 }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Grafia Bar - Display
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip label={auth.authorized ? `Conectado ${auth.playlistName ? `(${auth.playlistName})` : ''}` : 'Desconectado'} color={auth.authorized ? 'success' : 'default'} />
            {!auth.authorized && (
              <Button color="inherit" onClick={loginSpotify}>Login com Spotify</Button>
            )}
            {auth.authorized && auth.playlistId && (
              <Button color="inherit" onClick={openPlaylist}>Abrir playlist</Button>
            )}
            {auth.authorized && (
              <Button color="inherit" onClick={refreshDevices}>Selecionar dispositivo</Button>
            )}
            <Tooltip title="Iniciar reprodução da playlist vinculada"><Button color="inherit" onClick={startPlaylist}>Iniciar playlist</Button></Tooltip>
            <Tooltip title="Tocar faixa anterior"><span><IconButton color="inherit" onClick={prevSpotify}><SkipPreviousIcon /></IconButton></span></Tooltip>
            <Tooltip title="Tocar"><span><IconButton color="inherit" onClick={play}><PlayArrowIcon /></IconButton></span></Tooltip>
            <Tooltip title="Pausar"><span><IconButton color="inherit" onClick={pause}><PauseIcon /></IconButton></span></Tooltip>
            <Tooltip title="Próxima faixa (Spotify)"><span><IconButton color="inherit" onClick={nextSpotify}><SkipNextIcon /></IconButton></span></Tooltip>
            <Tooltip title="Promover a próxima da fila para tocar agora"><Button color="inherit" onClick={next}>Promover próxima (fila)</Button></Tooltip>
            <Tooltip title="Esvaziar a fila local"><Button color="inherit" onClick={clearQueue}>Limpar fila</Button></Tooltip>
            <Tooltip title="Remover todas as músicas da playlist vinculada"><Button color="inherit" onClick={clearPlaylist}>Limpar playlist</Button></Tooltip>
            <Tooltip title="Forçar sincronização com a playlist"><Button color="inherit" onClick={forceSync}>Sync</Button></Tooltip>
          </Stack>
        </Toolbar>
      </AppBar>
      <Container sx={{ py: 2, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h5" gutterBottom>
            Tocando agora
          </Typography>
          {loadingQueue ? (
            <List>
              <ListItem>
                <ListItemAvatar>
                  <Skeleton variant="rounded" width={84} height={84} sx={{ mr: 1 }} />
                </ListItemAvatar>
                <Box sx={{ flex: 1 }}>
                  <Skeleton width="50%" />
                  <Skeleton width="30%" />
                </Box>
              </ListItem>
            </List>
          ) : nowPlaying ? (
            <List>
              <ListItem sx={{ alignItems: 'center' }}>
                <ListItemAvatar>
                  <Avatar src={nowPlaying.albumArt || undefined} variant="rounded" sx={{ width: 84, height: 84, mr: 1, border: '1px solid rgba(220,220,220,0.1)' }} />
                </ListItemAvatar>
                <ListItemText
                  primaryTypographyProps={{ variant: 'h5', sx: { fontWeight: 700 } }}
                  secondaryTypographyProps={{ variant: 'body1' }}
                  primary={nowPlaying.title}
                  secondary={`${nowPlaying.artist} • Pedido por: ${nowPlaying.requestedBy}`}
                />
              </ListItem>
            </List>
          ) : (
            <Typography>Nenhuma música tocando.</Typography>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, flex: 1, overflow: 'auto' }}>
          <Typography variant="h5" gutterBottom>
            Próximas
          </Typography>
          <List>
            {loadingQueue && Array.from({ length: 6 }).map((_, i) => (
              <ListItem key={`skq-${i}`}>
                <ListItemAvatar>
                  <Skeleton variant="rounded" width={56} height={56} sx={{ mr: 1 }} />
                </ListItemAvatar>
                <Box sx={{ flex: 1 }}>
                  <Skeleton width="60%" />
                  <Skeleton width="30%" />
                </Box>
              </ListItem>
            ))}
            {!loadingQueue && (
              <DragDropContext
                onDragEnd={async (result: DropResult) => {
                  const { source, destination } = result;
                  if (!destination) return;
                  if (destination.index === source.index) return;
                  const items = Array.from(queue);
                  const [moved] = items.splice(source.index, 1);
                  items.splice(destination.index, 0, moved);
                  setQueue(items);
                  try {
                    await axios.post(`${API_BASE}/api/queue/reorder`, { uris: items.map((i) => i.spotifyUri) });
                  } catch (e) {
                    // revert on error
                    setQueue(queue);
                  }
                }}
              >
                <Droppable droppableId="queue-droppable">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}>
                      {queue.map((q, index) => (
                        <Draggable key={`${q.id}-${q.requestedBy}-${q.addedAt}`} draggableId={`${q.id}-${q.addedAt}`} index={index}>
                          {(dragProvided) => (
                            <ListItem
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              secondaryAction={
                                <Stack direction="row" spacing={1}>
                                  <IconButton edge="end" aria-label="tocar agora" onClick={() => playNow(q)}>
                                    <PlayCircleOutlineIcon />
                                  </IconButton>
                                  <IconButton edge="end" aria-label="remover" onClick={() => removeFromQueue(q)}>
                                    <DeleteIcon />
                                  </IconButton>
                                </Stack>
                              }
                            >
                              <ListItemAvatar>
                                <Avatar src={q.albumArt || undefined} variant="rounded" sx={{ width: 56, height: 56, mr: 1 }} />
                              </ListItemAvatar>
                              <ListItemText
                                primaryTypographyProps={{ variant: 'subtitle1', sx: { fontWeight: 600 } }}
                                secondaryTypographyProps={{ variant: 'body2' }}
                                primary={q.title}
                                secondary={`${q.artist} • Pedido por: ${q.requestedBy}`}
                              />
                            </ListItem>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </List>
        </Paper>
      </Container>
      <Dialog
        open={devicesOpen}
        onClose={() => setDevicesOpen(false)}
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: '#1f0934',
            color: '#dcdcdc',
            border: '1px solid rgba(75, 19, 128, 0.35)'
          }
        }}
      >
        <DialogTitle sx={{ color: '#dcdcdc', fontWeight: 700 }}>Selecionar dispositivo</DialogTitle>
        <DialogContent>
          <List>
            {devices.map((d) => (
              <ListItem key={d.id} disablePadding>
                <Button
                  fullWidth
                  variant={d.is_active ? 'contained' : 'outlined'}
                  onClick={() => transferTo(d.id)}
                  sx={{ justifyContent: 'flex-start', borderColor: '#4b1380', color: d.is_active ? undefined : '#dcdcdc', bgcolor: d.is_active ? '#4b1380' : 'transparent' }}
                >
                  {d.name} {d.is_active ? '(ativo)' : ''}
                </Button>
              </ListItem>
            ))}
            {devices.length === 0 && <Typography>Nenhum dispositivo encontrado (abra o app do Spotify em algum dispositivo).</Typography>}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDevicesOpen(false)}>Fechar</Button>
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

