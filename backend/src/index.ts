import express from 'express';

const app = express();
const PORT = process.env.PORT || 5001;

app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'backend' });
});

app.listen(PORT, () => {
    console.log(`[backend] listening on http://localhost:${PORT}`);
});
