const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'codespace-super-secret-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true in production with HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// =============================================
// AUTH MIDDLEWARE
// =============================================
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Please log in first' });
  }
  next();
}

// =============================================
// AUTH ROUTES
// =============================================

// SIGN UP
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    
    // Check if user exists
    const existing = await db.getAsync(
      'SELECT * FROM users WHERE email = ? OR username = ?', 
      [email, username]
    );
    if (existing) {
      return res.status(400).json({ 
        error: existing.email === email ? 'Email already used' : 'Username taken' 
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const result = await db.runAsync(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword]
    );
    
    // Auto-login after signup
    req.session.userId = result.lastID;
    req.session.username = username;
    
    res.json({ 
      success: true, 
      user: { id: result.lastID, username, email } 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LOG IN
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const user = await db.getAsync('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    req.session.userId = user.id;
    req.session.username = user.username;
    
    res.json({ 
      success: true, 
      user: { id: user.id, username: user.username, email: user.email } 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LOG OUT
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// CHECK IF LOGGED IN (for frontend)
app.get('/api/auth/me', (req, res) => {
  if (req.session.userId) {
    res.json({ 
      loggedIn: true, 
      user: { 
        id: req.session.userId, 
        username: req.session.username 
      } 
    });
  } else {
    res.json({ loggedIn: false });
  }
});

// =============================================
// PEN ROUTES
// =============================================

// Create pen (must be logged in)
app.post('/api/pens', requireAuth, async (req, res) => {
  try {
    const id = uuidv4().slice(0, 8);
    const { title, html, css, js } = req.body;

    await db.runAsync(
      `INSERT INTO pens (id, user_id, title, html, css, js) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, req.session.userId, title || 'Untitled', html || '', css || '', js || '']
    );

    const pen = await db.getAsync('SELECT * FROM pens WHERE id = ?', [id]);
    res.status(201).json(pen);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get MY pens (only logged in user's pens)
app.get('/api/pens', requireAuth, async (req, res) => {
  try {
    const pens = await db.allAsync(
      `SELECT id, title, html, css, js, created_at, updated_at 
       FROM pens 
       WHERE user_id = ?
       ORDER BY updated_at DESC LIMIT 50`,
      [req.session.userId]
    );
    res.json(pens);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single pen (PUBLIC - anyone can view)
app.get('/api/pens/:id', async (req, res) => {
  try {
    const pen = await db.getAsync(
      `SELECT pens.*, users.username AS author 
       FROM pens 
       LEFT JOIN users ON pens.user_id = users.id 
       WHERE pens.id = ?`, 
      [req.params.id]
    );
    if (!pen) return res.status(404).json({ error: 'Pen not found' });
    
    // Check if current user owns it
    pen.isOwner = req.session.userId === pen.user_id;
    
    res.json(pen);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update pen (only owner can update)
app.put('/api/pens/:id', requireAuth, async (req, res) => {
  try {
    const { title, html, css, js } = req.body;
    const existing = await db.getAsync('SELECT * FROM pens WHERE id = ?', [req.params.id]);

    if (!existing) return res.status(404).json({ error: 'Pen not found' });
    if (existing.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'You can only edit your own pens' });
    }

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

// Delete pen (only owner)
app.delete('/api/pens/:id', requireAuth, async (req, res) => {
  try {
    const pen = await db.getAsync('SELECT * FROM pens WHERE id = ?', [req.params.id]);
    if (!pen) return res.status(404).json({ error: 'Pen not found' });
    if (pen.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'You can only delete your own pens' });
    }
    
    await db.runAsync('DELETE FROM pens WHERE id = ?', [req.params.id]);
    res.json({ message: 'Pen deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// PAGE ROUTES
// =============================================

app.get('/pen/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'editor.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

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