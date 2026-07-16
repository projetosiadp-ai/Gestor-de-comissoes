import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@fontsource/inter';
import './styles/app.css';
import { AuthProvider } from './auth/AuthContext';

const savedTheme = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.classList.toggle('dark', savedTheme === 'dark' || (!savedTheme && prefersDark));

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider><App /></AuthProvider>
  </React.StrictMode>
);
