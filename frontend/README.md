# NLC-SecureMaint - Frontend

React + Vite frontend client for **NLC-SecureMaint** (NLC India Limited).

## Setup & Running

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Start Vite Development Server
```bash
npm run dev
```
The application will be accessible at `http://localhost:3000`.

## Features Built (Task 10)
- **Login Page (`/login`)**: Authenticates against `http://localhost:5000/api/auth/login`. Features quick-fill demo buttons for all 5 roles.
- **Protected Home Page (`/`)**: Displays the authenticated user's name, role, email, and plant section.
- **JWT Storage**: Synchronized in React state (memory) and `sessionStorage`.
- **Axios Helper (`src/api/axios.js`)**: Automatically attaches the Bearer token and handles 401 redirects.
- **Sidebar Layout**: NLCIL corporate styled layout with disabled placeholders for future modules.

