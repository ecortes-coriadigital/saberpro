import { useState, useEffect } from 'react';
import { dbClient } from './lib/dbClient';
import type { Usuario } from './lib/types';
import { LoginView } from './views/LoginView';
import { AdminDashboardView } from './views/AdminDashboardView';
import { StudentDashboardView } from './views/StudentDashboardView';
import { GraduationCap, RefreshCw, Sun, Moon } from 'lucide-react';

function App() {
  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark-theme');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // Initialize Relational Mock Database in LocalStorage
  useEffect(() => {
    try {
      dbClient.initializeAsync()
        .catch((err) => {
          console.error(err);
        });
      
      // Auto login restore if session exists
      const savedUserId = localStorage.getItem('session_user_id');
      if (savedUserId) {
        const users = dbClient.getUsuarios();
        const found = users.find(u => u.id === savedUserId);
        if (found) {
          setCurrentUser(found);
        } else {
          localStorage.removeItem('session_user_id');
        }
      }
    } catch (err: any) {
      console.error(err);
    }
  }, []);

  // Update last_active_at periodically for the logged-in user
  useEffect(() => {
    if (currentUser) {
      dbClient.actualizarActividad(currentUser.id);
      const interval = setInterval(() => {
        dbClient.actualizarActividad(currentUser.id);
      }, 30000); // Cada 30 segundos
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  const handleLoginSuccess = (user: Usuario) => {
    setCurrentUser(user);
  };

  const handleLogout = () => {
    localStorage.removeItem('session_user_id');
    setCurrentUser(null);
  };

  const handleForceResetDB = () => {
    if (window.confirm('¿Está seguro de reiniciar la Base de Datos? Se perderán todos los colegios, grupos y resultados creados.')) {
      dbClient.initializeAsync(true)
        .then(() => {
          handleLogout();
          window.location.reload();
        })
        .catch(() => {
          alert('Error al reiniciar base de datos');
        });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Universal Technical Topbar */}
      <header className="topbar-wrapper">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <GraduationCap size={24} style={{ color: 'var(--color-primary)' }} />
          <span style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.02em', color: '#ffffff' }}>
            SABER-PRO
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', opacity: 0.7 }} className="hide-mobile">
            Células: Administración y Estudiantes
          </span>
          <button 
            onClick={handleForceResetDB} 
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontWeight: '600',
              padding: '0.35rem 0.85rem',
              borderRadius: '9999px',
              fontSize: '0.7rem',
              transition: 'var(--transition-normal)'
            }}
            title="Reinicia LocalStorage con datos semilla limpios"
          >
            <RefreshCw size={10} />
            Reiniciar BD
          </button>

          <button
            onClick={() => setIsDarkMode(prev => !prev)}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#ffffff',
              transition: 'var(--transition-normal)'
            }}
            title="Cambiar Tema"
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {currentUser && (
            <div className="topbar-profile" style={{ borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '1rem' }}>
              <div className="topbar-avatar" style={{ fontWeight: 'bold', fontSize: '0.8rem', color: '#ffffff' }}>
                {currentUser.email.substring(0, 2).toUpperCase()}
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ffffff' }}>
                {currentUser.rol === 'admin' ? 'Admin' : currentUser.rol === 'docente' ? 'Docente' : 'Estudiante'}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main View Router */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {!currentUser ? (
          <LoginView onLoginSuccess={handleLoginSuccess} />
        ) : currentUser.rol === 'admin' || currentUser.rol === 'docente' ? (
          <AdminDashboardView currentUser={currentUser} onLogout={handleLogout} />
        ) : (
          <StudentDashboardView currentUser={currentUser} onLogout={handleLogout} onUpdateUser={setCurrentUser} />
        )}
      </div>
    </div>
  );
}

export default App;
