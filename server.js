const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Create new pen
app.post('/api/pens', (req, res) => {
  const id = uuidv4().slice(0, 8);
  const { title, html, css, js } = req.body;

  const stmt = db.prepare(`
    INSERT INTO pens (id, title, html, css, js) 
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(id, title || 'Untitled', html || '', css || '', js || '');

  const pen = db.prepare('SELECT * FROM pens WHERE id = ?').get(id);
  res.status(201).json(pen);
});

// Get all pens
app.get('/api/pens', (req, res) => {
  const pens = db.prepare(`
    SELECT id, title, html, css, js, created_at, updated_at 
    FROM pens 
    ORDER BY updated_at DESC
    LIMIT 50
  `).all();

  res.json(pens);
});

// Get single pen
app.get('/api/pens/:id', (req, res) => {
  const pen = db.prepare('SELECT * FROM pens WHERE id = ?').get(req.params.id);

  if (!pen) {
    return res.status(404).json({ error: 'Pen not found' });
  }

  res.json(pen);
});

// Update pen
app.put('/api/pens/:id', (req, res) => {
  const { title, html, css, js } = req.body;

  const existing = db.prepare('SELECT * FROM pens WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Pen not found' });
  }

  const stmt = db.prepare(`
    UPDATE pens 
    SET title = ?, html = ?, css = ?, js = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  stmt.run(
    title ?? existing.title,
    html ?? existing.html,
    css ?? existing.css,
    js ?? existing.js,
    req.params.id
  );

  const pen = db.prepare('SELECT * FROM pens WHERE id = ?').get(req.params.id);
  res.json(pen);
});

// Delete pen
app.delete('/api/pens/:id', (req, res) => {
  const result = db.prepare('DELETE FROM pens WHERE id = ?').run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Pen not found' });
  }

  res.json({ message: 'Pen deleted' });
});

// Serve editor page
app.get('/pen/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'editor.html'));
});

// Serve homepage
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
