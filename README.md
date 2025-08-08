# Grafia Bar Music Request

Aplicação web para gerenciar pedidos de músicas do Grafia Bar.

Stack:
- Server: Node.js + Express + Socket.IO + Axios (Spotify)
- Client: Vite + React + TypeScript + Material UI

## Como rodar

1) Server

```
cd server
cp .env.example .env  # preencha SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET
npm install
npm run dev
```

2) Client

```
cd client
npm install
npm run dev
```

Acesse `http://localhost:5173` para a página de pedidos (tablet) e `http://localhost:5173/display` para o display. Altere `VITE_API_BASE` se necessário.

## Variáveis
- Server `.env`:
  - `PORT` (padrão 4000)
  - `CORS_ORIGIN` (padrão http://localhost:5173)
  - `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`
  - `REQUEST_LIMIT`, `REQUEST_WINDOW_MINUTES`
- Client `.env` (opcional):
  - `VITE_API_BASE` (padrão http://localhost:4000)

