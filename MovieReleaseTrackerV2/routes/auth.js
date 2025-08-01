const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { getUsersByEmail, createUser } = require('../services/airtable');

// Registration page
router.get('/register', (req, res) => {
  res.render('register', { title: 'Register', error: null });
});

// Register handler
router.post('/register', async (req, res) => {
  const email = req.body.email.trim().toLowerCase();
  const name = req.body.name?.trim() || '';
  const password = req.body.password;

  if (!email || !password) {
    return res.render('register', { title: 'Register', error: 'Email and password required' });
  }

  try {
    const existingUsers = await getUsersByEmail(email);
    if (existingUsers.length > 0) {
      return res.render('register', { title: 'Register', error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userID = uuidv4();

    await createUser({
      UserID: userID,
      Email: email,
      Name: name,
      PasswordHash: hashedPassword,
    });

    res.redirect('/auth/login');

  } catch (error) {
    console.error(error);
    res.render('register', { title: 'Register', error: 'Error registering user' });
  }
});

// Login page
router.get('/login', (req, res) => {
  const redirectTo = req.query.redirect || '/';
  req.session.redirectTo = redirectTo;

  res.render('login', {
    title: 'Login',
    error: null
  });
});


// Login handler
router.post('/login', async (req, res) => {
  const email = req.body.email.trim().toLowerCase();
  const password = req.body.password;

  try {
    const users = await getUsersByEmail(email);

    if (users.length === 0) {
      return res.render('login', { title: 'Login', error: 'Invalid credentials' });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.fields.PasswordHash);

    if (!validPassword) {
      return res.render('login', { title: 'Login', error: 'Invalid credentials' });
    }

    req.session.userId = user.fields.UserID;
    req.session.airtableRecordId = user.id;
    req.session.userEmail = user.fields.Email;
    req.session.userName = user.fields.Name;

    const redirectTo = req.session.redirectTo || '/';
    delete req.session.redirectTo;
    res.redirect(redirectTo);

  } catch (error) {
    console.error(error);
    res.render('login', { title: 'Login', error: 'Error logging in' });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
