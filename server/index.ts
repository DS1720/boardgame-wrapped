/**
 * Local render service. Step 1 provides the route and the bundle cache; step 10
 * fills in renderMedia(). Nothing here talks to the network beyond localhost.
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(dirname, '..', 'out');
const PORT = 4000;

const app = express();
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, outDir: OUT_DIR });
});

app.post('/render', async (req, res) => {
  const { stats } = req.body ?? {};
  if (!stats?.playerName) {
    res.status(400).json({ error: 'Send a stats payload with a playerName.' });
    return;
  }
  // Step 10: bundle() once at startup, then renderMedia() into OUT_DIR.
  res.status(200).json({ ok: true, pending: 'renderMedia is wired up in step 10' });
});

app.listen(PORT, () => {
  console.log(`Render service on http://localhost:${PORT}`);
});
