import React, { useState } from 'react';
import { dbClient } from '../lib/dbClient';
import type { Usuario } from '../lib/types';
import { GraduationCap, LogIn, AlertCircle } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: (user: Usuario) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const usuarios = dbClient.getUsuarios();
      const user = usuarios.find(
        (u) => u.email === email.trim().toLowerCase() && u.password_hash === password
      );

      if (user) {
        if (user.estado === 'baja') {
          setError('Su cuenta se encuentra de baja y no tiene acceso a la plataforma.');
          return;
        }
        dbClient.incrementarLogin(user.id);
        localStorage.setItem('session_user_id', user.id);
        onLoginSuccess(user);
      } else {
        const errMsg = 'Credenciales incorrectas. Intente nuevamente.';
        setError(errMsg);
        // Log authentication error to database
        dbClient.initialize(); // Ensure DB is ready
        const errLog = `Fallo de inicio de sesión para el email: ${email}`;
        localStorage.setItem(
          'db_bitacora_errores',
          JSON.stringify([
            ...JSON.parse(localStorage.getItem('db_bitacora_errores') || '[]'),
            {
              id: 'err-' + Date.now(),
              timestamp: new Date().toISOString(),
              codigo_error: 'AUTH_FAILED',
              descripcion: errLog,
              usuario_id: null
            }
          ])
        );
      }
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
    }
  };

  const handleQuickLogin = (quickEmail: string, quickPass: string) => {
    setEmail(quickEmail);
    setPassword(quickPass);
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo-box">
            <GraduationCap size={32} />
          </div>
          <h2>Simulacros ICFES</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Plataforma Educativa de Preparación y Diagnóstico
          </p>
        </div>

        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: 'var(--color-error)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.875rem'
          }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Correo Electrónico</label>
            <input
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ejemplo@icfes.com"
              required
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Contraseña</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
            <LogIn size={18} />
            Iniciar Sesión
          </button>
        </form>

        <div style={{
          marginTop: '1rem',
          borderTop: '1px solid var(--border-color)',
          paddingTop: '1.25rem'
        }}>
          <h4 style={{ fontSize: '0.875rem', marginBottom: '0.75rem', color: 'var(--text-title)' }}>
            Cuentas Semilla para Pruebas:
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              onClick={() => handleQuickLogin('admin@icfes.com', 'admin123')}
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'space-between', width: '100%' }}
            >
              <span>Administrador</span>
              <code style={{ fontSize: '0.75rem' }}>admin@icfes.com</code>
            </button>
            <button
              onClick={() => handleQuickLogin('docente@icfes.com', 'docente123')}
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'space-between', width: '100%' }}
            >
              <span>Docente</span>
              <code style={{ fontSize: '0.75rem' }}>docente@icfes.com</code>
            </button>
            <button
              onClick={() => handleQuickLogin('estudiante1@icfes.com', 'estudiante123')}
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'space-between', width: '100%' }}
            >
              <span>Estudiante (Grado 11-01)</span>
              <code style={{ fontSize: '0.75rem' }}>estudiante1@icfes.com</code>
            </button>
            <button
              onClick={() => handleQuickLogin('estudiante2@icfes.com', 'estudiante123')}
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'space-between', width: '100%' }}
            >
              <span>Estudiante (Sin Grupo)</span>
              <code style={{ fontSize: '0.75rem' }}>estudiante2@icfes.com</code>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
