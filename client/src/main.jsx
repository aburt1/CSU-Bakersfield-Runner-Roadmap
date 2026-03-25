import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AuthProvider from './auth/AuthProvider';
import App from './App';
import AdminPage from './pages/admin/AdminPage';
import AdminLocalLogin from './pages/admin/AdminLocalLogin';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
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
