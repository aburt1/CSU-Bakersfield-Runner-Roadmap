import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AuthProvider from './auth/AuthProvider.jsx';
import App from './App.jsx';
import AdminPage from './pages/admin/AdminPage.jsx';
import AdminLocalLogin from './pages/admin/AdminLocalLogin.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Routes>
      <Route
        path="/"
        element={
          <AuthProvider>
            <App />
          </AuthProvider>
        }
      />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin/local-login" element={<AdminLocalLogin />} />
    </Routes>
  </BrowserRouter>
);
