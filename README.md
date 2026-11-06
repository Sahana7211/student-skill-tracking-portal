# SkillSpring — Student Skill Tracking Portal

A complete student-facing Node.js + Express project with a responsive dashboard, account creation/login, task tracking, 10 subject assessments (25 questions each), scores, and printable certificates.

## Features
- Create an account and sign in with email/password (passwords are hashed with bcrypt).
- Personal dashboard with task completion, assessment, certificate and average-score stats.
- Add, complete and delete learning tasks; optionally set due dates and subjects.
- 10 skill subjects: C, C++, Java, Python, JavaScript, HTML & CSS, SQL & Databases, Data Structures, Web Development, and Git & GitHub.
- Each subject contains 25 multiple-choice questions (250 total).
- Answers are checked on the server. A score of 60% or higher passes.
- Passing an assessment creates a certificate with a unique code. Use **Print / Save as PDF** in the browser print dialog.
- Data persists in `data/db.json`; each account sees only its own tasks and results.
- Responsive layout for desktop, tablet and mobile.

## Requirements
- Node.js 18 or newer (includes npm).
- Internet connection during first setup to install npm packages. Google Fonts are optional; the design uses fallbacks.

## Run on Windows
1. Extract the ZIP file to a folder, for example `C:\Users\YOUR_NAME\Desktop\student-skill-tracking-portal`.
2. Open Command Prompt.
3. Run these commands (adjust the path to match where you extracted it):

```bat
cd /d "C:\Users\YOUR_NAME\Desktop\student-skill-tracking-portal"
npm install
npm start
```

4. Open `http://localhost:3000` in Chrome or Edge.
5. Select **Create account**, register with your own email and a password of at least 6 characters, then sign in.

## Troubleshooting
- `npm error ENOENT ... package.json`: you are in the wrong folder or the ZIP was not extracted. Run `dir` and confirm `package.json` appears in the current folder.
- `npm is not recognized`: install Node.js LTS from the official Node.js website, then close and reopen Command Prompt.
- Port 3000 already in use: in Command Prompt run `set PORT=3001` and then `npm start`; open `http://localhost:3001`.
- If an email is already registered, use **Sign in** instead of creating a second account.
- To reset all local project data, stop the server and delete `data/db.json`. The app will recreate it on the next start. This deletes all local accounts, tasks, results and certificates.

## Important notes
This is a learning/demo project. Before public deployment, set a strong `SESSION_SECRET`, use HTTPS, configure a production session store, add rate limiting and backups, and review security/privacy requirements. Certificate IDs are app-generated and are not an official third-party accreditation.
