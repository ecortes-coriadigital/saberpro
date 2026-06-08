import React, { useState, useEffect } from 'react';
import { InteractiveTour } from '../components/InteractiveTour';
import type { TourStep } from '../components/InteractiveTour';
import { dbClient } from '../lib/dbClient';
import type { 
  Usuario, 
  Simulacro, 
  Resultado, 
  Pregunta, 
  Grupo, 
  Colegio 
} from '../lib/types';
import { 
  GraduationCap, 
  Play, 
  Clock, 
  Award, 
  Download, 
  ArrowLeft, 
  ArrowRight, 
  AlertTriangle,
  ChevronRight,
  BookOpen,
  Info,
  LogOut,
  TrendingUp,
  Flame,
  Zap,
  Compass,
  Edit
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface StudentDashboardViewProps {
  currentUser: Usuario;
  onLogout: () => void;
  onUpdateUser: (updatedUser: Usuario) => void;
}

export const StudentDashboardView: React.FC<StudentDashboardViewProps> = ({ currentUser, onLogout, onUpdateUser }) => {
  // DB States
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [colegio, setColegio] = useState<Colegio | null>(null);
  const [simulacros, setSimulacros] = useState<Simulacro[]>([]);
  const [resultados, setResultados] = useState<Resultado[]>([]);

  // Edit Profile States
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editNombreCompleto, setEditNombreCompleto] = useState('');

  // Active Exam wizard States
  const [activeSimulacro, setActiveSimulacro] = useState<Simulacro | null>(null);
  const [currentQuestions, setCurrentQuestions] = useState<Pregunta[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, 'A' | 'B' | 'C' | 'D'>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const autoAdvanceTimeoutRef = React.useRef<any>(null);

  // Onboarding Tour State
  const [isTourOpen, setIsTourOpen] = useState(false);

  useEffect(() => {
    const hasSeen = localStorage.getItem(`tour_completado_estudiante_${currentUser.id}`);
    if (!hasSeen && currentUser.grupo_id) {
      setIsTourOpen(true);
    }
  }, [currentUser, currentUser.grupo_id]);

  const handleTourComplete = () => {
    localStorage.setItem(`tour_completado_estudiante_${currentUser.id}`, 'true');
    setIsTourOpen(false);
  };

  const studentTourSteps: TourStep[] = [
    {
      targetId: 'tour-student-welcome',
      title: '¡Tu Nivel y XP! 🎯',
      content: 'Aquí puedes ver tu nivel actual y tu progreso de puntos de experiencia (XP). Sumarás puntos resolviendo simulacros.',
      position: 'bottom'
    },
    {
      targetId: 'tour-student-streak',
      title: 'Racha de Estudio 🔥',
      content: 'Muestra los días consecutivos en los que has ingresado a prepararte. ¡Mantén la llama encendida!',
      position: 'bottom'
    },
    {
      targetId: 'tour-student-logros',
      title: 'Logros Desbloqueados 🏆',
      content: 'Visualiza la proporción de medallas académicas que has conseguido por tu excelente desempeño.',
      position: 'bottom'
    },
    {
      targetId: 'tour-student-metrics',
      title: 'Resumen Académico 📈',
      content: 'Mira de un vistazo tu cantidad de simulacros totales, tu puntaje máximo y tu promedio global.',
      position: 'bottom'
    },
    {
      targetId: 'tour-student-simulator',
      title: '¡Presenta tu Examen! 📝',
      content: 'Desde aquí puedes comenzar un nuevo simulacro ICFES Saber 11 en cualquier momento.',
      position: 'bottom'
    },
    {
      targetId: 'tour-student-radar',
      title: 'Perfil de Competencias 🧭',
      content: 'Este gráfico de radar polar dibuja tus fortalezas y debilidades. Te muestra en qué áreas necesitas reforzar.',
      position: 'left'
    },
    {
      targetId: 'tour-student-achievements',
      title: 'Medallero de Logros 🌟',
      content: 'Revisa qué condiciones necesitas cumplir para desbloquear insignias especiales como "Calculadora Humana".',
      position: 'left'
    }
  ];

  // Focus State
  const [isFocusMode, setIsFocusMode] = useState(false);

  // Clean up any pending auto-advance timer when navigating questions
  useEffect(() => {
    return () => {
      if (autoAdvanceTimeoutRef.current) {
        clearTimeout(autoAdvanceTimeoutRef.current);
      }
    };
  }, [currentQuestionIdx]);

  // Active Results sheet State
  const [viewingResultadoSimId, setViewingResultadoSimId] = useState<string | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [showDetailedReview, setShowDetailedReview] = useState(false);

  const handleOpenEditProfile = () => {
    setEditNombreCompleto(currentUser.nombre_completo || '');
    setShowEditProfileModal(true);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = dbClient.updateUsuarioNombre(currentUser.id, editNombreCompleto);
      dbClient.syncToIndexedDb().catch(err => console.error('IndexedDB sync failed:', err));
      onUpdateUser(updated);
      setShowEditProfileModal(false);
      alert('Nombre actualizado con éxito.');
    } catch (err: any) {
      alert(`Error al actualizar el nombre: ${err.message}`);
    }
  };

  const handleJoinDemoGroup = () => {
    try {
      dbClient.initialize();
      const allGrupos = dbClient.getGrupos();
      if (allGrupos.length === 0) {
        const col = dbClient.createColegio('Colegio Nacional de Pruebas', null, { nit: '999-9', direccion: 'Calle Demo', telefono: '123' });
        const grp = dbClient.createGrupo(col.id, 'Grupo Demo 11-01');
        dbClient.updateUsuarioGrupo(currentUser.id, grp.id);
      } else {
        dbClient.updateUsuarioGrupo(currentUser.id, allGrupos[0].id);
      }
      loadStudentData();
    } catch (err: any) {
      alert('Error al unirse al grupo de pruebas: ' + err.message);
    }
  };

  useEffect(() => {
    loadStudentData();
  }, [currentUser]);

  // Handle countdown timer for active exam
  useEffect(() => {
    if (!activeSimulacro || isPaused) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Auto-submit
          handleAutoSubmit(activeSimulacro.id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeSimulacro, isPaused]);

  const loadStudentData = () => {
    dbClient.initialize();
    const allGrupos = dbClient.getGrupos();
    const allColegios = dbClient.getColegios();
    const allSimulacros = dbClient.getSimulacros();
    const allResultados = dbClient.getResultados();
    const allPreguntas = dbClient.getPreguntas();

    // Find student associations
    if (currentUser.grupo_id) {
      const studentGrp = allGrupos.find(g => g.id === currentUser.grupo_id);
      if (studentGrp) {
        setGrupo(studentGrp);
        const studentCol = allColegios.find(c => c.id === studentGrp.colegio_id);
        if (studentCol) {
          setColegio(studentCol);
        }
      }
    }

    // Filter student records
    const studentSims = allSimulacros.filter(s => s.estudiante_id === currentUser.id);
    setSimulacros(studentSims);
    setResultados(allResultados);

    // If there is an active exam, restore it
    const active = studentSims.find(s => s.estado === 'en_progreso');
    if (active) {
      setActiveSimulacro(active);
      setSelectedAnswers(active.respuestas_json as Record<string, 'A' | 'B' | 'C' | 'D'>);
      
      // Load actual questions objects
      const activeQ = allPreguntas.filter(q => active.preguntas_ids.includes(q.id));
      // Re-order to match active.preguntas_ids array order
      const orderedQ = active.preguntas_ids.map(id => activeQ.find(q => q.id === id)).filter(Boolean) as Pregunta[];
      
      setCurrentQuestions(orderedQ);
      setCurrentQuestionIdx(0);

      // Restore time left (based on 3 minutes per question from start time)
      const totalSeconds = active.preguntas_ids.length * 3 * 60;
      const elapsedSeconds = Math.floor((Date.now() - new Date(active.fecha_inicio).getTime()) / 1000);
      const remaining = Math.max(0, totalSeconds - elapsedSeconds);
      if (remaining === 0) {
        handleAutoSubmit(active.id);
      } else {
        setTimeLeft(remaining);
      }
    }
  };

  // Start new exam
  const handleStartExam = () => {
    if (!currentUser.grupo_id) return;

    try {
      // Get config from localStorage
      const savedConfig = localStorage.getItem('db_exam_config');
      const configuracion = savedConfig ? JSON.parse(savedConfig) : {
        'Matemáticas': 10,
        'Ciencias Naturales': 10,
        'Ciencias Sociales': 10,
        'Lectura Crítica': 10,
        'Inglés': 10
      };

      const newSim = dbClient.createSimulacro(currentUser.id, configuracion);
      setActiveSimulacro(newSim);
      setSelectedAnswers({});
      const totalSeconds = newSim.preguntas_ids.length * 3 * 60;
      setTimeLeft(totalSeconds);
      
      // Load questions
      const allQ = dbClient.getPreguntas();
      const activeQ = allQ.filter(q => newSim.preguntas_ids.includes(q.id));
      const orderedQ = newSim.preguntas_ids.map(id => activeQ.find(q => q.id === id)).filter(Boolean) as Pregunta[];
      
      setCurrentQuestions(orderedQ);
      setCurrentQuestionIdx(0);
      loadStudentData();
    } catch (err: any) {
      alert(`Error al iniciar examen: ${err.message}`);
    }
  };

  // Answer selection
  const handleSelectAnswer = (preguntaId: string, opcion: 'A' | 'B' | 'C' | 'D') => {
    if (!activeSimulacro) return;

    const updated = {
      ...selectedAnswers,
      [preguntaId]: opcion
    };
    setSelectedAnswers(updated);
    
    // Save to LocalStorage DB immediately
    dbClient.guardarRespuestasExamen(activeSimulacro.id, updated);

    // Clear any existing auto-advance timer to prevent overlaps
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
    }

    // Auto-advance to the next question with a smooth 350ms delay for visual feedback
    if (currentQuestionIdx < currentQuestions.length - 1) {
      autoAdvanceTimeoutRef.current = setTimeout(() => {
        setCurrentQuestionIdx(prev => prev + 1);
      }, 350);
    }
  };

  const handleAutoSubmit = (simulacroId: string) => {
    try {
      dbClient.finalizarSimulacro(simulacroId);
      setActiveSimulacro(null);
      setViewingResultadoSimId(simulacroId);
      loadStudentData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmitExamManual = () => {
    if (!activeSimulacro) return;

    try {
      dbClient.finalizarSimulacro(activeSimulacro.id);
      const simId = activeSimulacro.id;
      setActiveSimulacro(null);
      setShowConfirmModal(false);
      setViewingResultadoSimId(simId);
      loadStudentData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // PDF Report Exporter
  const handleDownloadPDF = async () => {
    const reportElem = document.getElementById('icfes-report-card');
    if (!reportElem) return;

    setPdfGenerating(true);
    try {
      const canvas = await html2canvas(reportElem, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210; // A4 width
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdf.save(`Reporte_ICFES_${currentUser.email.split('@')[0]}.pdf`);
    } catch (e) {
      console.error('Error generating PDF:', e);
    } finally {
      setPdfGenerating(false);
    }
  };

  // Format Timer
  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculated variables for results view
  const currentViewedSim = simulacros.find(s => s.id === viewingResultadoSimId);
  const currentViewedResults = resultados.filter(r => r.simulacro_id === viewingResultadoSimId);
  
  let globalScore = 0;
  if (currentViewedResults.length > 0) {
    const sum = currentViewedResults.reduce((acc, curr) => acc + curr.puntaje_obtenido, 0);
    globalScore = Math.round(sum / currentViewedResults.length);
  }

  // General dashboard metrics
  const finishedSims = simulacros.filter(s => s.estado === 'terminado');

  let averageScore = 0;
  let maxScore = 0;

  if (finishedSims.length > 0) {
    const scores = finishedSims.map(sim => {
      const simResults = resultados.filter(r => r.simulacro_id === sim.id);
      if (simResults.length === 0) return 0;
      return simResults.reduce((acc, c) => acc + c.puntaje_obtenido, 0) / simResults.length;
    });

    averageScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    maxScore = Math.round(Math.max(...scores));
  }

  // Dynamic Gamification calculations
  const totalXP = resultados.filter(r => simulacros.map(s => s.id).includes(r.simulacro_id)).reduce((acc, curr) => acc + curr.puntaje_obtenido * 5, 0) + finishedSims.length * 200;
  const currentLevel = Math.floor(totalXP / 1000) + 1;
  const xpInCurrentLevel = totalXP % 1000;
  const xpProgressPercent = (xpInCurrentLevel / 1000) * 100;

  const calculateStreak = () => {
    if (simulacros.length === 0) return 0;
    const dates = simulacros.map(s => new Date(s.fecha_inicio).toDateString());
    const uniqueDates = Array.from(new Set(dates)).map(d => new Date(d));
    uniqueDates.sort((a, b) => b.getTime() - a.getTime());

    let streak = 0;
    const today = new Date();
    today.setHours(0,0,0,0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (uniqueDates[0] && uniqueDates[0].getTime() < yesterday.getTime()) {
      return 0;
    }

    let expectedDate = today;
    if (uniqueDates[0] && uniqueDates[0].getTime() === yesterday.getTime()) {
      expectedDate = yesterday;
    }

    for (let i = 0; i < uniqueDates.length; i++) {
      const currentDate = uniqueDates[i];
      currentDate.setHours(0,0,0,0);
      if (currentDate.getTime() === expectedDate.getTime()) {
        streak++;
        expectedDate.setDate(expectedDate.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  };

  const rachaDias = calculateStreak();

  const achievements = [
    { id: 'constancia', title: 'Constancia Pura', desc: 'Presenta 3 o más simulacros.', unlocked: finishedSims.length >= 3, icon: '📅' },
    { id: 'einstein', title: 'Einstein de Grado', desc: 'Promedio general superior a 85.', unlocked: averageScore >= 85, icon: '⚡' },
    { id: 'matematicas', title: 'Calculadora Humana', desc: 'Acierta 90+ en Matemáticas.', unlocked: resultados.some(r => r.componente === 'Matemáticas' && r.puntaje_obtenido >= 90), icon: '🧮' },
    { id: 'lectura', title: 'Lector Voraz', desc: 'Acierta 90+ en Lectura Crítica.', unlocked: resultados.some(r => r.componente === 'Lectura Crítica' && r.puntaje_obtenido >= 90), icon: '📚' }
  ];
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  const drawRadarChart = () => {
    const componentsList = ['Matemáticas', 'Lectura Crítica', 'Ciencias Naturales', 'Ciencias Sociales', 'Inglés'] as const;
    
    const averages = componentsList.map((comp) => {
      const compResults = resultados.filter(r => r.componente === comp);
      if (compResults.length === 0) return 60; // baseline visually attractive
      const sum = compResults.reduce((acc, curr) => acc + curr.puntaje_obtenido, 0);
      return Math.max(10, Math.round(sum / compResults.length));
    });

    const width = 280;
    const height = 240;
    const cx = width / 2;
    const cy = height / 2;
    const rMax = 80;

    const getPoints = (scores: number[]) => {
      return scores.map((score, i) => {
        const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        const dist = (score / 100) * rMax;
        const x = cx + dist * Math.cos(angle);
        const y = cy + dist * Math.sin(angle);
        return `${x},${y}`;
      }).join(' ');
    };

    const polyPoints = getPoints(averages);
    const gridScales = [0.25, 0.5, 0.75, 1];
    
    return (
      <svg width={width} height={height} style={{ overflow: 'visible', margin: '0 auto', display: 'block' }}>
        {gridScales.map((scale, idx) => (
          <polygon
            key={idx}
            points={componentsList.map((_, i) => {
              const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
              const x = cx + rMax * scale * Math.cos(angle);
              const y = cy + rMax * scale * Math.sin(angle);
              return `${x},${y}`;
            }).join(' ')}
            fill="none"
            stroke="var(--border-color)"
            strokeWidth="1"
            strokeDasharray={idx < 3 ? '4,4' : 'none'}
          />
        ))}
        
        {componentsList.map((_, i) => {
          const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
          const x = cx + rMax * Math.cos(angle);
          const y = cy + rMax * Math.sin(angle);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="var(--border-color)"
              strokeWidth="1"
            />
          );
        })}

        {finishedSims.length > 0 && (
          <polygon
            points={polyPoints}
            fill="rgba(255, 81, 0, 0.2)"
            stroke="var(--color-primary)"
            strokeWidth="2.5"
            className="animate-scale-up"
          />
        )}

        {componentsList.map((comp, i) => {
          const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
          const dist = rMax + 18;
          const x = cx + dist * Math.cos(angle);
          const y = cy + dist * Math.sin(angle);
          
          let textAnchor: "inherit" | "end" | "start" | "middle" | undefined = 'middle';
          if (Math.cos(angle) > 0.1) textAnchor = 'start';
          else if (Math.cos(angle) < -0.1) textAnchor = 'end';

          return (
            <g key={comp}>
              <text
                x={x}
                y={y + 4}
                textAnchor={textAnchor}
                fill="var(--text-muted)"
                fontSize="10"
                fontWeight="700"
                fontFamily="var(--font-main)"
              >
                {comp.split(' ')[0]}
              </text>
              <text
                x={x}
                y={y + 14}
                textAnchor={textAnchor}
                fill="var(--text-title)"
                fontSize="9"
                fontWeight="800"
                fontFamily="var(--font-main)"
              >
                {averages[i]}%
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div style={{ flex: 1, backgroundColor: 'var(--bg-app)', display: 'flex', flexDirection: 'column' }}>
      
      {/* ----------------------------------------------------
          ACTIVE EXAM SCREEN
          ---------------------------------------------------- */}
      {activeSimulacro && currentQuestions.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          {isPaused && (
            <div className="pause-overlay">
              <Clock size={48} style={{ color: 'var(--color-primary)', strokeWidth: 3 }} />
              <h2 style={{ color: '#ffffff' }}>Simulacro Pausado</h2>
              <p style={{ opacity: 0.8, fontSize: '0.9rem' }}>El tiempo y las preguntas están congelados. Puedes reanudar cuando estés listo.</p>
              <button onClick={() => setIsPaused(false)} className="btn btn-primary btn-lg">
                Reanudar Simulacro
              </button>
            </div>
          )}
          
          {/* Distraction-Free Topbar */}
          <div className="student-header" style={{ 
            display: isFocusMode ? 'flex' : 'grid', 
            gridTemplateColumns: isFocusMode ? 'none' : '1fr auto 1fr', 
            justifyContent: isFocusMode ? 'center' : 'space-between',
            alignItems: 'center', 
            width: '100%', 
            padding: '1rem 3rem',
            gap: '1.5rem',
            backgroundColor: 'var(--bg-card)',
            borderBottom: '1px solid var(--border-color)'
          }}>
            {/* Left Block: Title info */}
            {!isFocusMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span className="user-avatar" style={{ backgroundColor: 'var(--color-primary-light)' }}>
                  <BookOpen size={16} />
                </span>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-title)' }}>Simulacro ICFES en Curso</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', margin: 0 }}>
                    Estudiante: {currentUser.email}
                  </p>
                </div>
              </div>
            )}

            {/* Center Block: Timer & Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifySelf: 'center' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                backgroundColor: 'var(--bg-warning-light)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                padding: '0.45rem 1rem',
                borderRadius: '9999px',
                color: 'var(--color-warning)',
                fontWeight: 'bold',
                fontSize: '0.85rem'
              }}>
                <Clock size={16} />
                <span className="font-mono">{formatTime(timeLeft)}</span>
              </div>

              <button 
                onClick={() => setIsPaused(true)} 
                className="btn btn-secondary btn-sm"
              >
                Pausar Examen
              </button>

              <button 
                onClick={() => setShowConfirmModal(true)} 
                className="btn btn-success btn-sm"
              >
                Finalizar Examen
              </button>

              {/* Focus Toggle */}
              <button 
                onClick={() => setIsFocusMode(!isFocusMode)}
                className={`btn btn-sm ${isFocusMode ? 'btn-primary' : 'btn-secondary'}`}
                title={isFocusMode ? 'Salir de Modo Enfoque' : 'Activar Modo Enfoque'}
              >
                <Zap size={14} style={{ color: isFocusMode ? '#ffffff' : 'var(--color-primary)' }} />
                {isFocusMode ? 'Enfoque Activo' : 'Enfoque'}
              </button>
            </div>

            {/* Right Block: Progress bar */}
            {!isFocusMode && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                <div style={{ width: '180px', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-title)' }}>
                    <span>Progreso:</span>
                    <span>
                      {Object.keys(selectedAnswers).length} de {currentQuestions.length}
                    </span>
                  </div>
                  <div className="progress-container">
                    <div 
                      className="progress-bar" 
                      style={{ width: `${(Object.keys(selectedAnswers).length / currentQuestions.length) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Exam core layout */}
          <div className="main-content" style={{ flex: 1, padding: '2rem 4rem' }}>
            <div className="exam-layout">
              {/* Question panel */}
              <div className="exam-question-area">
                <div 
                  key={currentQuestions[currentQuestionIdx].id} 
                  className="question-text-panel animate-fade-in"
                >
                  <div className="question-pre-header">
                    <span className="badge badge-primary">
                      Pregunta {currentQuestionIdx + 1} de {currentQuestions.length}
                    </span>
                    <span className="badge badge-success">
                      Área: {currentQuestions[currentQuestionIdx].componente}
                    </span>
                  </div>

                  <div className="question-body">
                    {currentQuestions[currentQuestionIdx].texto_pregunta}
                  </div>

                  {/* Answers buttons list */}
                  <div className="options-list">
                    {(Object.keys(currentQuestions[currentQuestionIdx].opciones_json) as Array<'A' | 'B' | 'C' | 'D'>).map((key) => {
                      const text = currentQuestions[currentQuestionIdx].opciones_json[key];
                      const isSelected = selectedAnswers[currentQuestions[currentQuestionIdx].id] === key;

                      return (
                        <button
                          key={key}
                          onClick={() => handleSelectAnswer(currentQuestions[currentQuestionIdx].id, key)}
                          className={`option-btn ${isSelected ? 'selected' : ''}`}
                        >
                          <div className="option-letter">{key}</div>
                          <div style={{ fontWeight: isSelected ? 600 : 'normal' }}>{text}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Integrated Central Navigation Control Capsule */}
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '1.5rem',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    padding: '0.5rem 1rem',
                    borderRadius: '9999px',
                    boxShadow: 'var(--shadow-sm)'
                  }}>
                    <button
                      disabled={currentQuestionIdx === 0}
                      onClick={() => setCurrentQuestionIdx(prev => prev - 1)}
                      className="btn btn-secondary"
                      style={{
                        width: '2.25rem',
                        height: '2.25rem',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        backgroundColor: 'var(--bg-app)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-title)',
                        cursor: currentQuestionIdx === 0 ? 'not-allowed' : 'pointer',
                        opacity: currentQuestionIdx === 0 ? 0.4 : 1,
                        transition: 'all 0.2s'
                      }}
                      title="Pregunta anterior"
                    >
                      <ArrowLeft size={16} />
                    </button>

                    <span style={{
                      fontSize: '0.825rem',
                      fontWeight: 600,
                      color: 'var(--text-title)',
                      minWidth: '120px',
                      textAlign: 'center',
                      userSelect: 'none'
                    }}>
                      Pregunta {currentQuestionIdx + 1} de {currentQuestions.length}
                    </span>

                    <button
                      disabled={currentQuestionIdx === currentQuestions.length - 1}
                      onClick={() => setCurrentQuestionIdx(prev => prev + 1)}
                      className="btn btn-secondary"
                      style={{
                        width: '2.25rem',
                        height: '2.25rem',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        backgroundColor: 'var(--bg-app)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-title)',
                        cursor: currentQuestionIdx === currentQuestions.length - 1 ? 'not-allowed' : 'pointer',
                        opacity: currentQuestionIdx === currentQuestions.length - 1 ? 0.4 : 1,
                        transition: 'all 0.2s'
                      }}
                      title="Siguiente pregunta"
                    >
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Questions navigation grid */}
              <div className="exam-nav-panel">
                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Estructura de Examen</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: 0 }}>
                  Haz clic sobre cualquier número para saltar directo a la pregunta.
                </p>

                <div className="grid-navigation">
                  {currentQuestions.map((q, idx) => {
                    const isAnswered = !!selectedAnswers[q.id];
                    const isCurrent = idx === currentQuestionIdx;
                    
                    return (
                      <div
                        key={q.id}
                        onClick={() => setCurrentQuestionIdx(idx)}
                        className={`nav-box ${isAnswered ? 'answered' : ''} ${isCurrent ? 'current' : ''}`}
                      >
                        {idx + 1}
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
                    <div className="nav-box answered" style={{ width: '1.25rem', height: '1.25rem', cursor: 'default' }} />
                    <span>Pregunta Respondida</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
                    <div className="nav-box" style={{ width: '1.25rem', height: '1.25rem', cursor: 'default' }} />
                    <span>Pregunta Pendiente</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Confirm Submission Modal */}
          {showConfirmModal && (
            <div className="modal-overlay">
              <div className="modal-content">
                <div className="modal-title-box" style={{ color: 'var(--color-warning-hover)' }}>
                  <AlertTriangle size={24} />
                  <h3>¿Finalizar el Simulacro?</h3>
                </div>
                <p style={{ color: 'var(--text-main)', fontSize: '0.875rem' }}>
                  Estás a punto de entregar y calificar tu simulacro ICFES. Una vez enviado, las respuestas se consolidarán y no podrás modificarlas.
                </p>
                <div style={{ 
                  backgroundColor: 'var(--bg-app)', 
                  padding: '1rem', 
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.875rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.375rem'
                }}>
                  <span>Total Preguntas del Examen: <strong>{currentQuestions.length}</strong></span>
                  <span>Preguntas Respondidas: <strong style={{ color: 'var(--color-primary)' }}>{Object.keys(selectedAnswers).length}</strong></span>
                  <span>Preguntas Sin Contestar: <strong style={{ color: 'var(--color-error)' }}>{currentQuestions.length - Object.keys(selectedAnswers).length}</strong></span>
                </div>
                <div className="modal-footer">
                  <button onClick={() => setShowConfirmModal(false)} className="btn btn-secondary">
                    Volver al Examen
                  </button>
                  <button onClick={handleSubmitExamManual} className="btn btn-success">
                    Entregar y Calificar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : viewingResultadoSimId && currentViewedSim ? (
        /* ----------------------------------------------------
            EXAM RESULT / ICFES REPORT SHEET
            ---------------------------------------------------- */
        <div className="main-content" style={{ maxWidth: '900px', margin: '0 auto', width: '100%', padding: '2rem 1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <button 
              onClick={() => setViewingResultadoSimId(null)} 
              className="btn btn-secondary btn-sm"
            >
              <ArrowLeft size={16} />
              Volver al Panel Estudiante
            </button>

            <button 
              onClick={handleDownloadPDF} 
              disabled={pdfGenerating}
              className="btn btn-primary"
            >
              <Download size={18} />
              {pdfGenerating ? 'Generando PDF...' : 'Descargar Reporte (PDF)'}
            </button>
          </div>

          {/* ICFES Report Card (Captured by HTML2Canvas) */}
          <div id="icfes-report-card" className="report-card-container">
            <div className="report-header">
              <div className="report-title-sec">
                <h2>PRUEBAS SIMULACRO ICFES</h2>
                <span className="report-subtitle">Reporte Individual de Resultados</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                  ESTADO: CALIFICADO
                </span>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem', marginBottom: 0 }}>
                  Fecha: <span className="font-mono">{new Date(currentViewedSim.fecha_fin || '').toLocaleDateString()}</span>
                </p>
              </div>
            </div>

            {/* Student metadata info */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(2, 1fr)', 
              gap: '1rem', 
              marginBottom: '2.5rem',
              backgroundColor: 'var(--bg-sidebar)',
              padding: '1.25rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              fontSize: '0.85rem'
            }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Estudiante:</span>
                <p style={{ fontWeight: 'bold', margin: 0 }}>{currentUser.email}</p>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Institución Educativa:</span>
                <p style={{ fontWeight: 'bold', margin: 0 }}>
                  {colegio ? colegio.nombre : 'Colegio Distrital Jaime Colombia'}
                </p>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Grupo Académico:</span>
                <p style={{ fontWeight: 'bold', margin: 0 }}>
                  {grupo ? grupo.nombre_grupo : 'Grado 11-01'}
                </p>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>ID de Examen:</span>
                <p className="font-mono" style={{ margin: 0 }}>{currentViewedSim.id.substring(0, 8)}</p>
              </div>
            </div>

            {/* Score Grid layout */}
            <div className="report-grid-scores">
              {/* Global score bubble */}
              <div className="global-score-box">
                <span className="global-score-lbl">Puntaje Global</span>
                <span className="global-score-number">{globalScore}</span>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  Sobre 100 puntos
                </span>
              </div>

              {/* Component breakdown bars */}
              <div className="component-bars-container">
                <h3 style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>Puntajes por Componente Académico</h3>
                {currentViewedResults.map((res) => {
                  return (
                    <div key={res.id} className="bar-row">
                      <div className="bar-row-info">
                        <span>{res.componente}</span>
                        <span className="font-mono" style={{ color: 'var(--color-primary-light)' }}>{res.puntaje_obtenido} / 100</span>
                      </div>
                      <div className="score-bar-bg">
                        <div 
                          className="score-bar-fill" 
                          style={{ width: `${res.puntaje_obtenido}%` }} 
                        />
                        <span className="score-bar-text">
                          {res.puntaje_obtenido >= 80 ? 'Superior' : res.puntaje_obtenido >= 50 ? 'Medio' : 'Insuficiente'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Official explanation block */}
            <div style={{ 
              borderTop: '1px solid var(--border-color)', 
              paddingTop: '1.5rem',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              lineHeight: 1.6
            }}>
              <p style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-title)' }}>
                INFORMACIÓN METODOLÓGICA DE CALIFICACIÓN
              </p>
              <p>
                Los puntajes individuales por componente se presentan en una escala estándar de 0 a 100 puntos. El puntaje global corresponde al promedio ponderado de los componentes evaluados. Estos resultados son diagnósticos e indicativos de preparación para la prueba de Estado SABER 11 de la República de Colombia.
              </p>
          </div>
        </div>

        {/* Detailed Review Section (Not included in printed PDF) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
            <button 
              onClick={() => {
                setShowDetailedReview(prev => !prev);
              }} 
              className="btn btn-accent"
              style={{ alignSelf: 'flex-start' }}
            >
              {showDetailedReview ? 'Ocultar Revisión de Respuestas' : 'Revisar Respuestas Detalladas'}
            </button>

            {showDetailedReview && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
                <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Desglose de Preguntas Evaluadas</h3>
                {(() => {
                  const allPreguntas = dbClient.getPreguntas();
                  const viewedQuestions = currentViewedSim 
                    ? currentViewedSim.preguntas_ids.map(id => allPreguntas.find(q => q.id === id)).filter(Boolean) as Pregunta[]
                    : [];
                  const viewedAnswers = currentViewedSim 
                    ? (currentViewedSim.respuestas_json as Record<string, 'A' | 'B' | 'C' | 'D'>)
                    : {};

                  return viewedQuestions.map((q, idx) => {
                    const studentAnswer = viewedAnswers[q.id];
                    const isCorrect = studentAnswer === q.respuesta_correcta;

                    return (
                      <div key={q.id} className="review-question-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="badge badge-primary">Pregunta {idx + 1}</span>
                          <span className={`badge ${isCorrect ? 'badge-success' : studentAnswer ? 'badge-danger' : 'badge-warning'}`}>
                            {isCorrect ? 'Correcta' : studentAnswer ? 'Incorrecta' : 'Sin Responder'}
                          </span>
                        </div>
                        
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-title)', marginTop: '0.5rem' }}>
                          {q.texto_pregunta}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                          {(Object.keys(q.opciones_json) as Array<'A' | 'B' | 'C' | 'D'>).map((key) => {
                            const isOpcionSelected = studentAnswer === key;
                            const isOpcionCorrect = q.respuesta_correcta === key;
                            
                            let optClass = 'review-option';
                            if (isOpcionSelected && isCorrect) optClass += ' correct';
                            else if (isOpcionSelected && !isCorrect) optClass += ' incorrect';
                            else if (isOpcionCorrect) optClass += ' correct';

                            return (
                              <div key={key} className={optClass}>
                                <div style={{
                                  width: '1.75rem',
                                  height: '1.75rem',
                                  borderRadius: '50%',
                                  border: '1px solid currentColor',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 'bold',
                                  fontSize: '0.8rem',
                                  flexShrink: 0
                                }}>
                                  {key}
                                </div>
                                <div>{q.opciones_json[key]}</div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="review-explanation">
                          <strong>Explicación Académica:</strong> Analiza el texto de la pregunta para contrastar las afirmaciones lógicas y justificar la validez de la opción correcta (Nivel de Dificultad: {q.dificultad}).
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ----------------------------------------------------
            STUDENT STANDARD DASHBOARD
            ---------------------------------------------------- */
        <>
          {/* Header student dashboard */}
          <div className="student-header" style={{ padding: '1rem 3rem', backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div className="user-avatar" style={{ backgroundColor: 'var(--bg-orange-light)', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                {(currentUser.nombre_completo || currentUser.email).substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h2 style={{ fontSize: '1.2rem', margin: 0, fontWeight: 700, color: 'var(--text-title)' }}>
                    {currentUser.nombre_completo || currentUser.email}
                  </h2>
                  <button 
                    onClick={handleOpenEditProfile}
                    style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.2rem' }}
                    title="Editar Nombre"
                  >
                    <Edit size={14} />
                  </button>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
                  {currentUser.nombre_completo ? `${currentUser.email} • ` : ''}
                  {colegio ? `${colegio.nombre} | ${grupo?.nombre_grupo || 'Sin Grupo'}` : 'Estudiante sin Institución'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button 
                onClick={() => setIsTourOpen(true)} 
                className="btn btn-secondary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
              >
                <Info size={14} />
                Guía de Uso
              </button>
              <button onClick={onLogout} className="btn btn-secondary btn-sm">
                <LogOut size={14} />
                Cerrar Sesión
              </button>
            </div>
          </div>

          <div className="main-content" style={{ padding: '2rem 3rem', overflowY: 'auto' }}>
            
            {/* Student Floating Warning */}
            {!currentUser.grupo_id && (
              <div className="card" style={{ 
                backgroundColor: 'var(--bg-warning-alert)', 
                borderColor: 'var(--color-warning)', 
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                padding: '1.5rem',
                marginBottom: '1.5rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div className="metric-icon-box" style={{ backgroundColor: 'var(--bg-orange-light)', color: 'var(--color-orange)', width: '2.5rem', height: '2.5rem', flexShrink: 0 }}>
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h4 style={{ color: 'var(--text-title)', margin: 0 }}>Asignación Académica Pendiente</h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
                      Tu usuario no se encuentra matriculado en ningún colegio o grupo del sistema para realizar exámenes simulacros oficiales.
                    </p>
                  </div>
                </div>
                <button onClick={handleJoinDemoGroup} className="btn btn-primary" style={{ flexShrink: 0 }}>
                  Unirse a Grupo de Pruebas Público
                </button>
              </div>
            )}

            {/* Welcome & Gamification Board */}
            {currentUser.grupo_id && (
              <div className="welcome-card" id="tour-student-welcome" style={{ padding: '1.5rem 2rem', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '2rem', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                      Nivel {currentLevel}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {totalXP} XP totales acumulados
                    </span>
                  </div>
                  <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, color: 'var(--color-primary)' }}>
                    ¡Sigue progresando en tu preparación!
                  </h1>
                  
                  {/* XP Level Progress Bar */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600 }}>
                      <span style={{ color: 'var(--text-main)' }}>Progreso de Nivel</span>
                      <span style={{ color: 'var(--text-title)', fontWeight: 700 }}>{xpInCurrentLevel} / 1000 XP</span>
                    </div>
                    <div className="progress-container" style={{ height: '0.75rem', backgroundColor: 'var(--border-color)' }}>
                      <div 
                        className="progress-bar" 
                        style={{ width: `${xpProgressPercent}%`, background: 'linear-gradient(90deg, var(--color-primary) 0%, #ff8b33 100%)' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Side Streaks / Achieved widgets */}
                <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'flex-end' }}>
                  <div id="tour-student-streak" className="metric-card" style={{ padding: '1rem', minWidth: '130px', boxShadow: 'none', background: 'var(--bg-app)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                    <Flame size={28} style={{ color: rachaDias > 0 ? 'var(--color-primary)' : 'var(--text-muted)' }} className={rachaDias > 0 ? 'animate-float' : ''} />
                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-title)' }}>{rachaDias} días</span>
                    <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'bold' }}>Racha de Estudio</span>
                  </div>

                  <div id="tour-student-logros" className="metric-card" style={{ padding: '1rem', minWidth: '130px', boxShadow: 'none', background: 'var(--bg-app)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                    <Award size={28} style={{ color: 'var(--color-blue)' }} />
                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-title)' }}>{unlockedCount} / {achievements.length}</span>
                    <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'bold' }}>Logros Ganados</span>
                  </div>
                </div>
              </div>
            )}

            {/* Dashboard metrics grid */}
            {currentUser.grupo_id && (
              <div id="tour-student-metrics" className="grid-metrics" style={{ marginBottom: '1.5rem' }}>
                <div className="metric-card">
                  <div className="metric-icon-box" style={{ backgroundColor: 'var(--bg-blue-light)', color: 'var(--color-blue)' }}>
                    <BookOpen size={22} />
                  </div>
                  <div className="metric-details">
                    <span className="metric-lbl">Simulacros Totales</span>
                    <span className="metric-val">{simulacros.length}</span>
                    <span className="metric-footer" style={{ color: 'var(--color-green)' }}>✓ Intentos registrados</span>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-icon-box" style={{ backgroundColor: 'var(--bg-orange-light)', color: 'var(--color-orange)' }}>
                    <Award size={22} />
                  </div>
                  <div className="metric-details">
                    <span className="metric-lbl">Puntaje Máximo</span>
                    <span className="metric-val">{maxScore} / 100</span>
                    <span className="metric-footer" style={{ color: 'var(--color-green)' }}>✓ Mejor calificación</span>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-icon-box" style={{ backgroundColor: 'var(--bg-green-light)', color: 'var(--color-green)' }}>
                    <TrendingUp size={22} />
                  </div>
                  <div className="metric-details">
                    <span className="metric-lbl">Puntaje Promedio</span>
                    <span className="metric-val">{averageScore} / 100</span>
                    <span className="metric-footer" style={{ color: 'var(--color-green)' }}>✓ Rendimiento global</span>
                  </div>
                </div>
              </div>
            )}

            {/* Two Column Grid */}
            {currentUser.grupo_id && (
              <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '1.5rem' }}>
                {/* Left Column: Action & History */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {/* Simulator Action Panel */}
                  <div id="tour-student-simulator" className="card" style={{ borderLeft: '5px solid var(--color-primary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h3 style={{ margin: 0, color: 'var(--color-primary)' }}>Presentar Simulacro ICFES</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem', margin: 0 }}>
                          Evaluación diagnóstica adaptada al diseño y tiempos del examen oficial SABER 11.
                        </p>
                      </div>
                      <button onClick={handleStartExam} className="btn btn-primary btn-lg">
                        <Play size={18} />
                        Comenzar Simulacro
                      </button>
                    </div>
                  </div>

                  {/* Exam History list */}
                  <div id="tour-student-history" className="card">
                    <h3 className="card-title">
                      <GraduationCap size={20} style={{ color: 'var(--color-secondary)' }} />
                      Historial de Mis Simulacros
                    </h3>

                    {simulacros.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        <Info size={32} style={{ margin: '0 auto 0.75rem', display: 'block' }} />
                        <p>Aún no has presentado ningún simulacro. ¡Haz clic en "Comenzar" arriba para iniciar tu primera prueba!</p>
                      </div>
                    ) : (
                      <div className="table-container">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Fecha</th>
                              <th>Estado</th>
                              <th>Preguntas</th>
                              <th>Puntaje</th>
                              <th>Acción</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...simulacros].reverse().map((sim) => {
                              const simResults = resultados.filter(r => r.simulacro_id === sim.id);
                              
                              let score = 0;
                              if (simResults.length > 0) {
                                const sum = simResults.reduce((acc, curr) => acc + curr.puntaje_obtenido, 0);
                                score = Math.round(sum / simResults.length);
                              }

                              return (
                                <tr key={sim.id}>
                                  <td>{new Date(sim.fecha_inicio).toLocaleString()}</td>
                                  <td>
                                    <span className={`badge ${sim.estado === 'terminado' ? 'badge-success' : 'badge-warning'}`}>
                                      {sim.estado === 'terminado' ? 'Finalizado' : 'En Progreso'}
                                    </span>
                                  </td>
                                  <td>{sim.preguntas_ids.length}</td>
                                  <td>
                                    {sim.estado === 'terminado' ? (
                                      <strong>{score} / 100</strong>
                                    ) : (
                                      <span style={{ color: 'var(--text-muted)' }}>--</span>
                                    )}
                                  </td>
                                  <td>
                                    {sim.estado === 'terminado' ? (
                                      <button
                                        onClick={() => setViewingResultadoSimId(sim.id)}
                                        className="btn btn-secondary btn-sm"
                                        style={{ padding: '0.25rem 0.75rem' }}
                                      >
                                        Ver Reporte
                                        <ChevronRight size={14} />
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setActiveSimulacro(sim);
                                          loadStudentData();
                                        }}
                                        className="btn btn-warning btn-sm"
                                        style={{ padding: '0.25rem 0.75rem' }}
                                      >
                                        Reanudar
                                        <Play size={14} />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Radial Profile & Achievements */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {/* Radial Pentagon Profiler */}
                  <div className="card" id="tour-student-radar">
                    <h3 className="card-title">
                      <Compass size={20} style={{ color: 'var(--color-primary)' }} />
                      Perfil de Competencias
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '-0.75rem', marginBottom: '1rem' }}>
                      Promedio radial obtenido en cada área evaluada Saber 11.
                    </p>
                    <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {drawRadarChart()}
                    </div>
                  </div>

                  {/* Achievements progression */}
                  <div className="card" id="tour-student-achievements">
                    <h3 className="card-title">
                      <Zap size={20} style={{ color: 'var(--color-warning)' }} />
                      Logros Académicos
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {achievements.map((ach) => (
                        <div 
                          key={ach.id} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.75rem', 
                            padding: '0.75rem', 
                            backgroundColor: ach.unlocked ? 'var(--bg-app)' : 'rgba(156, 163, 175, 0.05)',
                            borderRadius: 'var(--radius-sm)',
                            border: ach.unlocked ? '1px solid var(--border-color)' : '1px dashed var(--border-color)',
                            opacity: ach.unlocked ? 1 : 0.65
                          }}
                        >
                          <div style={{ 
                            fontSize: '1.5rem', 
                            width: '2.5rem', 
                            height: '2.5rem', 
                            borderRadius: '50%', 
                            backgroundColor: ach.unlocked ? 'var(--bg-orange-light)' : 'rgba(156, 163, 175, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            {ach.unlocked ? ach.icon : '🔒'}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: ach.unlocked ? 'var(--text-title)' : 'var(--text-muted)' }}>
                              {ach.title}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {ach.desc}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </>
      )}

      {/* Modal: Editar Perfil (Nombre del Estudiante) */}
      {showEditProfileModal && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-content" style={{ maxWidth: '400px', width: '90%' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Editar Perfil</h3>
              <button 
                onClick={() => setShowEditProfileModal(false)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-muted)' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Nombre Completo *</label>
                <input
                  type="text"
                  className="form-control"
                  value={editNombreCompleto}
                  onChange={(e) => setEditNombreCompleto(e.target.value)}
                  placeholder="Ej: Juan Pérez"
                  required
                  autoFocus
                />
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button 
                  type="button" 
                  onClick={() => setShowEditProfileModal(false)} 
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interactive Onboarding Tour */}
      <InteractiveTour 
        steps={studentTourSteps} 
        onComplete={handleTourComplete} 
        isOpen={isTourOpen} 
      />
    </div>
  );
};
