import express from 'express';
import path from 'path';
import fs from 'fs';

const app = express();
app.use(express.json({ limit: '30mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const distPath = path.join(process.cwd(), '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/generate-schedule', (req, res) => {
  res.status(501).json({ success: false, error: 'Not implemented in this deployment mode' });
});

app.post('/api/get-chat-response', async (req, res) => {
  try {
    const { prompt, history, personnel, shiftTypes } = req.body;
    res.status(501).json({ success: false, error: 'AI chat requires server-side Gemini API key' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Unknown error' });
  }
});

app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Not found');
  }
});

export default (req: express.Request, res: express.Response) => {
  return new Promise((resolve, reject) => {
    app(req, res, (err?: any) => {
      if (err) reject(err);
      else resolve(undefined);
    });
  });
};
