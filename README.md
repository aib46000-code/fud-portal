# FUD Portal – Ahmaditech School

A **production-ready** full-stack school management portal for Federal University Dutse (FUD) — built with Node.js, Express, SQLite, and vanilla HTML/CSS/JS.

---

## 🚀 Quick Start

```bash
# 1. Clone and enter project
cd fud-portal

# 2. Install dependencies
npm install

# 3. Copy environment file
copy .env.example .env

# 4. Start the development server
npm run dev
```

Open **http://localhost:5000** in your browser.

---

## 🗂️ Project Structure

```
fud-portal/
├── backend/
│   ├── controllers/          # Business logic
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── testController.js
│   │   ├── notificationController.js
│   │   └── mediaController.js
│   ├── database/
│   │   ├── db.js             # Connection, schema, migration, seed
│   │   ├── migrate.js        # Standalone migration runner
│   │   └── seed.js           # Standalone seed runner
│   ├── middleware/
│   │   ├── authMiddleware.js  # JWT verification
│   │   ├── roleMiddleware.js  # Role-based guard
│   │   ├── uploadMiddleware.js# Multer config
│   │   ├── errorHandler.js   # Global error handler
│   │   └── rateLimiter.js    # Rate limiting
│   ├── models/
│   │   ├── User.js
│   │   ├── Student.js
│   │   ├── Admin.js
│   │   ├── Test.js
│   │   ├── Question.js
│   │   ├── Result.js
│   │   ├── Notification.js
│   │   ├── Media.js
│   │   └── Token.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── userRoutes.js
│   │   ├── testRoutes.js
│   │   ├── notificationRoutes.js
│   │   └── mediaRoutes.js
│   ├── utils/
│   │   ├── logger.js         # Winston logger
│   │   ├── jwtHelper.js      # JWT sign/verify
│   │   ├── validators.js     # Input validation rules
│   │   └── response.js       # Standardised HTTP responses
│   └── server.js             # Express entry point
├── frontend/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── auth.js
│   │   ├── dashboard.js
│   │   ├── tests.js
│   │   └── profile.js
│   ├── images/
│   ├── index.html            # Login page
│   ├── register.html
│   ├── dashboard.html
│   ├── tests.html
│   └── profile.html
├── uploads/                  # Uploaded files (git-ignored)
├── logs/                     # Winston logs (git-ignored)
├── .env                      # Environment variables
├── .env.example              # Template
├── .gitignore
├── package.json
└── README.md
```

---

## 🗃️ Database Tables

| Table | Description |
|-------|-------------|
| `users` | Core authentication (email, password, role) |
| `students` | Student profiles (matric_no, dept, faculty, level) |
| `admins` | Admin/staff profiles (staff_id, permissions) |
| `media` | File upload records |
| `tests` | Exams and quizzes |
| `questions` | Test questions (MCQ, True/False, Short Answer) |
| `results` | Student test submissions and scores |
| `notifications` | Per-user notification feed |
| `activity_logs` | Full audit trail |
| `password_resets` | Password reset tokens |
| `tokens` | Revocable JWT refresh tokens |

---

## 🔌 API Endpoints

### Authentication
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | ❌ | Register student/admin |
| POST | `/api/auth/login` | ❌ | Login, get JWT tokens |
| POST | `/api/auth/logout` | ✅ | Revoke refresh token |
| POST | `/api/auth/refresh` | ❌ | Rotate refresh token |
| GET | `/api/auth/me` | ✅ | Get current user profile |
| PUT | `/api/auth/change-password` | ✅ | Change password |

### Users
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/users` | Admin | List all users |
| GET | `/api/users/students` | Admin | List students |
| GET | `/api/users/:id` | Self/Admin | Get user |
| PUT | `/api/users/:id` | Self/Admin | Update profile |
| PATCH | `/api/users/:id/active` | Admin | Toggle active |
| DELETE | `/api/users/:id` | Superadmin | Delete user |

### Tests & Questions
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/tests` | All | List tests |
| POST | `/api/tests` | Admin | Create test |
| PATCH | `/api/tests/:id/publish` | Admin | Publish test |
| POST | `/api/tests/:id/questions` | Admin | Add question |
| POST | `/api/tests/:id/questions/bulk` | Admin | Bulk add questions |
| POST | `/api/tests/:id/submit` | Student | Submit answers |
| GET | `/api/tests/:id/results` | Admin | View results |
| GET | `/api/tests/my-results` | Student | My results |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | List notifications |
| GET | `/api/notifications/unread-count` | Unread count |
| PATCH | `/api/notifications/:id/read` | Mark read |
| PATCH | `/api/notifications/mark-all-read` | Mark all read |
| POST | `/api/notifications/broadcast` | Admin broadcast |

### Media
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/media/upload` | Upload file |
| GET | `/api/media` | List files |
| DELETE | `/api/media/:id` | Delete file |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server status |

---

## 🔐 Default Admin Credentials

```
Email:    admin@fudportal.edu.ng
Password: Admin@FUD2024
```

> ⚠️ **Change these immediately in production!** Update `.env` before deploying.

---

## 🛡️ Security Features

- **Helmet** – HTTP security headers
- **CORS** – Configured allowed origins
- **bcryptjs** – Password hashing (12 rounds)
- **JWT** – Access + Refresh token rotation
- **Rate Limiting** – 10 auth attempts / 15 min
- **Input Validation** – express-validator on all inputs
- **Foreign Keys** – SQLite FK enforcement enabled
- **Token Hashing** – Refresh tokens stored as SHA-256 hashes

---

## 📋 NPM Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev` | nodemon | Development with hot-reload |
| `npm start` | node | Production start |
| `npm run migrate` | node | Run DB migrations only |
| `npm run seed` | node | Seed DB (admin account) |
| `npm run setup` | migrate + seed | Full DB setup |

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js ≥ 18 |
| Framework | Express.js 4 |
| Database | SQLite3 (sqlite3 driver) |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Upload | Multer |
| Logging | Winston + Morgan |
| Validation | express-validator |
| Security | Helmet + CORS + express-rate-limit |
| Dev | Nodemon |

---

## 📄 License

MIT © Ahmaditech — FUD Portal
