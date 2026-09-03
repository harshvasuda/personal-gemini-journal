# Personal Gemini Journal

A secure, user-authenticated personal reflection journal built for the Google Cloud Gen AI Academy Ideathon.

## Features
- **Firebase Authentication**: Federated Google Sign-In with client-side token verification.
- **Data Isolation**: Per-user isolated subcollections in Cloud Firestore (`/users/{uid}/journals`) to strictly avoid cross-user data leaks.
- **Resilient Gemini AI Engine**: Multi-tier API fallback ladder (Gemini 3.6 Flash, Gemini 3.1 Flash-Lite, Gemini Flash) to guarantee high availability and prevent transient 503/load errors.
- **Architectural Security**: Zero hardcoded secrets; backend-only Gemini API proxy.

## Tech Stack
- **Backend**: Node.js, Express
- **Frontend**: HTML5, Tailwind CSS, Vanilla JS
- **Database & Auth**: Cloud Firestore, Firebase Auth
- **AI Model**: Google Gemini API via AI Studio
- **Containerization**: Dockerfile configured for Cloud Run / Container deployment

## Live Demo
- [Live Prototype](https://personal-gemini-journal-fol4.onrender.com)
