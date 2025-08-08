import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import axios from 'axios';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';

const PORT = process.env.PORT || 4000;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:4000/auth/callback';
const PLAYLIST_NAME = process.env.PLAYLIST_NAME || 'Grafia Bar Queue';
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const ORIGINS_FROM_ENV = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = ORIGINS_FROM_ENV.length > 0 ? ORIGINS_FROM_ENV : [ALLOWED_ORIGIN];

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.warn('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in environment. Spotify search will be disabled.');
}

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS not allowed for origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// In-memory queue state
let queue = [];
let nowPlaying = null; // { id, title, artist, albumArt, requestedBy, spotifyUri }

// Rate limit per requester name
const REQUEST_LIMIT = Number(process.env.REQUEST_LIMIT || 3);
const REQUEST_WINDOW_MINUTES = Number(process.env.REQUEST_WINDOW_MINUTES || 30);
// Map requesterName -> [timestamps]
const requesterHistory = new Map();

function pruneRequesterHistory(name) {
  const windowStart = Date.now() - REQUEST_WINDOW_MINUTES * 60 * 1000;
  const arr = requesterHistory.get(name) || [];
  const pruned = arr.filter((t) => t >= windowStart);
  requesterHistory.set(name, pruned);
  return pruned;
}

function recordRequest(name) {
  const arr = pruneRequesterHistory(name);
  arr.push(Date.now());
  requesterHistory.set(name, arr);
}

function canRequest(name) {
  const arr = pruneRequesterHistory(name);
  return arr.length < REQUEST_LIMIT;
}

// Spotify client credentials token cache
let spotifyToken = null;
let spotifyTokenExpiresAt = 0;

async function getSpotifyAccessToken() {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) return null;
  const now = Date.now();
  if (spotifyToken && now < spotifyTokenExpiresAt - 60_000) {
    return spotifyToken;
  }
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const resp = await axios.post('https://accounts.spotify.com/api/token', params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${auth}`,
    },
  });
  spotifyToken = resp.data.access_token;
  spotifyTokenExpiresAt = Date.now() + (resp.data.expires_in * 1000);
  return spotifyToken;
}

// User OAuth tokens for playlist management
let userAuth = {
  accessToken: null,
  refreshToken: null,
  expiresAt: 0,
  userId: null,
  playlistId: null,
};

async function getUserAccessToken() {
  const now = Date.now();
  // Use current access token if still valid
  if (userAuth.accessToken && now < userAuth.expiresAt - 60_000) {
    return userAuth.accessToken;
  }
  // Try refresh if we have a refresh token
  if (userAuth.refreshToken) {
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', userAuth.refreshToken);
    const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const resp = await axios.post('https://accounts.spotify.com/api/token', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
      },
    });
    userAuth.accessToken = resp.data.access_token;
    userAuth.expiresAt = Date.now() + (resp.data.expires_in * 1000);
    return userAuth.accessToken;
  }
  // No refresh token available; only return access token if present and not expired (handled above)
  return null;
}

async function fetchCurrentUserProfile() {
  const token = await getUserAccessToken();
  if (!token) return null;
  const { data } = await axios.get('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data; // contains id
}

async function ensurePlaylist() {
  const token = await getUserAccessToken();
  if (!token) return null;
  if (userAuth.playlistId) return userAuth.playlistId;
  const me = await fetchCurrentUserProfile();
  if (!me) return null;
  userAuth.userId = me.id;

  // Try to find by name (first page only for simplicity)
  const { data } = await axios.get('https://api.spotify.com/v1/me/playlists', {
    headers: { Authorization: `Bearer ${token}` },
    params: { limit: 50 },
  });
  const existing = (data.items || []).find((p) => p.name === PLAYLIST_NAME);
  if (existing) {
    userAuth.playlistId = existing.id;
    return userAuth.playlistId;
  }
  // Create
  const createResp = await axios.post(`https://api.spotify.com/v1/users/${me.id}/playlists`,
    { name: PLAYLIST_NAME, description: 'Fila de músicas - Grafia Bar', public: false },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  userAuth.playlistId = createResp.data.id;
  return userAuth.playlistId;
}

async function addTrackToPlaylist(spotifyUri) {
  const token = await getUserAccessToken();
  const playlistId = await ensurePlaylist();
  if (!token || !playlistId) return;
  await axios.post(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
    { uris: [spotifyUri] },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
}

async function addTrackToPlaylistAt(spotifyUri, position = 0) {
  const token = await getUserAccessToken();
  const playlistId = await ensurePlaylist();
  if (!token || !playlistId) return;
  await axios.post(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
    { uris: [spotifyUri] },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      params: { position },
    }
  );
}

async function removeTrackFromPlaylist(spotifyUri) {
  const token = await getUserAccessToken();
  const playlistId = await ensurePlaylist();
  if (!token || !playlistId) return;
  await axios.request({
    url: `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { tracks: [{ uri: spotifyUri }] },
  });
}

async function clearPlaylist() {
  const token = await getUserAccessToken();
  const playlistId = await ensurePlaylist();
  if (!token || !playlistId) return;
  // Get all items (first 100 for simplicity)
  const { data } = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { limit: 100 },
  });
  const uris = (data.items || []).map((it) => it.track?.uri).filter(Boolean);
  if (uris.length === 0) return;
  await axios.request({
    url: `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { tracks: uris.map((uri) => ({ uri })) },
  });
}

async function replacePlaylistItems(uris) {
  const token = await getUserAccessToken();
  const playlistId = await ensurePlaylist();
  if (!token || !playlistId) return;
  await axios.put(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
    { uris },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
}

// --- Playback control helpers ---
async function userApi(method, url, data) {
  const token = await getUserAccessToken();
  if (!token) throw new Error('Not authorized');
  return axios.request({ method, url, data, headers: { Authorization: `Bearer ${token}` } });
}

async function listDevices() {
  const { data } = await userApi('GET', 'https://api.spotify.com/v1/me/player/devices');
  return data?.devices || [];
}

async function transferPlayback(deviceId, play = true) {
  const token = await getUserAccessToken();
  if (!token) throw new Error('Not authorized');
  await axios.put('https://api.spotify.com/v1/me/player', { device_ids: [deviceId], play }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

async function ensureActiveDevice(play = true) {
  const devices = await listDevices();
  if (!devices || devices.length === 0) throw new Error('Nenhum dispositivo disponível na conta Spotify');
  const active = devices.find((d) => d.is_active) || devices[0];
  await transferPlayback(active.id, play);
  return active;
}

async function play() {
  try { await userApi('PUT', 'https://api.spotify.com/v1/me/player/play'); }
  catch { await ensureActiveDevice(true); }
}

async function pause() {
  try { await userApi('PUT', 'https://api.spotify.com/v1/me/player/pause'); }
  catch { await ensureActiveDevice(false); }
}

async function nextTrack() {
  try { await userApi('POST', 'https://api.spotify.com/v1/me/player/next'); }
  catch { await ensureActiveDevice(true); }
}

async function previousTrack() {
  try { await userApi('POST', 'https://api.spotify.com/v1/me/player/previous'); }
  catch { await ensureActiveDevice(true); }
}

async function playPlaylistAt(spotifyUri) {
  const token = await getUserAccessToken();
  const playlistId = await ensurePlaylist();
  if (!token || !playlistId) throw new Error('Not authorized');
  const body = spotifyUri
    ? { context_uri: `spotify:playlist:${playlistId}`, offset: { uri: spotifyUri }, position_ms: 0 }
    : { context_uri: `spotify:playlist:${playlistId}` };
  try {
    await axios.put('https://api.spotify.com/v1/me/player/play', body, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
  } catch {
    await ensureActiveDevice(true);
    await axios.put('https://api.spotify.com/v1/me/player/play', body, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
  }
}

function extractTrackIdFromUri(spotifyUri) {
  if (!spotifyUri) return null;
  const parts = String(spotifyUri).split(':');
  return parts[2] || null;
}

async function fetchTrackInfoById(trackId) {
  const token = await getUserAccessToken();
  if (!token) return null;
  const { data } = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Spotify OAuth
app.get('/auth/login', (_req, res) => {
  const scopes = [
    'playlist-modify-public',
    'playlist-modify-private',
    'playlist-read-private',
    'user-read-email',
    'user-read-playback-state',
    'user-read-currently-playing',
    'user-modify-playback-state',
  ].join(' ');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: scopes,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    show_dialog: 'true',
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

app.get('/auth/callback', async (req, res) => {
  try {
    const code = String(req.query.code || '');
    if (!code) return res.status(400).send('Missing code');
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', SPOTIFY_REDIRECT_URI);
    const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const resp = await axios.post('https://accounts.spotify.com/api/token', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
      },
    });
    userAuth.accessToken = resp.data.access_token;
    userAuth.refreshToken = resp.data.refresh_token;
    userAuth.expiresAt = Date.now() + (resp.data.expires_in * 1000);
    // Ensure playlist ready
    await ensurePlaylist();
    res.send('Autorizado com sucesso. Você pode fechar esta aba.');
  } catch (e) {
    console.error(e);
    res.status(500).send('Falha na autorização');
  }
});

app.get('/auth/status', async (_req, res) => {
  const token = await getUserAccessToken();
  res.json({
    authorized: Boolean(token),
    playlistId: userAuth.playlistId,
    userId: userAuth.userId,
    playlistName: PLAYLIST_NAME,
    tokenExpiresAt: userAuth.expiresAt || null,
    hasRefreshToken: Boolean(userAuth.refreshToken),
  });
});

// --- Sync with Spotify playback/playlist ---
async function fetchCurrentlyPlaying() {
  const token = await getUserAccessToken();
  if (!token) return null;
  try {
    const { data } = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data && Object.keys(data).length ? data : null;
  } catch (e) {
    return null;
  }
}

function toAppTrackFromSpotify(track) {
  if (!track) return null;
  return {
    id: track.id,
    title: track.name,
    artist: (track.artists || []).map((a) => a.name).join(', '),
    albumArt: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || null,
    spotifyUri: track.uri,
  };
}

function buildRequestedByMap() {
  const map = new Map();
  for (const item of queue) {
    map.set(item.spotifyUri, { requestedBy: item.requestedBy, addedAt: item.addedAt });
  }
  if (nowPlaying) {
    map.set(nowPlaying.spotifyUri, { requestedBy: nowPlaying.requestedBy, addedAt: nowPlaying.addedAt ?? 0 });
  }
  return map;
}

async function performSyncWithSpotify() {
  try {
    const token = await getUserAccessToken();
    const playlistId = await ensurePlaylist();
    if (!token || !playlistId) return;

    const [playing, playlistResp] = await Promise.all([
      fetchCurrentlyPlaying(),
      axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 100 },
      }).then((r) => r.data).catch(() => ({ items: [] })),
    ]);

    const requestedByMap = buildRequestedByMap();

    // Determine now playing if the player is using our playlist or the track is in our playlist
    let newNowPlaying = nowPlaying;
    const playlistUri = `spotify:playlist:${playlistId}`;
    const playlistTrackUris = (playlistResp.items || []).map((it) => it.track?.uri).filter(Boolean);

    if (playing && playing.item) {
      const inOurContext = playing.context?.uri === playlistUri || playlistTrackUris.includes(playing.item.uri);
      if (inOurContext) {
        const base = toAppTrackFromSpotify(playing.item);
        if (base) {
          const meta = requestedByMap.get(base.spotifyUri);
          newNowPlaying = { ...base, requestedBy: meta?.requestedBy || '—', addedAt: meta?.addedAt || Date.now() };
        }
      }
    }

    // Desired queue mirrors playlist order excluding the now playing track
    const desiredQueue = [];
    for (const it of playlistResp.items || []) {
      const t = it.track;
      if (!t || (newNowPlaying && t.id === newNowPlaying.id)) continue;
      const base = toAppTrackFromSpotify(t);
      if (!base) continue;
      const meta = requestedByMap.get(base.spotifyUri);
      desiredQueue.push({ ...base, requestedBy: meta?.requestedBy || '—', addedAt: meta?.addedAt || Date.now() });
    }

    // If state changed, broadcast
    const changedNow = (!nowPlaying && newNowPlaying) || (nowPlaying && newNowPlaying && (nowPlaying.id !== newNowPlaying.id || nowPlaying.requestedBy !== newNowPlaying.requestedBy));
    const changedQueue = JSON.stringify(queue.map((q) => q.id)) !== JSON.stringify(desiredQueue.map((q) => q.id));
    if (changedNow || changedQueue) {
      nowPlaying = newNowPlaying || null;
      queue = desiredQueue;
      io.emit('queue:update', { nowPlaying, queue });
    }
  } catch (e) {
    // ignore sync errors
  }
}

let syncTimer = null;
function startSyncLoop() {
  if (syncTimer) return;
  syncTimer = setInterval(performSyncWithSpotify, 5000);
}
startSyncLoop();

app.post('/api/sync', async (_req, res) => {
  await performSyncWithSpotify();
  res.json({ ok: true, nowPlaying, queue });
});

// Search tracks on Spotify
app.get('/api/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ items: [] });
    const token = await getSpotifyAccessToken();
    if (!token) return res.status(503).json({ error: 'Spotify not configured' });
    const { data } = await axios.get('https://api.spotify.com/v1/search', {
      headers: { Authorization: `Bearer ${token}` },
      params: { q, type: 'track', limit: 10 },
    });
    const items = (data.tracks?.items || []).map((t) => ({
      id: t.id,
      title: t.name,
      artist: t.artists?.map((a) => a.name).join(', ') || '',
      albumArt: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null,
      spotifyUri: t.uri,
    }));
    res.json({ items });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to search' });
  }
});

// Get queue and now playing
app.get('/api/queue', (_req, res) => {
  res.json({ nowPlaying, queue });
});

// Add to queue
app.post('/api/queue', (req, res) => {
  try {
    const { track, requestedBy } = req.body || {};
    if (!track || !requestedBy) {
      return res.status(400).json({ error: 'Missing track or requestedBy' });
    }
    const name = String(requestedBy).trim();
    if (!name) return res.status(400).json({ error: 'Invalid name' });
    if (!canRequest(name)) {
      return res.status(429).json({ error: `Limite atingido: máximo ${REQUEST_LIMIT} músicas em ${REQUEST_WINDOW_MINUTES} min.` });
    }
    // Dedup: if already in nowPlaying or queue, block
    const alreadyQueued = (nowPlaying && nowPlaying.id === track.id) || queue.some((q) => q.id === track.id);
    if (alreadyQueued) {
      return res.status(409).json({ error: 'Esta música já está na fila.' });
    }
    const item = { ...track, requestedBy: name, addedAt: Date.now() };
    queue.push(item);
    recordRequest(name);
    io.emit('queue:update', { nowPlaying, queue });
    // Fire and forget: add to Spotify playlist if authorized
    addTrackToPlaylist(track.spotifyUri).catch((e) => console.warn('Failed to add to playlist:', e?.message || e));
    res.status(201).json({ ok: true, item });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to add to queue' });
  }
});

// Set now playing (manual control)
app.post('/api/now-playing', (req, res) => {
  const { item } = req.body || {};
  if (!item) return res.status(400).json({ error: 'Missing item' });
  nowPlaying = item;
  // Remove from queue if exists
  queue = queue.filter((q) => q.id !== item.id || q.requestedBy !== item.requestedBy);
  io.emit('queue:update', { nowPlaying, queue });
  res.json({ ok: true, nowPlaying });
});

// Advance to next (automated)
app.post('/api/next', async (_req, res) => {
  try {
    if (queue.length === 0) {
      if (nowPlaying) {
        await removeTrackFromPlaylist(nowPlaying.spotifyUri).catch(() => {});
      }
      nowPlaying = null;
    } else {
      if (nowPlaying) {
        await removeTrackFromPlaylist(nowPlaying.spotifyUri).catch(() => {});
        // remove from local queue as well just in case
        queue = queue.filter((q) => q.id !== nowPlaying.id);
      }
      nowPlaying = queue.shift() || null;
    }
    io.emit('queue:update', { nowPlaying, queue });
    res.json({ ok: true, nowPlaying });
  } catch (e) {
    res.status(500).json({ error: 'Failed to advance' });
  }
});

// Clear queue
app.post('/api/queue/clear', (_req, res) => {
  queue = [];
  io.emit('queue:update', { nowPlaying, queue });
  res.json({ ok: true });
});

// Clear playlist explicitly
app.post('/api/playlist/clear', async (_req, res) => {
  try {
    await clearPlaylist();
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to clear playlist' });
  }
});

// Admin: playback controls
app.post('/api/player/play', async (_req, res) => {
  try { await play(); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: 'Failed to play' }); }
});
app.post('/api/player/pause', async (_req, res) => {
  try { await pause(); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: 'Failed to pause' }); }
});
app.post('/api/player/next', async (_req, res) => {
  try {
    const prev = nowPlaying;
    await nextTrack();
    if (prev) {
      try { await removeTrackFromPlaylist(prev.spotifyUri); } catch {}
      queue = queue.filter((q) => q.id !== prev.id);
    }
    await performSyncWithSpotify();
    io.emit('queue:update', { nowPlaying, queue });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to next' });
  }
});
app.post('/api/player/previous', async (_req, res) => {
  try { await previousTrack(); await performSyncWithSpotify(); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: 'Failed to previous' }); }
});
app.post('/api/player/play-playlist', async (_req, res) => {
  try { await playPlaylistAt(null); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: 'Failed to start playlist' }); }
});
app.post('/api/player/play-track', async (req, res) => {
  try {
    const { spotifyUri } = req.body || {};
    if (!spotifyUri) return res.status(400).json({ error: 'Missing spotifyUri' });
    const playlistId = await ensurePlaylist();
    if (!playlistId) return res.status(503).json({ error: 'Spotify not authorized' });

    // Remove the selected track from its old position (if present) to avoid duplicates
    await removeTrackFromPlaylist(spotifyUri).catch(() => {});
    // Remove current nowPlaying from playlist and local queue
    if (nowPlaying?.spotifyUri) {
      await removeTrackFromPlaylist(nowPlaying.spotifyUri).catch(() => {});
      queue = queue.filter((q) => q.id !== nowPlaying.id);
    }
    // Insert selected track at the top of the playlist
    await addTrackToPlaylistAt(spotifyUri, 0);
    // Start playback from the top
    await playPlaylistAt(null);

    // Update local state: promoted track becomes nowPlaying; remove it from queue where it was
    const promotedIdx = queue.findIndex((q) => q.spotifyUri === spotifyUri);
    const meta = promotedIdx >= 0 ? queue[promotedIdx] : null;
    if (promotedIdx >= 0) {
      queue.splice(promotedIdx, 1);
    }
    const trackId = extractTrackIdFromUri(spotifyUri);
    let base = null;
    if (trackId) {
      const t = await fetchTrackInfoById(trackId).catch(() => null);
      if (t) {
        base = {
          id: t.id,
          title: t.name,
          artist: (t.artists || []).map((a) => a.name).join(', '),
          albumArt: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null,
          spotifyUri,
        };
      }
    }
    if (base) {
      nowPlaying = { ...base, requestedBy: meta?.requestedBy || '—', addedAt: Date.now() };
    }
    io.emit('queue:update', { nowPlaying, queue });
    res.json({ ok: true, nowPlaying, queue });
  } catch (e) {
    res.status(500).json({ error: 'Failed to play track' });
  }
});

// Admin: reorder queue and playlist to match desired order
app.post('/api/queue/reorder', async (req, res) => {
  try {
    const { uris } = req.body || {};
    if (!Array.isArray(uris) || uris.length === 0) {
      return res.status(400).json({ error: 'Missing uris' });
    }
    // Build new queue based on provided order, keeping only known items
    const uriToItem = new Map(queue.map((q) => [q.spotifyUri, q]));
    const newQueue = [];
    const seen = new Set();
    for (const uri of uris) {
      if (seen.has(uri)) continue;
      const item = uriToItem.get(uri);
      if (item) {
        newQueue.push(item);
        seen.add(uri);
      }
    }
    queue = newQueue;

    // Desired playlist order = [nowPlaying, ...queue]
    const desiredUris = [];
    if (nowPlaying?.spotifyUri) desiredUris.push(nowPlaying.spotifyUri);
    for (const it of queue) desiredUris.push(it.spotifyUri);

    await replacePlaylistItems(desiredUris);
    io.emit('queue:update', { nowPlaying, queue });
    res.json({ ok: true, queue });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to reorder queue' });
  }
});

// Admin: remove a track from queue and playlist
app.post('/api/queue/remove', async (req, res) => {
  try {
    const { id, spotifyUri } = req.body || {};
    if (!id && !spotifyUri) return res.status(400).json({ error: 'Missing id or spotifyUri' });
    const before = queue.length;
    queue = queue.filter((q) => (id ? q.id !== id : true) && (spotifyUri ? q.spotifyUri !== spotifyUri : true));
    if (before !== queue.length) {
      if (spotifyUri) {
        try { await removeTrackFromPlaylist(spotifyUri); } catch {}
      }
      io.emit('queue:update', { nowPlaying, queue });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to remove from queue' });
  }
});

// Admin: devices
app.get('/api/player/devices', async (_req, res) => {
  try {
    const devices = await listDevices();
    res.json({ devices });
  } catch (e) {
    res.status(500).json({ error: 'Failed to list devices' });
  }
});
app.post('/api/player/transfer', async (req, res) => {
  try {
    const { deviceId, play } = req.body || {};
    if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });
    await transferPlayback(deviceId, play !== false);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to transfer playback' });
  }
});

io.on('connection', (socket) => {
  socket.emit('queue:update', { nowPlaying, queue });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

