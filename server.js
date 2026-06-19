const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Create new pen
app.post('/api/pens', async (req, res) => {
  try {
    const id = uuidv4().slice(0, 8);
    const { title, html, css, js } = req.body;

    await db.runAsync(
      `INSERT INTO pens (id, title, html, css, js) VALUES (?, ?, ?, ?, ?)`,
      [id, title || 'Untitled', html || '', css || '', js || '']
    );

    const pen = await db.getAsync('SELECT * FROM pens WHERE id = ?', [id]);
    res.status(201).json(pen);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all pens
app.get('/api/pens', async (req, res) => {
  try {
    const pens = await db.allAsync(
      `SELECT id, title, html, css, js, created_at, updated_at 
       FROM pens ORDER BY updated_at DESC LIMIT 50`
    );
    res.json(pens);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single pen
app.get('/api/pens/:id', async (req, res) => {
  try {
    const pen = await db.getAsync('SELECT * FROM pens WHERE id = ?', [req.params.id]);
    if (!pen) return res.status(404).json({ error: 'Pen not found' });
    res.json(pen);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update pen
app.put('/api/pens/:id', async (req, res) => {
  try {
    const { title, html, css, js } = req.body;
    const existing = await db.getAsync('SELECT * FROM pens WHERE id = ?', [req.params.id]);

    if (!existing) return res.status(404).json({ error: 'Pen not found' });

    await db.runAsync(
      `UPDATE pens SET title = ?, html = ?, css = ?, js = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [
        title ?? existing.title,
        html ?? existing.html,
        css ?? existing.css,
        js ?? existing.js,
        req.params.id
      ]
    );

    const pen = await db.getAsync('SELECT * FROM pens WHERE id = ?', [req.params.id]);
    res.json(pen);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete pen
app.delete('/api/pens/:id', async (req, res) => {
  try {
    const result = await db.runAsync('DELETE FROM pens WHERE id = ?', [req.params.id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Pen not found' });
    res.json({ message: 'Pen deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve editor page
app.get('/pen/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'editor.html'));
});

// Serve homepage (catch-all)
app.get('/{*any}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════╗
  ║   🚀 CodeSpace is LIVE!           ║
  ║   http://localhost:${PORT}           ║
  ╚════════════════════════════════════╝
  `);
});