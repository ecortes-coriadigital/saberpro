import React, { useState, useEffect } from 'react';
import { InteractiveTour } from '../components/InteractiveTour';
import type { TourStep } from '../components/InteractiveTour';
import { dbClient, generateUUID } from '../lib/dbClient';
import type { Colegio, Grupo, Usuario, Pregunta, BitacoraError, ComponenteICFES, DificultadPregunta } from '../lib/types';
import * as XLSX from 'xlsx';
import { 
  School, 
  Users, 
  Settings, 
  ShieldAlert, 
  LogOut, 
  Plus, 
  CheckCircle, 
  AlertTriangle,
  ClipboardList, 
  Activity, 
  TrendingUp, 
  HelpCircle,
  Mail,
  Download,
  Upload,
  Edit,
  Trash2
} from 'lucide-react';

interface AdminDashboardViewProps {
  currentUser: Usuario;
  onLogout: () => void;
}

type TabType = 'dashboard' | 'colegios' | 'usuarios' | 'motor' | 'bitacora';

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({ currentUser, onLogout }) => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  
  // Data States
  const [colegios, setColegios] = useState<Colegio[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [simulacros, setSimulacros] = useState<any[]>([]);
  const [resultados, setResultados] = useState<any[]>([]);
  const [bitacora, setBitacora] = useState<BitacoraError[]>([]);
  const [examConfig, setExamConfig] = useState<Record<ComponenteICFES, number>>({
    'Matemáticas': 10,
    'Ciencias Naturales': 10,
    'Ciencias Sociales': 10,
    'Lectura Crítica': 10,
    'Inglés': 10
  });

  // Form States - Colegios & Grupos
  const [newColegioNombre, setNewColegioNombre] = useState('');
  const [newColegioNit, setNewColegioNit] = useState('');
  const [newColegioDireccion, setNewColegioDireccion] = useState('');
  const [newColegioTelefono, setNewColegioTelefono] = useState('');
  const [newColegioDocenteId, setNewColegioDocenteId] = useState<string>(''); // Nuevo: Docente asignado al colegio
  const [newGrupoNombre, setNewGrupoNombre] = useState<Record<string, string>>({}); // colegioId -> grupoNombre

  // Form States - Usuarios
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newNombreCompleto, setNewNombreCompleto] = useState(''); // Nuevo: Nombre completo del usuario
  const [newRol, setNewRol] = useState<Usuario['rol']>('estudiante');
  const [newGrupoId, setNewGrupoId] = useState<string>('');
  
  // Group Assignment for Unassigned Students
  const [selectedUnassignedStudentId, setSelectedUnassignedStudentId] = useState('');
  const [assignGrupoId, setAssignGrupoId] = useState('');

  // UI Alerts
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search Filters
  const [searchColegio, setSearchColegio] = useState('');
  const [searchUsuario, setSearchUsuario] = useState('');
  const [filterColegioId, setFilterColegioId] = useState('');
  const [filterGrupoId, setFilterGrupoId] = useState('');
  const [filterRol, setFilterRol] = useState('');
  const [showGuiaModal, setShowGuiaModal] = useState(false);

  // Excel Preview & Drag/Drop States
  const [isDragging, setIsDragging] = useState(false);
  const [excelPreviewRows, setExcelPreviewRows] = useState<any[]>([]);
  const [showExcelPreviewModal, setShowExcelPreviewModal] = useState(false);

  // Student Excel Upload States (Nuevo)
  const [isStudentDragging, setIsStudentDragging] = useState(false);
  const [studentExcelPreviewRows, setStudentExcelPreviewRows] = useState<any[]>([]);
  const [showStudentExcelPreviewModal, setShowStudentExcelPreviewModal] = useState(false);

  // Edit Colegio States
  const [editingColegio, setEditingColegio] = useState<Colegio | null>(null);
  const [editColegioNombre, setEditColegioNombre] = useState('');
  const [editColegioDocenteId, setEditColegioDocenteId] = useState('');
  const [editColegioNit, setEditColegioNit] = useState('');
  const [editColegioDireccion, setEditColegioDireccion] = useState('');
  const [editColegioTelefono, setEditColegioTelefono] = useState('');

  // Edit Student/User States
  const [editingStudent, setEditingStudent] = useState<Usuario | null>(null);
  const [editStudentNombreCompleto, setEditStudentNombreCompleto] = useState('');

  // Tab & Sub-tab controls (Nuevo)
  const [userSubTab, setUserSubTab] = useState<'activos' | 'bajas'>('activos');
  const [bitacoraSubTab, setBitacoraSubTab] = useState<'errores' | 'accesos'>('errores');

  // Onboarding Tour State
  const [isTourOpen, setIsTourOpen] = useState(false);

  // Derived calculations for Role Access (Docentes filter)
  const isDocente = currentUser.rol === 'docente';

  const visibleColegios = isDocente
    ? colegios.filter(c => c.docente_id === currentUser.id)
    : colegios;

  const visibleGrupos = isDocente
    ? grupos.filter(g => visibleColegios.some(c => c.id === g.colegio_id))
    : grupos;

  const visibleUsuarios = isDocente
    ? usuarios.filter(u => u.rol === 'docente' || (u.rol === 'estudiante' && u.grupo_id && visibleGrupos.some(g => g.id === u.grupo_id)))
    : usuarios;

  const visibleEstudiantes = visibleUsuarios.filter(u => u.rol === 'estudiante');

  const visibleSimulacros = isDocente
    ? simulacros.filter(s => visibleEstudiantes.some(est => est.id === s.estudiante_id))
    : simulacros;


  // Redirigir docentes si intentan acceder a pestañas no autorizadas
  useEffect(() => {
    if (isDocente && (activeTab === 'colegios' || activeTab === 'usuarios' || activeTab === 'bitacora')) {
      setActiveTab('dashboard');
    }
  }, [activeTab, isDocente]);

  useEffect(() => {
    const hasSeen = localStorage.getItem(`tour_completado_admin_${currentUser.id}`);
    if (!hasSeen) {
      setIsTourOpen(true);
    }
  }, [currentUser]);

  const handleTourComplete = () => {
    localStorage.setItem(`tour_completado_admin_${currentUser.id}`, 'true');
    setIsTourOpen(false);
  };

  const adminTourSteps: TourStep[] = [
    {
      targetId: 'tour-admin-sidebar',
      title: 'Menú de Navegación 🧭',
      content: 'Aquí puedes saltar entre el Panel de Control, la gestión escolar y el configurador del sistema.',
      position: 'right',
      actionBeforeStep: () => setActiveTab('dashboard')
    },
    {
      targetId: 'tour-admin-tab-dashboard',
      title: 'Panel de Control 📊',
      content: 'Haz clic aquí para regresar a esta pantalla principal y ver tus estadísticas consolidadas en tiempo real.',
      position: 'right',
      actionBeforeStep: () => setActiveTab('dashboard')
    },
    {
      targetId: 'tour-admin-guide-card',
      title: 'Manual de Onboarding 🦉',
      content: 'Si alguna vez tienes dudas sobre cómo crear colegios o asignar grupos, haz clic aquí para abrir la guía explicativa.',
      position: 'right',
      actionBeforeStep: () => setActiveTab('dashboard')
    },
    {
      targetId: 'tour-admin-history',
      title: 'Historial y Semáforos Predictivos 🚥',
      content: 'Monitorea el puntaje ponderado oficial del ICFES Saber 11 (0-500 puntos) de los alumnos y audita el nivel de alerta escolar.',
      position: 'top',
      actionBeforeStep: () => setActiveTab('dashboard')
    },
    {
      targetId: 'tour-admin-tab-colegios',
      title: 'Colegios y Salones 🏫',
      content: 'Registra instituciones educativas y crea grados escolares (por ejemplo, "11-02") en esta pestaña.',
      position: 'right',
      actionBeforeStep: () => setActiveTab('dashboard')
    },
    {
      targetId: 'tour-admin-tab-usuarios',
      title: 'Gestión de Usuarios 👥',
      content: 'Crea cuentas para docentes o estudiantes, y asocia alumnos flotantes a sus salones de clase.',
      position: 'right',
      actionBeforeStep: () => setActiveTab('dashboard')
    },
    {
      targetId: 'tour-admin-tab-motor',
      title: 'Configurador y Carga Excel ⚙️',
      content: '¡Vamos al motor de exámenes! Aquí configuraremos las limitaciones de preguntas y cargaremos el archivo Excel.',
      position: 'right',
      actionBeforeStep: () => setActiveTab('motor')
    },
    {
      targetId: 'tour-admin-exam-config',
      title: 'Límites de Preguntas por Materia 🛠️',
      content: 'Configura cuántas preguntas por materia se extraerán al azar cuando un estudiante inicie un simulacro.',
      position: 'right',
      actionBeforeStep: () => setActiveTab('motor')
    },
    {
      targetId: 'tour-admin-download-template',
      title: 'Descarga de Plantillas de Excel 📥',
      content: 'Descarga este archivo XLSX de ejemplo para conocer la estructura oficial de columnas necesaria para subir preguntas.',
      position: 'bottom',
      actionBeforeStep: () => setActiveTab('motor')
    },
    {
      targetId: 'tour-admin-upload-zone',
      title: 'Arrastra y Suelta Excel (Drag & Drop) 🗂️',
      content: 'Arrastra tu archivo Excel aquí para previsualizar, validar en tiempo real e importar tus preguntas con un solo clic.',
      position: 'bottom',
      actionBeforeStep: () => setActiveTab('motor')
    }
  ];

  const visibleTourSteps = adminTourSteps.filter(step => {
    if (isDocente) {
      const restrictedIds = [
        'tour-admin-tab-colegios',
        'tour-admin-tab-usuarios'
      ];
      return !restrictedIds.includes(step.targetId);
    }
    return true;
  });

  // Load all data from DB
  const loadData = () => {
    try {
      dbClient.initialize(); // Ensure DB is initialized
      setColegios(dbClient.getColegios());
      setGrupos(dbClient.getGrupos());
      setUsuarios(dbClient.getUsuarios());
      setPreguntas(dbClient.getPreguntas());
      setSimulacros(dbClient.getSimulacros());
      setResultados(dbClient.getResultados());
      setBitacora(dbClient.getBitacoraErrores());

      // Load exam configuration
      const savedConfig = localStorage.getItem('db_exam_config');
      if (savedConfig) {
        setExamConfig(JSON.parse(savedConfig));
      } else {
        localStorage.setItem('db_exam_config', JSON.stringify(examConfig));
      }
    } catch (err: any) {
      triggerError('Error cargando los datos de base de datos local');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const triggerSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 4000);
  };

  const handleStartEditColegio = (col: Colegio) => {
    setEditingColegio(col);
    setEditColegioNombre(col.nombre);
    setEditColegioDocenteId(col.docente_id || '');
    setEditColegioNit(col.metadata.nit || '');
    setEditColegioDireccion(col.metadata.direccion || '');
    setEditColegioTelefono(col.metadata.telefono || '');
  };

  const handleSaveEditColegio = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingColegio) return;
    try {
      dbClient.updateColegio(editingColegio.id, editColegioNombre, editColegioDocenteId || null, {
        nit: editColegioNit,
        direccion: editColegioDireccion,
        telefono: editColegioTelefono
      });
      dbClient.syncToIndexedDb().catch(e => console.error('IndexedDB sync failed:', e));
      triggerSuccess('Colegio actualizado con éxito.');
      setEditingColegio(null);
      loadData();
    } catch (err: any) {
      triggerError(`Error al actualizar el colegio: ${err.message}`);
    }
  };

  const handleStartEditStudent = (student: Usuario) => {
    setEditingStudent(student);
    setEditStudentNombreCompleto(student.nombre_completo || '');
  };

  const handleSaveEditStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    try {
      dbClient.updateUsuarioNombre(editingStudent.id, editStudentNombreCompleto);
      dbClient.syncToIndexedDb().catch(err => console.error('IndexedDB sync failed:', err));
      triggerSuccess('Nombre del usuario actualizado con éxito.');
      setEditingStudent(null);
      loadData();
    } catch (err: any) {
      triggerError(`Error al actualizar el nombre: ${err.message}`);
    }
  };

  const handleDeleteColegio = (id: string, nombre: string) => {
    if (window.confirm(`¿Está seguro de eliminar el colegio "${nombre}"? Esta acción eliminará también sus grupos asociados y desvinculará a sus estudiantes.`)) {
      try {
        dbClient.deleteColegio(id);
        dbClient.syncToIndexedDb().catch(e => console.error('IndexedDB sync failed:', e));
        triggerSuccess('Colegio eliminado con éxito.');
        loadData();
      } catch (err: any) {
        triggerError(`Error al eliminar el colegio: ${err.message}`);
      }
    }
  };

  const handleAssignTeacherInline = (colId: string, docenteId: string) => {
    try {
      const col = colegios.find(c => c.id === colId);
      if (!col) return;
      dbClient.updateColegio(colId, col.nombre, docenteId || null, col.metadata);
      dbClient.syncToIndexedDb().catch(e => console.error('IndexedDB sync failed:', e));
      triggerSuccess('Docente asignado con éxito.');
      loadData();
    } catch (err: any) {
      triggerError(`Error al asignar el docente: ${err.message}`);
    }
  };

  // ----------------------------------------------------
  // CELL 1 ACTIONS: COLEGIOS & GRUPOS
  // ----------------------------------------------------
  const handleCreateColegio = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const docenteIdParam = newColegioDocenteId || null;
      const nuevo = dbClient.createColegio(newColegioNombre, docenteIdParam, {
        nit: newColegioNit,
        direccion: newColegioDireccion,
        telefono: newColegioTelefono
      });
      
      triggerSuccess(`Colegio "${nuevo.nombre}" creado exitosamente.`);
      setNewColegioNombre('');
      setNewColegioNit('');
      setNewColegioDireccion('');
      setNewColegioTelefono('');
      setNewColegioDocenteId('');
      loadData();
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  const handleCreateGrupoInline = (colegioId: string) => {
    const nombre = newGrupoNombre[colegioId];
    if (!nombre || !nombre.trim()) {
      triggerError('El nombre del grupo no puede estar vacío');
      return;
    }

    try {
      dbClient.createGrupo(colegioId, nombre);
      triggerSuccess(`Grupo "${nombre}" creado exitosamente.`);
      setNewGrupoNombre(prev => ({ ...prev, [colegioId]: '' }));
      loadData();
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  // ----------------------------------------------------
  // CELL 1 ACTIONS: USUARIOS
  // ----------------------------------------------------
  const handleCreateUsuario = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const gId = newRol === 'estudiante' && newGrupoId ? newGrupoId : null;
      const nuevo = dbClient.createUsuario(newEmail, newPassword, newRol, gId, newNombreCompleto || undefined);
      triggerSuccess(`Usuario "${nuevo.email}" creado exitosamente como ${newRol}.`);
      setNewEmail('');
      setNewPassword('');
      setNewNombreCompleto('');
      setNewGrupoId('');
      loadData();
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  const handleAssignGroupToStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnassignedStudentId || !assignGrupoId) {
      triggerError('Debe seleccionar un alumno y un grupo');
      return;
    }

    try {
      dbClient.updateUsuarioGrupo(selectedUnassignedStudentId, assignGrupoId);
      triggerSuccess('Alumno asignado al grupo exitosamente.');
      setSelectedUnassignedStudentId('');
      setAssignGrupoId('');
      loadData();
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  const handleDeactivateStudent = (studentId: string) => {
    if (window.confirm('¿Está seguro de dar de baja a este estudiante? Perderá el acceso al sistema y se desasociará de su grupo.')) {
      try {
        dbClient.setUsuarioEstado(studentId, 'baja');
        triggerSuccess('Estudiante dado de baja exitosamente.');
        loadData();
      } catch (err: any) {
        triggerError(err.message);
      }
    }
  };

  const handleReactivateStudent = (studentId: string) => {
    try {
      dbClient.setUsuarioEstado(studentId, 'activo');
      triggerSuccess('Estudiante reactivado exitosamente.');
      loadData();
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  // ----------------------------------------------------
  // CELL 1 ACTIONS: MOTOR DE EXAMENES
  // ----------------------------------------------------
  const handleSaveExamConfig = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem('db_exam_config', JSON.stringify(examConfig));
      triggerSuccess('Configuración de simulacro guardada con éxito.');
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  const handleConfigChange = (comp: ComponenteICFES, val: number) => {
    const countAvailable = preguntas.filter(q => q.componente === comp).length;
    if (val < 1) {
      triggerError('La cantidad de preguntas debe ser al menos 1');
      return;
    }
    if (val > countAvailable) {
      triggerError(`La cantidad de preguntas no puede superar el límite disponible (${countAvailable})`);
      return;
    }
    setExamConfig(prev => ({
      ...prev,
      [comp]: val
    }));
  };

  // ----------------------------------------------------
  // CELL 1 ACTIONS: EXCEL IMPORT & EXPORT
  // ----------------------------------------------------
  const handleDownloadTemplate = () => {
    try {
      const headers = [
        "Componente",
        "Enunciado",
        "Opción A",
        "Opción B",
        "Opción C",
        "Opción D",
        "Respuesta Correcta",
        "Dificultad"
      ];
      
      const sampleData = [
        {
          "Componente": "Matemáticas",
          "Enunciado": "Si en una pastelería se venden 15 pasteles al día por un valor de $5000 cada uno, y los costos fijos diarios son de $2000. ¿Cuál es la ganancia diaria neta de la pastelería?",
          "Opción A": "$73000 pesos.",
          "Opción B": "$60000 pesos.",
          "Opción C": "$75000 pesos.",
          "Opción D": "$37500 pesos.",
          "Respuesta Correcta": "A",
          "Dificultad": "bajo"
        },
        {
          "Componente": "Lectura Crítica",
          "Enunciado": "En el texto 'Pienso, luego existo', la palabra 'luego' tiene una función de:",
          "Opción A": "Conjunción explicativa",
          "Opción B": "Conjunción consecutiva (por lo tanto)",
          "Opción C": "Adverbio de tiempo (después)",
          "Opción D": "Preposición condicional",
          "Respuesta Correcta": "B",
          "Dificultad": "medio"
        }
      ];

      const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Plantilla Preguntas");
      XLSX.writeFile(workbook, "Plantilla_Preguntas_SaberPRO.xlsx");
      triggerSuccess('Plantilla de ejemplo descargada con éxito.');
    } catch (err: any) {
      triggerError(`Error al descargar la plantilla: ${err.message}`);
    }
  };

  // ICFES Score 0-500 Calculations & Risk Colors
  const calculateIcfesScore500 = (simResults: any[]): number => {
    if (!simResults || simResults.length === 0) return 0;
    
    // ICFES weights
    const weights: Record<string, number> = {
      'Matemáticas': 3,
      'Lectura Crítica': 3,
      'Ciencias Naturales': 3,
      'Ciencias Sociales': 3,
      'Inglés': 1
    };
    
    let weightedSum = 0;
    let totalWeight = 0;
    
    simResults.forEach(r => {
      const w = weights[r.componente] !== undefined ? weights[r.componente] : 3;
      weightedSum += r.puntaje_obtenido * w;
      totalWeight += w;
    });
    
    if (totalWeight === 0) return 0;
    return Math.round((weightedSum / totalWeight) * 5);
  };

  const getIcfesBadgeDetails = (score: number) => {
    if (score >= 300) {
      return {
        label: 'Desempeño Sobresaliente (Riesgo Bajo)',
        bg: 'var(--bg-success-alert)',
        color: 'var(--color-success)',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        class: 'badge-success'
      };
    } else if (score >= 220) {
      return {
        label: 'Desempeño Promedio (Riesgo Medio)',
        bg: 'var(--bg-warning-light)',
        color: 'var(--color-warning)',
        border: '1px solid rgba(245, 158, 11, 0.3)',
        class: 'badge-warning'
      };
    } else {
      return {
        label: 'Desempeño Insuficiente (Riesgo Crítico)',
        bg: 'var(--bg-error-alert)',
        color: 'var(--color-error)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        class: 'badge-danger'
      };
    }
  };

  // Excel Drag & Drop & Live Preview Functionality
  const processExcelFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

        if (jsonData.length === 0) {
          triggerError('El archivo Excel está vacío.');
          return;
        }

        const validComponents: ComponenteICFES[] = [
          'Matemáticas',
          'Lectura Crítica',
          'Ciencias Naturales',
          'Ciencias Sociales',
          'Inglés'
        ];
        const validAnswers = ['A', 'B', 'C', 'D'];
        const validDifficulties: DificultadPregunta[] = ['bajo', 'medio', 'alto'];

        const parsedRows = jsonData.map((row: any, index: number) => {
          const rowNum = index + 2;
          
          const componente = row['Componente']?.toString().trim();
          const enunciado = row['Enunciado']?.toString().trim();
          const opcionA = row['Opción A']?.toString().trim();
          const opcionB = row['Opción B']?.toString().trim();
          const opcionC = row['Opción C']?.toString().trim();
          const opcionD = row['Opción D']?.toString().trim();
          const respuestaCorrecta = row['Respuesta Correcta']?.toString().trim().toUpperCase();
          const dificultad = row['Dificultad']?.toString().trim().toLowerCase();

          const rowErrors: string[] = [];

          if (!componente) {
            rowErrors.push('Falta Componente');
          } else if (!validComponents.includes(componente as ComponenteICFES)) {
            rowErrors.push(`Componente inválido "${componente}" (debe ser: ${validComponents.join(', ')})`);
          }

          if (!enunciado) {
            rowErrors.push('Falta Enunciado de la pregunta');
          }

          if (!opcionA) rowErrors.push('Falta Opción A');
          if (!opcionB) rowErrors.push('Falta Opción B');
          if (!opcionC) rowErrors.push('Falta Opción C');
          if (!opcionD) rowErrors.push('Falta Opción D');

          if (!respuestaCorrecta) {
            rowErrors.push('Falta Respuesta Correcta');
          } else if (!validAnswers.includes(respuestaCorrecta)) {
            rowErrors.push(`Respuesta correcta "${respuestaCorrecta}" inválida (debe ser A, B, C o D)`);
          }

          if (!dificultad) {
            rowErrors.push('Falta Dificultad');
          } else if (!validDifficulties.includes(dificultad as DificultadPregunta)) {
            rowErrors.push(`Dificultad "${dificultad}" inválida (debe ser bajo, medio o alto)`);
          }

          return {
            rowNum,
            componente,
            enunciado,
            opcionA,
            opcionB,
            opcionC,
            opcionD,
            respuestaCorrecta,
            dificultad,
            errors: rowErrors,
            isValid: rowErrors.length === 0
          };
        });

        setExcelPreviewRows(parsedRows);
        setShowExcelPreviewModal(true);
      } catch (err: any) {
        triggerError(`Error procesando el archivo Excel: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processExcelFile(file);
    e.target.value = ''; // Reset input element
  };

  const handleConfirmExcelImport = () => {
    const validRows = excelPreviewRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      triggerError('No hay preguntas válidas para importar.');
      setShowExcelPreviewModal(false);
      return;
    }

    try {
      const parsedPreguntas: Pregunta[] = validRows.map(row => ({
        id: generateUUID(),
        componente: row.componente as ComponenteICFES,
        texto_pregunta: row.enunciado,
        opciones_json: {
          A: row.opcionA,
          B: row.opcionB,
          C: row.opcionC,
          D: row.opcionD
        },
        respuesta_correcta: row.respuestaCorrecta as 'A' | 'B' | 'C' | 'D',
        dificultad: row.dificultad as DificultadPregunta
      }));

      const currentPreguntas = dbClient.getPreguntas();
      const updatedPreguntas = [...currentPreguntas, ...parsedPreguntas];
      dbClient.guardarPreguntas(updatedPreguntas);
      
      // Background sync to IndexedDB
      dbClient.syncToIndexedDb().catch(e => console.error('IndexedDB sync failed:', e));

      setPreguntas(updatedPreguntas);
      triggerSuccess(`¡Éxito! Se importaron ${parsedPreguntas.length} preguntas de manera exitosa.`);
      setShowExcelPreviewModal(false);
      setExcelPreviewRows([]);
    } catch (err: any) {
      triggerError(`Error al guardar las preguntas importadas: ${err.message}`);
    }
  };

  // Drag & Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        processExcelFile(file);
      } else {
        triggerError('Por favor sube un archivo Excel válido (.xlsx o .xls).');
      }
    }
  };

  // Student Excel Upload & Processing Action Handlers (Nuevo)
  const handleDownloadStudentTemplate = () => {
    try {
      const headers = [
        "Nombre Completo",
        "Correo Alias",
        "Contraseña",
        "Colegio",
        "Grupo"
      ];
      
      const sampleData = [
        {
          "Nombre Completo": "Juan Pérez",
          "Correo Alias": "juan.perez@colegio.edu.co",
          "Contraseña": "password123",
          "Colegio": "Colegio Distrital Jaime Colombia",
          "Grupo": "Grado 11-01"
        },
        {
          "Nombre Completo": "María Rodríguez",
          "Correo Alias": "maria.rod@colegio.edu.co",
          "Contraseña": "mariaPass456",
          "Colegio": "Colegio Distrital Jaime Colombia",
          "Grupo": "Grado 11-02"
        }
      ];

      const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Plantilla Alumnos");
      XLSX.writeFile(workbook, "Plantilla_Alumnos_SaberPRO.xlsx");
      triggerSuccess('Plantilla de ejemplo de alumnos descargada con éxito.');
    } catch (err: any) {
      triggerError(`Error al descargar la plantilla de alumnos: ${err.message}`);
    }
  };

  const handleExportStudentActivityExcel = () => {
    try {
      const headers = [
        "Nombre Completo",
        "Correo Alias",
        "Colegio",
        "Grupo",
        "Accesos",
        "Exámenes Terminados",
        "Exámenes en Progreso",
        "Último Acceso",
        "Estado"
      ];

      const data = visibleEstudiantes.map(est => {
        const studentGroup = grupos.find(g => g.id === est.grupo_id);
        const studentColegio = studentGroup ? colegios.find(c => c.id === studentGroup.colegio_id) : null;
        
        const completedExams = visibleSimulacros.filter(s => s.estudiante_id === est.id && s.estado === 'terminado').length;
        const inProgressExams = visibleSimulacros.filter(s => s.estudiante_id === est.id && s.estado === 'en_progreso').length;
        const isOnline = est.last_active_at && (Date.now() - new Date(est.last_active_at).getTime() < 300000);

        let estadoStr = 'Activo';
        if (est.estado === 'baja') {
          estadoStr = 'De Baja';
        } else if (isOnline) {
          estadoStr = 'En Línea';
        }

        return {
          "Nombre Completo": est.nombre_completo || est.email.split('@')[0],
          "Correo Alias": est.email,
          "Colegio": studentColegio ? studentColegio.nombre : 'Sin Asignar',
          "Grupo": studentGroup ? studentGroup.nombre_grupo : 'Sin Asignar',
          "Accesos": est.login_count || 0,
          "Exámenes Terminados": completedExams,
          "Exámenes en Progreso": inProgressExams,
          "Último Acceso": est.last_active_at ? new Date(est.last_active_at).toLocaleString() : 'Nunca',
          "Estado": estadoStr
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte Actividades");
      
      // Auto-size columns
      const maxLens = headers.map(header => header.length);
      data.forEach(row => {
        headers.forEach((header, i) => {
          const val = row[header as keyof typeof row]?.toString() || '';
          if (val.length > maxLens[i]) {
            maxLens[i] = val.length;
          }
        });
      });
      worksheet['!cols'] = maxLens.map(len => ({ wch: len + 3 }));

      XLSX.writeFile(workbook, "Reporte_Actividad_Alumnos_SaberPRO.xlsx");
      triggerSuccess('Reporte de actividad de alumnos exportado con éxito.');
    } catch (err: any) {
      triggerError(`Error al exportar el reporte de alumnos: ${err.message}`);
    }
  };

  const processStudentExcelFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

        if (jsonData.length === 0) {
          triggerError('El archivo Excel está vacío.');
          return;
        }

        const parsedRows = jsonData.map((row: any, index: number) => {
          const rowNum = index + 2;
          
          const nombreCompleto = row['Nombre Completo']?.toString().trim();
          const correoAlias = row['Correo Alias']?.toString().trim().toLowerCase();
          const contrasena = row['Contraseña']?.toString().trim();
          const colegio = row['Colegio']?.toString().trim();
          const grupo = row['Grupo']?.toString().trim();

          const rowErrors: string[] = [];

          if (!nombreCompleto) {
            rowErrors.push('Falta Nombre Completo');
          }

          if (!correoAlias) {
            rowErrors.push('Falta Correo Alias');
          } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoAlias)) {
            rowErrors.push('Correo Alias no tiene un formato válido');
          }

          if (!contrasena) {
            rowErrors.push('Falta Contraseña');
          } else if (contrasena.length < 4) {
            rowErrors.push('La contraseña debe tener al menos 4 caracteres');
          }

          // Validation of Colegio and Grupo co-existence
          if (colegio && !grupo) {
            rowErrors.push('Si especificas un Colegio, también debes ingresar el Grupo');
          } else if (grupo && !colegio) {
            rowErrors.push('Si especificas un Grupo, también debes ingresar el Colegio');
          }

          return {
            rowNum,
            nombreCompleto,
            correoAlias,
            contrasena,
            colegio,
            grupo,
            errors: rowErrors,
            isValid: rowErrors.length === 0
          };
        });

        setStudentExcelPreviewRows(parsedRows);
        setShowStudentExcelPreviewModal(true);
      } catch (err: any) {
        triggerError(`Error procesando el archivo Excel de alumnos: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleImportStudentExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processStudentExcelFile(file);
    e.target.value = ''; // Reset input element
  };

  const handleConfirmStudentExcelImport = () => {
    const validRows = studentExcelPreviewRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      triggerError('No hay alumnos válidos para importar.');
      setShowStudentExcelPreviewModal(false);
      return;
    }

    try {
      let reactivatedCount = 0;
      let createdCount = 0;

      // Get fresh arrays from the local storage DB client
      let currentColegios = dbClient.getColegios();
      let currentGrupos = dbClient.getGrupos();

      validRows.forEach(row => {
        let targetGrupoId: string | null = null;

        if (row.colegio && row.grupo) {
          // 1. Find or create Colegio
          let col = currentColegios.find(c => c.nombre.toLowerCase() === row.colegio.toLowerCase());
          if (!col) {
            col = dbClient.createColegio(row.colegio, null, {
              nit: '',
              direccion: '',
              telefono: ''
            });
            currentColegios = dbClient.getColegios();
          }

          // 2. Find or create Grupo under that Colegio
          let grp = currentGrupos.find(g => g.colegio_id === col.id && g.nombre_grupo.toLowerCase() === row.grupo.toLowerCase());
          if (!grp) {
            grp = dbClient.createGrupo(col.id, row.grupo);
            currentGrupos = dbClient.getGrupos();
          }
          targetGrupoId = grp.id;
        }

        const exists = usuarios.find(u => u.email === row.correoAlias);
        if (exists && exists.estado === 'baja') {
          reactivatedCount++;
        } else {
          createdCount++;
        }
        
        dbClient.createUsuario(
          row.correoAlias,
          row.contrasena,
          'estudiante',
          targetGrupoId,
          row.nombreCompleto
        );
      });
      
      dbClient.syncToIndexedDb().catch(e => console.error('IndexedDB sync failed:', e));

      loadData();
      triggerSuccess(`¡Éxito! Se procesaron ${validRows.length} alumnos: ${createdCount} creados y ${reactivatedCount} reactivados.`);
      setShowStudentExcelPreviewModal(false);
      setStudentExcelPreviewRows([]);
    } catch (err: any) {
      triggerError(`Error al guardar los alumnos importados: ${err.message}`);
    }
  };

  const handleStudentDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsStudentDragging(true);
  };

  const handleStudentDragLeave = () => {
    setIsStudentDragging(false);
  };

  const handleStudentDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsStudentDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        processStudentExcelFile(file);
      } else {
        triggerError('Por favor sube un archivo Excel válido (.xlsx o .xls) para los alumnos.');
      }
    }
  };

  // ----------------------------------------------------
  // CELL 1 ACTIONS: SIMULATE DB ERROR FOR TESTING LOGS
  // ----------------------------------------------------
  const handleSimulateDBError = () => {
    try {
      // Cause a Foreign Key Violated error intentionally by assigning to non-existent group ID
      dbClient.createUsuario('error-test@icfes.com', 'pass', 'estudiante', 'id-grupo-inexistente');
    } catch (err: any) {
      triggerError(`Error Simulado Registrado: ${err.message}`);
      loadData();
    }
  };

  const handleExportDatabaseJSON = () => {
    try {
      const dataStr = dbClient.exportBackup();
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Respaldo_SaberPRO_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      triggerSuccess('Copia de seguridad descargada con éxito.');
    } catch (err: any) {
      triggerError(`Error al exportar base de datos: ${err.message}`);
    }
  };

  const handleImportDatabaseJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('¿Está seguro de restaurar esta copia de seguridad? Esta acción reemplazará TODOS los datos actuales del sistema.')) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        await dbClient.importBackup(text);
        triggerSuccess('¡Copia de seguridad restaurada con éxito!');
        loadData();
      } catch (err: any) {
        triggerError(`Error al restaurar: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const handleExportBitacoraExcel = () => {
    try {
      if (bitacoraSubTab === 'errores') {
        const headers = ['Timestamp', 'Código Error', 'Descripción', 'Usuario ID'];
        const data = bitacora.map(err => ({
          'Timestamp': new Date(err.timestamp).toLocaleString(),
          'Código Error': err.codigo_error,
          'Descripción': err.descripcion,
          'Usuario ID': err.usuario_id || 'N/A'
        }));
        const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Errores Técnicos');
        XLSX.writeFile(workbook, `Reporte_Errores_SaberPRO_${new Date().toISOString().split('T')[0]}.xlsx`);
      } else {
        const headers = ['Docente', 'Correo Electrónico', 'Cantidad de Accesos', 'Última Actividad'];
        const docentesList = usuarios.filter(u => u.rol === 'docente');
        const data = docentesList.map(doc => {
          const isOnline = doc.last_active_at && (Date.now() - new Date(doc.last_active_at).getTime() < 300000);
          return {
            'Docente': doc.nombre_completo || 'Docente',
            'Correo Electrónico': doc.email,
            'Cantidad de Accesos': doc.login_count || 0,
            'Última Actividad': isOnline ? 'En Línea' : (doc.last_active_at ? new Date(doc.last_active_at).toLocaleString() : 'Nunca')
          };
        });
        const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Accesos Docentes');
        XLSX.writeFile(workbook, `Reporte_Accesos_Docentes_SaberPRO_${new Date().toISOString().split('T')[0]}.xlsx`);
      }
      triggerSuccess('Reporte de bitácora descargado con éxito.');
    } catch (err: any) {
      triggerError(`Error al descargar bitácora: ${err.message}`);
    }
  };

  // Filter students who are not assigned to any group/school (grupo_id === null)
  const unassignedStudents = usuarios.filter(u => u.rol === 'estudiante' && !u.grupo_id);

  // Helper to count students per group
  const getStudentCountInGroup = (groupId: string) => {
    return usuarios.filter(u => u.grupo_id === groupId).length;
  };

  const filteredColegios = colegios.filter(c => 
    c.nombre.toLowerCase().includes(searchColegio.toLowerCase()) ||
    (c.metadata.nit && c.metadata.nit.toLowerCase().includes(searchColegio.toLowerCase()))
  );

  const filteredUsuarios = visibleUsuarios.filter(u => {
    // 1. Filter by user sub-tab (activos vs bajas)
    if (userSubTab === 'activos') {
      if (u.estado === 'baja') return false;
    } else {
      if (u.rol !== 'estudiante' || u.estado !== 'baja') return false;
    }

    // 2. Filter by Role Selector
    if (filterRol && u.rol !== filterRol) {
      return false;
    }

    // Get group and school association for the user
    let userGrupo: Grupo | undefined = undefined;
    let userColegio: Colegio | undefined = undefined;

    if (u.rol === 'estudiante') {
      if (u.grupo_id) {
        userGrupo = grupos.find(g => g.id === u.grupo_id);
        if (userGrupo) {
          userColegio = colegios.find(c => c.id === userGrupo?.colegio_id);
        }
      }
    } else if (u.rol === 'docente') {
      userColegio = colegios.find(c => c.docente_id === u.id);
    }

    // 3. Filter by School Selector
    if (filterColegioId) {
      if (!userColegio || userColegio.id !== filterColegioId) {
        return false;
      }
    }

    // 4. Filter by Group Selector
    if (filterGrupoId) {
      if (!userGrupo || userGrupo.id !== filterGrupoId) {
        return false;
      }
    }

    // 5. Filter by search term
    if (!searchUsuario.trim()) return true;

    const term = searchUsuario.toLowerCase();
    const emailMatch = u.email.toLowerCase().includes(term);
    const rolMatch = u.rol.toLowerCase().includes(term);
    const nombreMatch = u.nombre_completo ? u.nombre_completo.toLowerCase().includes(term) : false;
    const colegioMatch = userColegio ? userColegio.nombre.toLowerCase().includes(term) : false;
    const grupoMatch = userGrupo ? userGrupo.nombre_grupo.toLowerCase().includes(term) : false;

    return emailMatch || rolMatch || nombreMatch || colegioMatch || grupoMatch;
  });

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar" id="tour-admin-sidebar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
          <div className="sidebar-header">
            <div className="user-avatar" style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}>
              <School size={20} />
            </div>
            <span className="sidebar-logo">{isDocente ? 'SABER-PRO Docente' : 'SABER-PRO Admin'}</span>
          </div>

          <ul className="sidebar-menu">
            <li className={`sidebar-item ${activeTab === 'dashboard' ? 'active' : ''}`} id="tour-admin-tab-dashboard">
              <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('dashboard'); loadData(); }}>
                <Activity size={18} />
                Panel de Control
              </a>
            </li>
            {!isDocente && (
              <li className={`sidebar-item ${activeTab === 'colegios' ? 'active' : ''}`} id="tour-admin-tab-colegios">
                <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('colegios'); loadData(); }}>
                  <School size={18} />
                  Colegios y Grupos
                </a>
              </li>
            )}
            {currentUser.rol === 'admin' && (
              <li className={`sidebar-item ${activeTab === 'usuarios' ? 'active' : ''}`} id="tour-admin-tab-usuarios">
                <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('usuarios'); loadData(); }}>
                  <Users size={18} />
                  Gestión de Usuarios
                </a>
              </li>
            )}
            {(currentUser.rol === 'admin' || currentUser.rol === 'docente') && (
              <li className={`sidebar-item ${activeTab === 'motor' ? 'active' : ''}`} id="tour-admin-tab-motor">
                <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('motor'); loadData(); }}>
                  <Settings size={18} />
                  Motor de Exámenes
                </a>
              </li>
            )}
            {currentUser.rol === 'admin' && (
              <li className={`sidebar-item ${activeTab === 'bitacora' ? 'active' : ''}`}>
                <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('bitacora'); loadData(); }}>
                  <ShieldAlert size={18} />
                  Bitácora del Sistema
                </a>
              </li>
            )}
          </ul>
        </div>

        <div className="sidebar-footer">
          {/* Daily-Ads Promo Card in Sidebar */}
          <div 
            className="sidebar-promo-card" 
            id="tour-admin-guide-card"
            style={{ 
              position: 'relative',
              backgroundImage: 'url(/buho.png)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              padding: 0,
              overflow: 'hidden',
              minHeight: '195px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              marginBottom: '1.25rem'
            }}
          >
            {/* Gradient Overlay for Text Readability */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(to top, rgba(3, 54, 76, 0.95) 0%, rgba(3, 54, 76, 0.5) 60%, rgba(3, 54, 76, 0.2) 100%)',
              zIndex: 1
            }} />

            {/* Content Overlaid on top of image */}
            <div style={{ 
              position: 'relative', 
              zIndex: 2, 
              padding: '1.25rem', 
              width: '100%',
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              textAlign: 'center' 
            }}>
              <button 
                onClick={() => setShowGuiaModal(true)} 
                className="btn btn-primary btn-sm"
                style={{ width: '100%', boxShadow: '0 4px 6px rgba(0,0,0,0.15)' }}
              >
                ¿Cómo funciona el sistema?
              </button>
            </div>
          </div>

          <div className="sidebar-user" style={{ marginBottom: '0.5rem' }}>
            <div className="user-avatar" style={{ backgroundColor: 'var(--bg-orange-light)', color: 'var(--color-primary)' }}>
              {currentUser.email.substring(0, 2).toUpperCase()}
            </div>
            <div className="user-info">
              <span className="user-email">{currentUser.email}</span>
              <span className="user-role">{currentUser.rol}</span>
            </div>
          </div>
          <button onClick={onLogout} className="btn btn-secondary btn-sm" style={{ width: '100%' }}>
            <LogOut size={14} />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Alerts Banner */}
        {successMsg && (
          <div className="card" style={{ 
            backgroundColor: 'var(--bg-success-alert)', 
            borderColor: 'var(--color-success)', 
            color: 'var(--color-success)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem 1.5rem',
            borderRadius: 'var(--radius-sm)'
          }}>
            <CheckCircle size={20} />
            <strong>{successMsg}</strong>
          </div>
        )}

        {errorMsg && (
          <div className="card" style={{ 
            backgroundColor: 'var(--bg-error-alert)', 
            borderColor: 'var(--color-error)', 
            color: 'var(--color-error)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem 1.5rem',
            borderRadius: 'var(--radius-sm)'
          }}>
            <AlertTriangle size={20} />
            <strong>{errorMsg}</strong>
          </div>
        )}

        {/* TAB: PANEL DE CONTROL */}
        {activeTab === 'dashboard' && (
          <>
            {/* Daily-Ads Welcome Card */}
            <div className="welcome-card">
              <div className="welcome-info">
                <span className="welcome-preheading">MATRÍCULA GLOBAL Y GESTIÓN</span>
                <h1 className="welcome-heading">SIMULACROS ILIMITADOS</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem', maxWidth: '450px' }}>
                  ¡Bienvenido de nuevo, {isDocente ? 'Docente' : 'Admin'}! Aquí tienes los indicadores generales de registro escolar y rendimiento de simulacros ICFES Saber 11 en tiempo real.
                </p>
                {!isDocente && (
                  <div>
                    <button 
                      onClick={() => setActiveTab('colegios')} 
                      className="btn btn-primary"
                    >
                      Registrar Colegio
                    </button>
                  </div>
                )}
              </div>

              {/* 3D SVG Bar Chart & Swooping Orange Arrow Illustration */}
              <div className="hide-mobile" style={{ marginRight: '1rem' }}>
                <svg width="240" height="170" viewBox="0 0 240 170" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <line x1="20" y1="125" x2="220" y2="125" stroke="var(--border-color)" strokeWidth="1.5" opacity="0.6" />
                  
                  <rect x="40" y="105" width="16" height="20" rx="3" fill="#0ea5e9" opacity="0.6" />
                  <rect x="42" y="102" width="12" height="20" rx="2" fill="#38bdf8" />

                  <rect x="75" y="85" width="16" height="40" rx="3" fill="#0ea5e9" opacity="0.7" />
                  <rect x="77" y="82" width="12" height="40" rx="2" fill="#38bdf8" />

                  <rect x="110" y="65" width="16" height="60" rx="3" fill="#0ea5e9" opacity="0.8" />
                  <rect x="112" y="62" width="12" height="60" rx="2" fill="#38bdf8" />

                  <rect x="145" y="45" width="16" height="80" rx="3" fill="#0ea5e9" opacity="0.9" />
                  <rect x="147" y="42" width="12" height="80" rx="2" fill="#38bdf8" />

                  <rect x="180" y="25" width="16" height="100" rx="3" fill="#0ea5e9" />
                  <rect x="182" y="22" width="12" height="100" rx="2" fill="#38bdf8" />

                  <path d="M30,115 Q90,95 135,55 T200,10" fill="none" stroke="#ff5100" strokeWidth="5" strokeLinecap="round" />
                  <path d="M188,8 H202 V22" fill="none" stroke="#ff5100" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />

                  <g transform="translate(150, 12)">
                    <rect x="0" y="0" width="20" height="15" rx="3" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" />
                    <path d="M1,1 L10,7 L19,1" stroke="#cbd5e1" strokeWidth="1.5" fill="none" />
                    <circle cx="17" cy="3" r="3" fill="#ff5100" />
                  </g>
                </svg>
              </div>
            </div>

            {/* Metrics cards grid */}
            <div className="grid-metrics">
              <div className="metric-card">
                <div className="metric-icon-box" style={{ backgroundColor: 'var(--bg-blue-light)', color: 'var(--color-blue)' }}>
                  <School size={22} />
                </div>
                <div className="metric-details">
                  <span className="metric-lbl">Total Colegios</span>
                  <span className="metric-val">{visibleColegios.length}</span>
                  <span className="metric-footer" style={{ color: 'var(--color-green)' }}>✓ Instituciones</span>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-icon-box" style={{ backgroundColor: 'var(--bg-orange-light)', color: 'var(--color-orange)' }}>
                  <ClipboardList size={22} />
                </div>
                <div className="metric-details">
                  <span className="metric-lbl">Grupos Creados</span>
                  <span className="metric-val">{visibleGrupos.length}</span>
                  <span className="metric-footer" style={{ color: 'var(--color-green)' }}>✓ Grados y Salones</span>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-icon-box" style={{ backgroundColor: 'var(--bg-green-light)', color: 'var(--color-green)' }}>
                  <Users size={22} />
                </div>
                <div className="metric-details">
                  <span className="metric-lbl">Estudiantes</span>
                  <span className="metric-val">{visibleEstudiantes.filter(u => u.estado !== 'baja').length}</span>
                  <span className="metric-footer" style={{ color: 'var(--color-green)' }}>✓ Inscritos Activos</span>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-icon-box" style={{ backgroundColor: 'var(--bg-purple-light)', color: 'var(--color-purple)' }}>
                  <TrendingUp size={22} />
                </div>
                <div className="metric-details">
                  <span className="metric-lbl">Pruebas Finalizadas</span>
                  <span className="metric-val">{visibleSimulacros.filter(s => s.estado === 'terminado').length}</span>
                  <span className="metric-footer" style={{ color: 'var(--color-green)' }}>✓ Calificadas</span>
                </div>
              </div>

              {currentUser.rol === 'admin' && (
                <div className="metric-card">
                  <div className="metric-icon-box" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                    <Activity size={22} />
                  </div>
                  <div className="metric-details">
                    <span className="metric-lbl">Docentes en Vivo</span>
                    <span className="metric-val">
                      {usuarios.filter(u => 
                        u.rol === 'docente' && 
                        u.estado !== 'baja' && 
                        u.last_active_at && 
                        (Date.now() - new Date(u.last_active_at).getTime() < 300000)
                      ).length}
                    </span>
                    <span className="metric-footer" style={{ color: 'var(--color-green)' }}>● Conectados ahora</span>
                  </div>
                </div>
              )}
            </div>

            {/* Growth Overview and Recent list Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '1.5rem' }}>
              {/* Left Column: Growth Overview SVG Chart */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <h3 className="card-title" style={{ margin: 0 }}>
                    Resumen de Progreso
                  </h3>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select className="form-control" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', width: 'auto', borderRadius: '9999px' }} defaultValue="subscribers">
                      <option value="subscribers">Simulacros</option>
                    </select>
                    <select className="form-control" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', width: 'auto', borderRadius: '9999px' }} defaultValue="30days">
                      <option value="30days">Últimos 30 días</option>
                    </select>
                  </div>
                </div>
                
                {/* SVG Chart */}
                <div style={{ width: '100%', minHeight: '200px' }}>
                  <svg viewBox="0 0 500 200" width="100%" height="200" style={{ overflow: 'visible' }}>
                    <defs>
                      <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <line x1="40" y1="150" x2="480" y2="150" stroke="var(--border-color)" strokeWidth="1" opacity="0.6" />

                    <path d="M 40,150 Q 110,130 180,95 T 320,110 T 460,50 L 460,150 Z" fill="url(#chartGradient)" />
                    <path d="M 40,150 Q 110,130 180,95 T 320,110 T 460,50" fill="none" stroke="#0ea5e9" strokeWidth="3.5" strokeLinecap="round" />

                    <circle cx="320" cy="110" r="5" fill="#0ea5e9" stroke="#ffffff" strokeWidth="2" />
                    
                    <text x="35" y="175" fill="#94a3b8" fontSize="9" fontFamily="var(--font-main)">Abr 27</text>
                    <text x="145" y="175" fill="#94a3b8" fontSize="9" fontFamily="var(--font-main)">May 4</text>
                    <text x="255" y="175" fill="#94a3b8" fontSize="9" fontFamily="var(--font-main)">May 11</text>
                    <text x="365" y="175" fill="#94a3b8" fontSize="9" fontFamily="var(--font-main)">May 18</text>
                    <text x="445" y="175" fill="#94a3b8" fontSize="9" fontFamily="var(--font-main)">May 25</text>

                    <g transform="translate(230, 40)">
                      <circle cx="210" cy="20" r="0" /> {/* dummy placeholder element to prevent text overlap */}
                      <rect x="0" y="0" width="135" height="36" rx="6" fill="#0f172a" />
                      <text x="10" y="15" fill="#94a3b8" fontSize="8" fontWeight="bold" fontFamily="var(--font-main)">Mayo 24</text>
                      <text x="10" y="27" fill="#ffffff" fontSize="9" fontWeight="bold" fontFamily="var(--font-main)">{visibleSimulacros.length * 5 + 12} Simulacros Activos</text>
                    </g>
                  </svg>
                </div>
              </div>

              {/* Right Column: Recent Simulations formatted like Recent Campaigns */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <h3 className="card-title" style={{ margin: 0 }}>
                    Simulacros Recientes
                  </h3>
                  <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('dashboard'); }} style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-blue)' }}>
                    Ver Todos
                  </a>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
                  {visibleSimulacros.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>
                      No hay simulacros completados.
                    </p>
                  ) : (
                    visibleSimulacros.slice(-3).reverse().map((sim, i) => {
                      const student = usuarios.find(u => u.id === sim.estudiante_id);
                      const results = resultados.filter(r => r.simulacro_id === sim.id);
                      
                      const icfesScore = calculateIcfesScore500(results);
                      const badge = getIcfesBadgeDetails(icfesScore);

                      // Dynamic styling for icons to match image
                      const bgColors = ['rgba(239, 68, 68, 0.1)', 'rgba(14, 165, 233, 0.1)', 'rgba(16, 185, 129, 0.1)'];
                      const colors = ['#ef4444', '#0ea5e9', '#10b981'];
                      
                      return (
                        <div key={sim.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: i < 2 ? '1px solid var(--border-color)' : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ 
                              width: '2.5rem', 
                              height: '2.5rem', 
                              borderRadius: 'var(--radius-sm)', 
                              backgroundColor: bgColors[i % 3], 
                              color: colors[i % 3],
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <Mail size={18} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-title)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>
                                {student ? student.email.split('@')[0] : 'Estudiante'}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                {sim.estado === 'terminado' ? 'Finalizado' : 'En progreso'}
                              </span>
                            </div>
                          </div>

                          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ 
                              fontSize: '0.75rem', 
                              fontWeight: 800, 
                              color: sim.estado === 'terminado' ? badge.color : 'var(--text-title)',
                              backgroundColor: sim.estado === 'terminado' ? badge.bg : 'transparent',
                              padding: sim.estado === 'terminado' ? '0.15rem 0.4rem' : '0',
                              borderRadius: '4px',
                              border: sim.estado === 'terminado' ? badge.border : 'none'
                            }}>
                              {sim.estado === 'terminado' ? `${icfesScore} pts` : '--'}
                            </span>
                            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                              {sim.estado === 'terminado' ? 'ICFES' : 'Puntaje'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Horizontal Card */}
            <div className="bottom-banner-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ 
                  width: '3rem', 
                  height: '3rem', 
                  borderRadius: '50%', 
                  backgroundColor: 'rgba(14, 165, 233, 0.1)', 
                  color: 'var(--color-blue)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <CheckCircle size={24} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontWeight: 700, color: 'var(--text-title)' }}>Poderoso. Escalable. Sin límites.</h4>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    La plataforma de simulacros SaberPRO te permite configurar evaluaciones diagnósticas y gestionar tus colegios integradamente.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button onClick={() => setActiveTab('motor')} className="btn btn-primary">
                  Explorar Configuración
                </button>
                {/* Visual Arrow decoration */}
                <div className="hide-mobile">
                  <svg width="60" height="30" viewBox="0 0 60 30" fill="none">
                    <path d="M10,25 L25,20 L40,10 L55,5" stroke="#ff5100" strokeWidth="4" strokeLinecap="round" />
                    <circle cx="55" cy="5" r="4" fill="#ff5100" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Student Activity Summary (Nuevo) */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Users size={20} style={{ color: 'var(--color-primary)' }} />
                  Monitoreo y Actividad de Alumnos
                </h3>
                <button 
                  onClick={handleExportStudentActivityExcel} 
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  disabled={visibleEstudiantes.length === 0}
                >
                  <Download size={14} />
                  Descargar Reporte Excel
                </button>
              </div>
              {visibleEstudiantes.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                  No hay estudiantes registrados o visibles en tus grupos.
                </p>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Alumno</th>
                        <th>Colegio - Grupo</th>
                        <th style={{ textAlign: 'center' }}>Accesos</th>
                        <th style={{ textAlign: 'center' }}>Exámenes Terminados</th>
                        <th style={{ textAlign: 'center' }}>En Progreso</th>
                        <th>Último Acceso</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleEstudiantes.map((est) => {
                        const studentGroup = grupos.find(g => g.id === est.grupo_id);
                        const studentColegio = studentGroup ? colegios.find(c => c.id === studentGroup.colegio_id) : null;
                        
                        const completedExams = visibleSimulacros.filter(s => s.estudiante_id === est.id && s.estado === 'terminado').length;
                        const inProgressExams = visibleSimulacros.filter(s => s.estudiante_id === est.id && s.estado === 'en_progreso').length;
                        const isOnline = est.last_active_at && (Date.now() - new Date(est.last_active_at).getTime() < 300000);

                        return (
                          <tr key={est.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div>
                                  <strong style={{ color: 'var(--text-title)' }}>{est.nombre_completo || est.email.split('@')[0]}</strong>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{est.email}</div>
                                </div>
                                <button
                                  onClick={() => handleStartEditStudent(est)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '0.25rem',
                                    color: 'var(--color-primary)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    borderRadius: '50%',
                                    transition: 'background-color 0.2s'
                                  }}
                                  title="Editar Nombre del Alumno"
                                >
                                  <Edit size={14} />
                                </button>
                              </div>
                            </td>
                            <td>
                              {studentColegio && studentGroup ? (
                                <span>{studentColegio.nombre} - <strong>{studentGroup.nombre_grupo}</strong></span>
                              ) : (
                                <span style={{ color: 'var(--color-error)', fontWeight: 'bold' }}>Sin Asignar</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <strong>{est.login_count || 0}</strong>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className="badge badge-success">{completedExams}</span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className="badge badge-warning">{inProgressExams}</span>
                            </td>
                            <td>
                              {est.last_active_at ? new Date(est.last_active_at).toLocaleString() : 'Nunca'}
                            </td>
                            <td>
                              {est.estado === 'baja' ? (
                                <span className="badge badge-danger">De Baja</span>
                              ) : isOnline ? (
                                <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                  <span style={{ width: '6px', height: '6px', backgroundColor: '#ffffff', borderRadius: '50%', display: 'inline-block' }} />
                                  En Línea
                                </span>
                              ) : (
                                <span className="badge badge-primary">Activo</span>
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

            {/* Inline list of recent simulations underneath */}
            <div className="card" id="tour-admin-history">
              <h3 className="card-title">
                <TrendingUp size={20} style={{ color: 'var(--color-primary)' }} />
                Historial Completo de Pruebas
              </h3>
              {visibleSimulacros.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                  No hay simulacros registrados en la plataforma.
                </p>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Estudiante</th>
                        <th>Fecha de Inicio</th>
                        <th>Estado</th>
                        <th>Preguntas Totales</th>
                        <th>Puntaje ICFES (0-500)</th>
                        <th>Semáforo de Rendimiento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleSimulacros.map((sim) => {
                        const student = usuarios.find(u => u.id === sim.estudiante_id);
                        const results = resultados.filter(r => r.simulacro_id === sim.id);
                        
                        const icfesScore = calculateIcfesScore500(results);
                        const badge = getIcfesBadgeDetails(icfesScore);

                        return (
                          <tr key={sim.id}>
                            <td>
                              <strong>{student ? student.email : 'Usuario Eliminado'}</strong>
                            </td>
                            <td>{new Date(sim.fecha_inicio).toLocaleString()}</td>
                            <td>
                              <span className={`badge ${sim.estado === 'terminado' ? 'badge-success' : 'badge-warning'}`}>
                                {sim.estado === 'terminado' ? 'Terminado' : 'En Progreso'}
                              </span>
                            </td>
                            <td>{sim.preguntas_ids.length}</td>
                            <td>
                              {sim.estado === 'terminado' ? (
                                <strong style={{ 
                                  color: badge.color,
                                  backgroundColor: badge.bg,
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: 'var(--radius-sm)',
                                  border: badge.border,
                                  display: 'inline-block',
                                  fontWeight: 800,
                                  fontSize: '0.85rem'
                                }}>
                                  {icfesScore} / 500
                                </strong>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Puntaje no disponible</span>
                              )}
                            </td>
                            <td>
                              {sim.estado === 'terminado' ? (
                                <span style={{ 
                                  display: 'inline-flex', 
                                  alignItems: 'center', 
                                  gap: '0.35rem', 
                                  color: badge.color, 
                                  fontWeight: 700, 
                                  fontSize: '0.8rem' 
                                }}>
                                  <span style={{ 
                                    width: '8px', 
                                    height: '8px', 
                                    borderRadius: '50%', 
                                    backgroundColor: badge.color,
                                    boxShadow: `0 0 8px ${badge.color}`
                                  }} />
                                  {badge.label}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>Evaluando...</span>
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
          </>
        )}

        {/* TAB: COLEGIOS Y GRUPOS */}
        {activeTab === 'colegios' && (
          <>
            <div>
              <h2>Gestión de Colegios y Grupos</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                {isDocente 
                  ? 'Visualiza tus instituciones educativas asignadas y sus respectivos salones y estudiantes.'
                  : 'Registra instituciones educativas, asigna docentes y administra sus respectivos salones en una sola vista unificada.'}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isDocente ? '1fr' : '380px 1fr', gap: '1.5rem' }}>
              {/* Form to Create Colegio (Solo Admin) */}
              {currentUser.rol === 'admin' && (
                <div className="card" style={{ height: 'fit-content' }}>
                  <h3 className="card-title">Registrar Nuevo Colegio</h3>
                  <form onSubmit={handleCreateColegio} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label className="form-label">Nombre del Colegio *</label>
                      <input
                        type="text"
                        className="form-control"
                        value={newColegioNombre}
                        onChange={(e) => setNewColegioNombre(e.target.value)}
                        placeholder="Ej: Colegio Distrital Jaime Colombia"
                        required
                      />
                    </div>
                    
                    <div className="form-group">
                      <label className="form-label">Asignar Docente</label>
                      <select
                        className="form-control"
                        value={newColegioDocenteId}
                        onChange={(e) => setNewColegioDocenteId(e.target.value)}
                      >
                        <option value="">-- Seleccionar Docente --</option>
                        {usuarios.filter(u => u.rol === 'docente' && u.estado !== 'baja').map((doc) => (
                          <option key={doc.id} value={doc.id}>
                            {doc.nombre_completo || doc.email} ({doc.email})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">NIT (Opcional)</label>
                      <input
                        type="text"
                        className="form-control"
                        value={newColegioNit}
                        onChange={(e) => setNewColegioNit(e.target.value)}
                        placeholder="Ej: 900.123.456-7"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Dirección</label>
                      <input
                        type="text"
                        className="form-control"
                        value={newColegioDireccion}
                        onChange={(e) => setNewColegioDireccion(e.target.value)}
                        placeholder="Ej: Calle 100 #20-30"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Teléfono</label>
                      <input
                        type="text"
                        className="form-control"
                        value={newColegioTelefono}
                        onChange={(e) => setNewColegioTelefono(e.target.value)}
                        placeholder="Ej: 3109999999"
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                      <Plus size={18} />
                      Crear Colegio
                    </button>
                  </form>
                </div>
              )}

              {/* List of Colegios and Inline Groups Creation */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {visibleColegios.length > 0 && (
                  <div className="card" style={{ padding: '0.85rem 1.25rem', marginBottom: '-0.5rem' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="🔍 Buscar colegios por nombre o NIT..."
                      value={searchColegio}
                      onChange={(e) => setSearchColegio(e.target.value)}
                    />
                  </div>
                )}

                {visibleColegios.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                    <School size={40} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
                    <h4>No hay colegios asignados o registrados</h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {isDocente 
                        ? 'Actualmente no tienes colegios asignados por el administrador.'
                        : 'Utiliza el formulario de la izquierda para registrar el primer colegio de la plataforma.'}
                    </p>
                  </div>
                ) : filteredColegios.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                    <School size={32} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
                    <h4>No se encontraron coincidencias</h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      No hay colegios que coincidan con la búsqueda "{searchColegio}".
                    </p>
                  </div>
                ) : (
                  filteredColegios.map((col) => {
                    const gruposDelColegio = grupos.filter(g => g.colegio_id === col.id);
                    const assignedTeacher = usuarios.find(u => u.id === col.docente_id);

                    return (
                      <div key={col.id} className="card">
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'flex-start',
                          borderBottom: '1px solid var(--border-color)',
                          paddingBottom: '1rem',
                          marginBottom: '1rem'
                        }}>
                          <div>
                            <h3 style={{ margin: 0, color: 'var(--color-primary)' }}>{col.nombre}</h3>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginTop: '0.375rem', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                              <span><strong>NIT:</strong> {col.metadata.nit || 'No Registrado'}</span>
                              <span><strong>Dirección:</strong> {col.metadata.direccion || 'No Registrada'}</span>
                              <span><strong>Teléfono:</strong> {col.metadata.telefono || 'No Registrado'}</span>
                              <span>
                                <strong>Docente Asignado:</strong>{' '}
                                {currentUser.rol === 'admin' ? (
                                  <select
                                    className="form-control"
                                    style={{ display: 'inline-block', width: 'auto', padding: '0.15rem 0.5rem', fontSize: '0.775rem', height: 'auto', marginLeft: '0.35rem', borderRadius: '4px' }}
                                    value={col.docente_id || ''}
                                    onChange={(e) => handleAssignTeacherInline(col.id, e.target.value)}
                                  >
                                    <option value="">-- Sin Asignar --</option>
                                    {usuarios.filter(u => u.rol === 'docente' && u.estado !== 'baja').map((doc) => (
                                      <option key={doc.id} value={doc.id}>
                                        {doc.nombre_completo || doc.email}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span style={{ color: assignedTeacher ? 'var(--text-title)' : 'var(--color-error)', fontWeight: 700 }}>
                                    {assignedTeacher ? `${assignedTeacher.nombre_completo || assignedTeacher.email} (${assignedTeacher.email})` : 'Ninguno'}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                            <span className="badge badge-primary">
                              {gruposDelColegio.length} Grupos
                            </span>
                            {currentUser.rol === 'admin' && (
                              <div style={{ display: 'flex', gap: '0.35rem' }}>
                                <button 
                                  onClick={() => handleStartEditColegio(col)} 
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}
                                  title="Editar Colegio"
                                >
                                  <Edit size={12} />
                                  Editar
                                </button>
                                <button 
                                  onClick={() => handleDeleteColegio(col.id, col.nombre)} 
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--color-error)', borderColor: 'var(--bg-error-alert)' }}
                                  title="Eliminar Colegio"
                                >
                                  <Trash2 size={12} />
                                  Eliminar
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Grupos Inline Area */}
                        <div>
                          <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem', fontWeight: 700 }}>
                            Grupos del Colegio:
                          </h4>
                          {gruposDelColegio.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '1rem' }}>
                              Este colegio no tiene grupos creados aún.
                            </p>
                          ) : (
                            <div style={{ 
                              display: 'flex', 
                              flexWrap: 'wrap', 
                              gap: '0.75rem', 
                              marginBottom: '1.25rem' 
                            }}>
                              {gruposDelColegio.map((gr) => (
                                <div key={gr.id} style={{ 
                                  padding: '0.5rem 1rem', 
                                  backgroundColor: 'var(--bg-app)', 
                                  borderRadius: '9999px',
                                  border: '1px solid var(--border-color)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.75rem',
                                  fontSize: '0.85rem'
                                }}>
                                  <strong style={{ color: 'var(--text-title)' }}>{gr.nombre_grupo}</strong>
                                  <span style={{ 
                                    fontSize: '0.72rem', 
                                    backgroundColor: 'var(--color-primary)', 
                                    color: '#ffffff',
                                    borderRadius: '50%',
                                    width: '1.25rem',
                                    height: '1.25rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 'bold'
                                  }} title="Cantidad de alumnos en este grupo">
                                    {getStudentCountInGroup(gr.id)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Quick Inline Creation Form for Groups (Solo Admin) */}
                          {currentUser.rol === 'admin' && (
                            <div style={{ 
                              display: 'flex', 
                              gap: '0.75rem', 
                              maxWidth: '420px',
                              backgroundColor: 'var(--bg-app)',
                              padding: '0.75rem',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px dashed #ff5100'
                            }}>
                              <input
                                type="text"
                                className="form-control"
                                style={{ padding: '0.375rem 0.75rem', fontSize: '0.825rem' }}
                                value={newGrupoNombre[col.id] || ''}
                                onChange={(e) => setNewGrupoNombre(prev => ({ ...prev, [col.id]: e.target.value }))}
                                placeholder="Nombre del grupo (ej: 11-03)"
                              />
                              <button
                                onClick={() => handleCreateGrupoInline(col.id)}
                                className="btn btn-primary btn-sm"
                                style={{ flexShrink: 0 }}
                              >
                                <Plus size={14} />
                                Añadir
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}

        {/* TAB: GESTION DE USUARIOS */}
        {activeTab === 'usuarios' && (
          <>
            <div>
              <h2>Gestión de Usuarios</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Crea cuentas de administración, docentes o estudiantes de manera manual o masiva mediante plantillas Excel, y administra las bajas/reactivaciones del sistema.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              {/* Form 1: Create New User */}
              <div className="card" style={{ height: 'fit-content' }}>
                <h3 className="card-title">Crear Nuevo Usuario</h3>
                <form onSubmit={handleCreateUsuario} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Correo Electrónico *</label>
                    <input
                      type="email"
                      className="form-control"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="ejemplo@icfes.com"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Nombre Completo (Opcional)</label>
                    <input
                      type="text"
                      className="form-control"
                      value={newNombreCompleto}
                      onChange={(e) => setNewNombreCompleto(e.target.value)}
                      placeholder="Ej: Juan Pérez"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Contraseña *</label>
                    <input
                      type="password"
                      className="form-control"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 4 caracteres"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Rol de Usuario</label>
                    <select
                      className="form-control"
                      value={newRol}
                      onChange={(e) => {
                        setNewRol(e.target.value as Usuario['rol']);
                        setNewGrupoId('');
                      }}
                    >
                      <option value="estudiante">Estudiante</option>
                      <option value="docente">Docente</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>

                  {newRol === 'estudiante' && (
                    <div className="form-group">
                      <label className="form-label">
                        Grupo Académico (Opcional)
                      </label>
                      <select
                        className="form-control"
                        value={newGrupoId}
                        onChange={(e) => setNewGrupoId(e.target.value)}
                      >
                        <option value="">-- Sin Grupo Asignado (Estudiante sin Colegio) --</option>
                        {colegios.map((col) => {
                          const gruposCol = grupos.filter(g => g.colegio_id === col.id);
                          if (gruposCol.length === 0) return null;
                          return (
                            <optgroup key={col.id} label={col.nombre}>
                              {gruposCol.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.nombre_grupo}
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                    <Plus size={18} />
                    Crear Cuenta de Usuario
                  </button>
                </form>
              </div>

              {/* Right column: Stacks Assign Group & Excel Import */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Form 2: Restricted Group Assignment for Unassigned Students */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h3 className="card-title">
                    Asignar Grupo a Estudiantes sin Colegio
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
                    <strong>Restricción de Negocio:</strong> Esta sección solo muestra a los alumnos registrados en el sistema que no pertenecen a ningún colegio o grupo todavía.
                  </p>

                  {unassignedStudents.length === 0 ? (
                    <div style={{ 
                      padding: '2.5rem 1rem', 
                      textAlign: 'center', 
                      border: '1px dashed var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--bg-app)',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <CheckCircle size={32} style={{ color: 'var(--color-success)' }} />
                      <strong>Todos los estudiantes tienen un grupo asignado</strong>
                      <span style={{ fontSize: '0.75rem' }}>No hay estudiantes flotantes sin colegio.</span>
                    </div>
                  ) : (
                    <form onSubmit={handleAssignGroupToStudent} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div className="form-group">
                        <label className="form-label">Seleccionar Estudiante sin Colegio *</label>
                        <select
                          className="form-control"
                          value={selectedUnassignedStudentId}
                          onChange={(e) => setSelectedUnassignedStudentId(e.target.value)}
                          required
                        >
                          <option value="">-- Seleccionar Estudiante ({unassignedStudents.length} disponibles) --</option>
                          {unassignedStudents.map((est) => (
                            <option key={est.id} value={est.id}>
                              {est.nombre_completo || est.email} ({est.email})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Asignar a Grupo de Colegio *</label>
                        <select
                          className="form-control"
                          value={assignGrupoId}
                          onChange={(e) => setAssignGrupoId(e.target.value)}
                          required
                        >
                          <option value="">-- Seleccionar Destino --</option>
                          {colegios.map((col) => {
                            const gruposCol = grupos.filter(g => g.colegio_id === col.id);
                            if (gruposCol.length === 0) return null;
                            return (
                              <optgroup key={col.id} label={col.nombre}>
                                {gruposCol.map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {g.nombre_grupo}
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })}
                        </select>
                      </div>

                      <button type="submit" className="btn btn-accent" style={{ width: '100%', marginTop: '0.5rem' }}>
                        Confirmar Asignación de Colegio
                      </button>
                    </form>
                  )}
                </div>

                {/* Form 3: Excel Alumnos Mass Upload (Nuevo) */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h3 className="card-title">
                    <Upload size={20} style={{ color: 'var(--color-primary)' }} />
                    Cargar Alumnos Masivamente
                  </h3>
                  <p style={{ fontSize: '0.825rem', color: 'var(--text-main)', margin: 0 }}>
                    Sube un archivo de Excel (.xlsx / .xls) para importar y registrar alumnos automáticamente en la base de datos.
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <button 
                      onClick={handleDownloadStudentTemplate} 
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                    >
                      <Download size={14} />
                      Descargar Plantilla de Alumnos
                    </button>

                    <div 
                      onDragOver={handleStudentDragOver}
                      onDragLeave={handleStudentDragLeave}
                      onDrop={handleStudentDrop}
                      style={{ 
                        border: isStudentDragging ? '2px dashed var(--color-primary)' : '2px dashed var(--border-color)', 
                        borderRadius: 'var(--radius-sm)', 
                        padding: '1.5rem 1rem', 
                        textAlign: 'center',
                        backgroundColor: isStudentDragging ? 'var(--bg-orange-light)' : 'var(--bg-app)',
                        boxShadow: isStudentDragging ? '0 0 12px rgba(255, 81, 0, 0.25)' : 'none',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'all 0.2s ease-in-out'
                      }}
                    >
                      <Upload size={24} style={{ color: isStudentDragging ? 'var(--color-primary)' : 'var(--text-muted)', marginBottom: '0.5rem' }} />
                      <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-title)' }}>
                        {isStudentDragging ? '¡Suelta el archivo aquí!' : 'Arrastra o Selecciona excel de alumnos'}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Columnas: Nombre Completo, Correo Alias, Contraseña, Colegio (opcional), Grupo (opcional)
                      </span>
                      <input 
                        type="file" 
                        accept=".xlsx, .xls" 
                        onChange={handleImportStudentExcel}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          opacity: 0,
                          cursor: 'pointer'
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* General User Directory Table */}
            <div className="card">
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '1rem', 
                marginBottom: '1.25rem',
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: '1.25rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <h3 className="card-title" style={{ margin: 0 }}>Directorio General de Usuarios</h3>
                  
                  {/* Reset Filters button */}
                  {(filterColegioId || filterGrupoId || filterRol || searchUsuario) && (
                    <button 
                      onClick={() => {
                        setFilterColegioId('');
                        setFilterGrupoId('');
                        setFilterRol('');
                        setSearchUsuario('');
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      Limpiar Filtros
                    </button>
                  )}
                </div>

                {/* Filters Grid */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                  gap: '1rem',
                  alignItems: 'end'
                }}>
                  {/* Search Term */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Buscar Texto</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="🔍 Nombre, correo..."
                      value={searchUsuario}
                      onChange={(e) => setSearchUsuario(e.target.value)}
                      style={{ height: '38px' }}
                    />
                  </div>

                  {/* School Filter */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Colegio</label>
                    <select
                      className="form-control"
                      value={filterColegioId}
                      onChange={(e) => {
                        setFilterColegioId(e.target.value);
                        setFilterGrupoId(''); // Reset group filter if school changes
                      }}
                      style={{ height: '38px' }}
                    >
                      <option value="">-- Todos los Colegios --</option>
                      {visibleColegios.map(c => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                    </select>
                  </div>

                  {/* Group Filter */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Grupo</label>
                    <select
                      className="form-control"
                      value={filterGrupoId}
                      onChange={(e) => setFilterGrupoId(e.target.value)}
                      style={{ height: '38px' }}
                    >
                      <option value="">-- Todos los Grupos --</option>
                      {visibleGrupos
                        .filter(g => !filterColegioId || g.colegio_id === filterColegioId)
                        .map(g => {
                          const col = colegios.find(c => c.id === g.colegio_id);
                          return (
                            <option key={g.id} value={g.id}>
                              {g.nombre_grupo} {col ? `(${col.nombre})` : ''}
                            </option>
                          );
                        })}
                    </select>
                  </div>

                  {/* Role Filter */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Rol</label>
                    <select
                      className="form-control"
                      value={filterRol}
                      onChange={(e) => setFilterRol(e.target.value)}
                      style={{ height: '38px' }}
                    >
                      <option value="">-- Todos los Roles --</option>
                      <option value="estudiante">Estudiante</option>
                      <option value="docente">Docente</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Sub-tab Toggle Layout for user status */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                <button 
                  onClick={() => { setUserSubTab('activos'); }} 
                  className={`btn ${userSubTab === 'activos' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  style={{ borderRadius: '4px' }}
                >
                  Usuarios Activos y Personal
                </button>
                <button 
                  onClick={() => { setUserSubTab('bajas'); }} 
                  className={`btn ${userSubTab === 'bajas' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  style={{ borderRadius: '4px' }}
                >
                  Alumnos Dados de Baja ({visibleUsuarios.filter(u => u.rol === 'estudiante' && u.estado === 'baja').length})
                </button>
              </div>

              <div className="table-container">
                {filteredUsuarios.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <h4>No se encontraron coincidencias</h4>
                    <p style={{ fontSize: '0.85rem' }}>No hay usuarios en esta sección que coincidan con los filtros seleccionados.</p>
                  </div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Usuario</th>
                        <th>Rol</th>
                        <th>Colegio / Grupo Asociado</th>
                        <th style={{ width: '180px', textAlign: 'center' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsuarios.map((u) => {
                        let association = 'N/A';
                        if (u.rol === 'estudiante') {
                          if (u.grupo_id) {
                            const grp = grupos.find(g => g.id === u.grupo_id);
                            const col = grp ? colegios.find(c => c.id === grp.colegio_id) : null;
                            association = col && grp ? `${col.nombre} - ${grp.nombre_grupo}` : 'Grupo Inválido';
                          } else {
                            association = 'Sin Colegio / Grupo (Flotante)';
                          }
                        } else if (u.rol === 'docente') {
                          const col = colegios.find(c => c.docente_id === u.id);
                          association = col ? `Docente de ${col.nombre}` : 'Docente sin Colegio';
                        }
                        
                        return (
                          <tr key={u.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div>
                                  <strong style={{ color: 'var(--text-title)' }}>{u.nombre_completo || u.email.split('@')[0]}</strong>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email}</div>
                                </div>
                                <button
                                  onClick={() => handleStartEditStudent(u)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '0.25rem',
                                    color: 'var(--color-primary)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    borderRadius: '50%',
                                    transition: 'background-color 0.2s'
                                  }}
                                  title="Editar Nombre de Usuario"
                                >
                                  <Edit size={14} />
                                </button>
                              </div>
                            </td>
                            <td>
                              <span className={`badge ${
                                u.rol === 'admin' ? 'badge-danger' : u.rol === 'docente' ? 'badge-warning' : 'badge-primary'
                              }`}>
                                {u.rol}
                              </span>
                            </td>
                            <td style={{ 
                              color: u.grupo_id || u.rol !== 'estudiante' ? 'var(--text-main)' : 'var(--color-error)', 
                              fontWeight: u.grupo_id || u.rol !== 'estudiante' ? 'normal' : 'bold' 
                            }}>
                              {association}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {u.rol === 'estudiante' ? (
                                u.estado === 'baja' ? (
                                  <button
                                    onClick={() => handleReactivateStudent(u.id)}
                                    className="btn btn-success btn-sm"
                                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.7rem', borderRadius: '4px' }}
                                  >
                                    Reactivar Alumno
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleDeactivateStudent(u.id)}
                                    className="btn btn-danger btn-sm"
                                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.7rem', borderRadius: '4px' }}
                                  >
                                    Dar de Baja
                                  </button>
                                )
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Personal del Sistema</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}

        {/* TAB: MOTOR DE EXAMENES */}
        {activeTab === 'motor' && (
          <>
            <div>
              <h2>Motor de Configuración de Simulacros</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Configura la estructura para la extracción aleatoria de preguntas semilla por componente en las pruebas.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '1.5rem' }}>
              {/* Form Configurator */}
              <div className="card" id="tour-admin-exam-config">
                <h3 className="card-title">Preguntas por Área Académica</h3>
                <form onSubmit={handleSaveExamConfig} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  
                  {Object.keys(examConfig).map((key) => {
                    const comp = key as ComponenteICFES;
                    const countAvailable = preguntas.filter(q => q.componente === comp).length;
                    return (
                      <div key={comp} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        paddingBottom: '0.75rem',
                        borderBottom: '1px solid var(--border-color)'
                      }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-title)' }}>{comp}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <input
                            type="number"
                            className="form-control"
                            style={{ width: '80px', textAlign: 'center', padding: '0.375rem' }}
                            value={examConfig[comp]}
                            onChange={(e) => handleConfigChange(comp, parseInt(e.target.value) || 0)}
                            min={1}
                            max={countAvailable}
                            required
                          />
                          <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>/ {countAvailable} disp.</span>
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ 
                    marginTop: '1rem',
                    backgroundColor: 'var(--bg-app)',
                    padding: '1rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    fontSize: '0.875rem'
                  }}>
                    <span>
                      <strong>Total Preguntas del Simulacro: </strong>
                      <span style={{ color: 'var(--color-primary)', fontWeight: '800', fontSize: '1.1rem' }}>
                        {Object.values(examConfig).reduce((a, b) => a + b, 0)} preguntas.
                      </span>
                    </span>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}>
                    Guardar Configuración
                  </button>
                </form>
              </div>

              {/* Informative & Import Column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Upload Card */}
                <div className="card" style={{ height: 'fit-content', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h3 className="card-title">
                    <Upload size={20} style={{ color: 'var(--color-primary)' }} />
                    Cargar Banco de Preguntas
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', margin: 0 }}>
                    Sube un archivo de Excel (.xlsx / .xls) para importar nuevas preguntas.
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <button 
                      id="tour-admin-download-template"
                      onClick={handleDownloadTemplate} 
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                    >
                      <Download size={14} />
                      Descargar Plantilla de Ejemplo
                    </button>

                    <div 
                      id="tour-admin-upload-zone"
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      style={{ 
                        border: isDragging ? '2px dashed var(--color-primary)' : '2px dashed var(--border-color)', 
                        borderRadius: 'var(--radius-sm)', 
                        padding: '1.75rem 1rem', 
                        textAlign: 'center',
                        backgroundColor: isDragging ? 'var(--bg-orange-light)' : 'var(--bg-app)',
                        boxShadow: isDragging ? '0 0 12px rgba(255, 81, 0, 0.25)' : 'none',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'all 0.2s ease-in-out'
                      }}
                    >
                      <Upload size={28} style={{ color: isDragging ? 'var(--color-primary)' : 'var(--text-muted)', marginBottom: '0.5rem', transition: 'color 0.2s ease-in-out' }} />
                      <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-title)' }}>
                        {isDragging ? '¡Suelta el archivo aquí!' : 'Arrastra o Selecciona archivo Excel'}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Formatos soportados: .xlsx, .xls
                      </span>
                      <input 
                        type="file" 
                        accept=".xlsx, .xls" 
                        onChange={handleImportExcel}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          opacity: 0,
                          cursor: 'pointer'
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Informative area */}
                <div className="card" style={{ height: 'fit-content', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h3 className="card-title">
                    <HelpCircle size={20} style={{ color: 'var(--color-blue)' }} />
                    Información Técnica del Banco
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', margin: 0 }}>
                    El banco de datos cuenta actualmente con un total de <strong>{preguntas.length} preguntas</strong>, distribuidas de la siguiente manera:
                  </p>
                  <ul style={{ paddingLeft: '1.25rem', fontSize: '0.825rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <li>Matemáticas ({preguntas.filter(q => q.componente === 'Matemáticas').length})</li>
                    <li>Ciencias Naturales ({preguntas.filter(q => q.componente === 'Ciencias Naturales').length})</li>
                    <li>Ciencias Sociales ({preguntas.filter(q => q.componente === 'Ciencias Sociales').length})</li>
                    <li>Lectura Crítica ({preguntas.filter(q => q.componente === 'Lectura Crítica').length})</li>
                    <li>Inglés ({preguntas.filter(q => q.componente === 'Inglés').length})</li>
                  </ul>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                    Al iniciar un simulacro, el sistema realiza una selección aleatoria (shuffling) por componente para asegurar exámenes únicos y evitar repeticiones consecutivas.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* TAB: BITACORA DE ERRORES */}
        {activeTab === 'bitacora' && currentUser.rol === 'admin' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2>Bitácora del Sistema</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Auditoría de accesos de docentes y registro diagnóstico de excepciones técnicas.
                </p>
              </div>
              {bitacoraSubTab === 'errores' && (
                <button onClick={handleSimulateDBError} className="btn btn-danger btn-sm">
                  Probar Captura de Fallo
                </button>
              )}
            </div>

            {/* Copia de Seguridad y Respaldo (Solo para Admin) */}
            <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Settings size={20} style={{ color: 'var(--color-primary)' }} />
                Copia de Seguridad y Respaldo del Sistema
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', margin: 0 }}>
                Descarga una copia completa de toda la información de la base de datos (colegios, grupos, alumnos, docentes, configuraciones y reportes de exámenes) en formato JSON. Si borras el caché del navegador, puedes cargar este archivo de respaldo para restaurar todo el estado anterior.
              </p>
              
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button 
                  onClick={handleExportDatabaseJSON}
                  className="btn btn-primary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Download size={14} />
                  Descargar Copia de Seguridad (JSON)
                </button>

                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <button 
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <Upload size={14} />
                    Cargar Copia de Seguridad (JSON)
                  </button>
                  <input 
                    type="file" 
                    accept=".json"
                    onChange={handleImportDatabaseJSON}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      opacity: 0,
                      cursor: 'pointer'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Sub-tab Toggle */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <button 
                onClick={() => setBitacoraSubTab('errores')} 
                className={`btn ${bitacoraSubTab === 'errores' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                style={{ borderRadius: '4px' }}
              >
                Errores Técnicos
              </button>
              <button 
                onClick={() => setBitacoraSubTab('accesos')} 
                className={`btn ${bitacoraSubTab === 'accesos' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                style={{ borderRadius: '4px' }}
              >
                Accesos de Docentes
              </button>
            </div>

            {bitacoraSubTab === 'errores' ? (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <h3 className="card-title" style={{ margin: 0 }}>Registro de Errores Técnicos</h3>
                  <button 
                    onClick={handleExportBitacoraExcel} 
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    disabled={bitacora.length === 0}
                  >
                    <Download size={14} />
                    Descargar Reporte Excel
                  </button>
                </div>
                {bitacora.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    <CheckCircle size={40} style={{ color: 'var(--color-success)', marginBottom: '1rem' }} />
                    <h4>Sin errores en bitácora</h4>
                    <p>La plataforma está funcionando perfectamente y no ha registrado excepciones.</p>
                  </div>
                ) : (
                  <div className="table-container">
                    <table className="data-table" style={{ fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '180px' }}>Timestamp</th>
                          <th style={{ width: '150px' }}>Código Error</th>
                          <th>Descripción del Error</th>
                          <th style={{ width: '150px' }}>Usuario ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...bitacora].reverse().map((err) => (
                          <tr key={err.id}>
                            <td className="font-mono">{new Date(err.timestamp).toLocaleString()}</td>
                            <td>
                              <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                                {err.codigo_error}
                              </span>
                            </td>
                            <td className="font-mono" style={{ color: 'var(--color-error)', whiteSpace: 'pre-wrap' }}>
                              {err.descripcion}
                            </td>
                            <td className="font-mono">{err.usuario_id || 'Null / No Autenticado'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div>
                    <h3 className="card-title" style={{ margin: 0 }}>Bitácora de Accesos de Docentes</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.25rem 0 0 0' }}>
                      Lista de docentes registrados y cantidad de veces que han iniciado sesión.
                    </p>
                  </div>
                  <button 
                    onClick={handleExportBitacoraExcel} 
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    disabled={usuarios.filter(u => u.rol === 'docente').length === 0}
                  >
                    <Download size={14} />
                    Descargar Reporte Excel
                  </button>
                </div>
                {usuarios.filter(u => u.rol === 'docente').length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                    No hay docentes dados de alta en el sistema.
                  </p>
                ) : (
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Docente</th>
                          <th>Correo Electrónico</th>
                          <th style={{ textAlign: 'center' }}>Cantidad de Accesos</th>
                          <th>Última Actividad / Conexión</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usuarios.filter(u => u.rol === 'docente').map((doc) => {
                          const isOnline = doc.last_active_at && (Date.now() - new Date(doc.last_active_at).getTime() < 300000);
                          return (
                            <tr key={doc.id}>
                              <td>
                                <strong>{doc.nombre_completo || 'Docente'}</strong>
                              </td>
                              <td className="font-mono">{doc.email}</td>
                              <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '1.05rem' }}>
                                {doc.login_count || 0}
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  {isOnline ? (
                                    <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                      <span style={{ width: '6px', height: '6px', backgroundColor: '#ffffff', borderRadius: '50%', display: 'inline-block' }} />
                                      En Línea
                                    </span>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                      {doc.last_active_at ? new Date(doc.last_active_at).toLocaleString() : 'Sin registro'}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Guía Modal de Administración SaberPRO */}
      {showGuiaModal && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-content" style={{ maxWidth: '600px', width: '90%' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <img src="/buho.png" alt="Búho" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                <div>
                  <h3 style={{ margin: 0, color: 'var(--text-title)' }}>¿Cómo funciona SaberPRO?</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 600 }}>Guía de Inicio de Administración</span>
                </div>
              </div>
              <button 
                onClick={() => setShowGuiaModal(false)} 
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                &times;
              </button>
            </div>
            
            <div style={{ maxHeight: '380px', overflowY: 'auto', paddingRight: '0.5rem', fontSize: '0.875rem', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p>
                ¡Bienvenido a <strong>SaberPRO</strong>! Esta guía de onboarding te enseñará a administrar colegios, grupos y estudiantes de manera efectiva:
              </p>
              
              <div style={{ backgroundColor: 'var(--bg-app)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-primary)' }}>1. Estructura Académica (Colegios y Grupos)</h4>
                <p style={{ margin: 0, fontSize: '0.825rem' }}>
                  En la pestaña <strong>"Colegios y Grupos"</strong>, puedes dar de alta nuevas instituciones educativas (Colegios) y estructurar sus respectivos grados académicos (por ejemplo: "Grado 11-01").
                </p>
              </div>

              <div style={{ backgroundColor: 'var(--bg-app)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-primary)' }}>2. Registro de Usuarios y Alumnos</h4>
                <p style={{ margin: 0, fontSize: '0.825rem' }}>
                  En <strong>"Gestión de Usuarios"</strong> registras las cuentas del sistema (Docentes o Estudiantes). Los estudiantes requieren obligatoriamente estar asociados a un grupo escolar para realizar exámenes. Si hay alumnos sin asignar, verás alertas y listas rápidas para asociarlos de inmediato.
                </p>
              </div>

              <div style={{ backgroundColor: 'var(--bg-app)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-primary)' }}>3. Configuración de Exámenes</h4>
                <p style={{ margin: 0, fontSize: '0.825rem' }}>
                  En la barra superior de la pestaña <strong>"Panel de Control"</strong>, puedes ajustar globalmente cuántas preguntas de cada materia (Matemáticas, Lectura Crítica, Ciencias, etc.) contendrán las futuras simulaciones generadas para los estudiantes.
                </p>
              </div>

              <div style={{ backgroundColor: 'var(--bg-app)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-primary)' }}>4. Monitoreo y Diplomas PDF</h4>
                <p style={{ margin: 0, fontSize: '0.825rem' }}>
                  Al culminar un examen, el sistema evalúa y asigna puntuaciones en tiempo real. En la pestaña **Simulacros**, puedes auditar resultados, revisar respuestas correctas e incorrectas, y exportar reportes de calificación individuales en PDF oficial del ICFES.
                </p>
              </div>

              <div style={{ backgroundColor: 'var(--bg-warning-light)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245,158,11,0.2)', fontSize: '0.825rem' }}>
                <strong>💡 Nota de Desarrollador:</strong> Todos los datos persisten localmente en tu navegador. Puedes restaurar las escuelas y cuentas demo predeterminadas usando el botón <strong>"Reiniciar BD"</strong> en la cabecera superior en cualquier momento.
              </div>
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button 
                onClick={() => {
                  setShowGuiaModal(false);
                  setIsTourOpen(true);
                }} 
                className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
              >
                <HelpCircle size={14} />
                Iniciar Tour Guiado
              </button>
              <button onClick={() => setShowGuiaModal(false)} className="btn btn-secondary">
                Entendido
              </button>
              <button 
                onClick={() => {
                  setShowGuiaModal(false);
                  setActiveTab('colegios');
                }} 
                className="btn btn-primary"
              >
                Comenzar Configuración
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Preview Modal */}
      {showExcelPreviewModal && (
        <div className="modal-overlay" style={{ zIndex: 1001 }}>
          <div className="modal-content" style={{ maxWidth: '850px', width: '95%' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Upload size={24} style={{ color: 'var(--color-primary)' }} />
                <div>
                  <h3 style={{ margin: 0, color: 'var(--text-title)' }}>Previsualización de Preguntas Importadas</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 600 }}>Carga y Validación en Tiempo Real</span>
                </div>
              </div>
              <button 
                onClick={() => { setShowExcelPreviewModal(false); setExcelPreviewRows([]); }} 
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                &times;
              </button>
            </div>

            {/* Validation Banner Summary */}
            {(() => {
              const total = excelPreviewRows.length;
              const validCount = excelPreviewRows.filter(r => r.isValid).length;
              const errorCount = total - validCount;

              return (
                <div style={{ 
                  backgroundColor: errorCount > 0 ? 'var(--bg-warning-light)' : 'var(--bg-success-alert)',
                  border: errorCount > 0 ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)',
                  color: errorCount > 0 ? 'var(--color-warning)' : 'var(--color-success)',
                  padding: '0.85rem 1.25rem',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  fontSize: '0.875rem'
                }}>
                  {errorCount > 0 ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
                  <div>
                    <strong>
                      {errorCount > 0 
                        ? `Se detectaron ${errorCount} filas con errores en el archivo.` 
                        : '¡Excelente! Todas las filas son válidas y están listas para importarse.'}
                    </strong>
                    <span style={{ display: 'block', fontSize: '0.78rem', opacity: 0.9, marginTop: '0.15rem' }}>
                      {errorCount > 0 
                        ? `Puedes confirmar para importar únicamente las ${validCount} preguntas válidas (las erróneas se omitirán automáticamente).` 
                        : `Se importarán las ${validCount} preguntas al banco de datos.`}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Table Scroll Area */}
            <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
              <table className="data-table" style={{ fontSize: '0.8rem', width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-card)', zIndex: 1 }}>
                  <tr>
                    <th style={{ width: '50px', textAlign: 'center' }}>Fila</th>
                    <th style={{ width: '120px' }}>Componente</th>
                    <th>Enunciado</th>
                    <th style={{ width: '130px' }}>Opciones (A,B,C,D)</th>
                    <th style={{ width: '60px', textAlign: 'center' }}>Rpta</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>Dificultad</th>
                    <th style={{ width: '180px' }}>Estado / Detalles</th>
                  </tr>
                </thead>
                <tbody>
                  {excelPreviewRows.map((row, idx) => (
                    <tr key={idx} style={{ 
                      backgroundColor: row.isValid ? 'transparent' : 'rgba(239, 68, 68, 0.05)',
                      borderBottom: '1px solid var(--border-color)'
                    }}>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{row.rowNum}</td>
                      <td style={{ color: row.componente ? 'var(--text-title)' : 'var(--color-error)', fontWeight: row.componente ? 'bold' : 'normal' }}>
                        {row.componente || '<Vacio>'}
                      </td>
                      <td style={{ 
                        maxWidth: '220px', 
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis' 
                      }} title={row.enunciado}>
                        {row.enunciado || <span style={{ color: 'var(--color-error)' }}>&lt;Falta Enunciado&gt;</span>}
                      </td>
                      <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '130px' }}>
                          <strong>A:</strong> {row.opcionA || '-'}<br/>
                          <strong>B:</strong> {row.opcionB || '-'}<br/>
                          <strong>C:</strong> {row.opcionC || '-'}<br/>
                          <strong>D:</strong> {row.opcionD || '-'}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 800, color: row.respuestaCorrecta ? 'var(--text-title)' : 'var(--color-error)' }}>
                        {row.respuestaCorrecta || '-'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${
                          row.dificultad === 'alto' ? 'badge-danger' : row.dificultad === 'medio' ? 'badge-warning' : 'badge-success'
                        }`} style={{ fontSize: '0.65rem' }}>
                          {row.dificultad || 'n/a'}
                        </span>
                      </td>
                      <td>
                        {row.isValid ? (
                          <span style={{ color: 'var(--color-success)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <CheckCircle size={14} /> Listo
                          </span>
                        ) : (
                          <div style={{ color: 'var(--color-error)', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            {row.errors.map((err: string, eIdx: number) => (
                              <span key={eIdx} style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                <AlertTriangle size={12} /> {err}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button 
                onClick={() => { setShowExcelPreviewModal(false); setExcelPreviewRows([]); }} 
                className="btn btn-secondary"
              >
                Cancelar Carga
              </button>
              <button 
                onClick={handleConfirmExcelImport} 
                className="btn btn-primary"
                disabled={excelPreviewRows.filter(r => r.isValid).length === 0}
              >
                <CheckCircle size={16} />
                Importar Filas Válidas ({excelPreviewRows.filter(r => r.isValid).length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Excel Preview Modal (Nuevo) */}
      {showStudentExcelPreviewModal && (
        <div className="modal-overlay" style={{ zIndex: 1002 }}>
          <div className="modal-content" style={{ maxWidth: '750px', width: '95%' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Upload size={24} style={{ color: 'var(--color-primary)' }} />
                <div>
                  <h3 style={{ margin: 0, color: 'var(--text-title)' }}>Previsualización de Alumnos Importados</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 600 }}>Carga y Validación de Cuentas de Alumnos</span>
                </div>
              </div>
              <button 
                onClick={() => { setShowStudentExcelPreviewModal(false); setStudentExcelPreviewRows([]); }} 
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                &times;
              </button>
            </div>

            {/* Validation Banner Summary */}
            {(() => {
              const total = studentExcelPreviewRows.length;
              const validCount = studentExcelPreviewRows.filter(r => r.isValid).length;
              const errorCount = total - validCount;

              return (
                <div style={{ 
                  backgroundColor: errorCount > 0 ? 'var(--bg-warning-light)' : 'var(--bg-success-alert)',
                  border: errorCount > 0 ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)',
                  color: errorCount > 0 ? 'var(--color-warning)' : 'var(--color-success)',
                  padding: '0.85rem 1.25rem',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  fontSize: '0.875rem'
                }}>
                  {errorCount > 0 ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
                  <div>
                    <strong>
                      {errorCount > 0 
                        ? `Se detectaron ${errorCount} alumnos con errores.` 
                        : '¡Excelente! Todos los alumnos son válidos y listos para registrar.'}
                    </strong>
                    <span style={{ display: 'block', fontSize: '0.78rem', opacity: 0.9, marginTop: '0.15rem' }}>
                      {errorCount > 0 
                        ? `Puedes confirmar para registrar únicamente a los ${validCount} alumnos válidos.` 
                        : `Se registrarán ${validCount} alumnos en el sistema.`}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Table Scroll Area */}
            <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
              <table className="data-table" style={{ fontSize: '0.8rem', width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-card)', zIndex: 1 }}>
                  <tr>
                    <th style={{ width: '50px', textAlign: 'center' }}>Fila</th>
                    <th>Nombre Completo</th>
                    <th>Correo Alias</th>
                    <th>Contraseña</th>
                    <th>Colegio</th>
                    <th>Grupo</th>
                    <th>Estado / Detalles</th>
                  </tr>
                </thead>
                <tbody>
                  {studentExcelPreviewRows.map((row, idx) => (
                    <tr key={idx} style={{ 
                      backgroundColor: row.isValid ? 'transparent' : 'rgba(239, 68, 68, 0.05)',
                      borderBottom: '1px solid var(--border-color)'
                    }}>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{row.rowNum}</td>
                      <td style={{ fontWeight: 'bold', color: row.nombreCompleto ? 'var(--text-title)' : 'var(--color-error)' }}>
                        {row.nombreCompleto || '<Vacio>'}
                      </td>
                      <td style={{ color: row.correoAlias ? 'var(--text-main)' : 'var(--color-error)' }}>
                        {row.correoAlias || '<Vacio>'}
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>
                        {row.contrasena || <span style={{ color: 'var(--color-error)' }}>&lt;Falta&gt;</span>}
                      </td>
                      <td>{row.colegio || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin Asignar</span>}</td>
                      <td>{row.grupo || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin Asignar</span>}</td>
                      <td>
                        {row.isValid ? (
                          <span style={{ color: 'var(--color-success)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <CheckCircle size={14} /> Válido
                          </span>
                        ) : (
                          <div style={{ color: 'var(--color-error)', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            {row.errors.map((err: string, eIdx: number) => (
                              <span key={eIdx} style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                <AlertTriangle size={12} /> {err}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button 
                onClick={() => { setShowStudentExcelPreviewModal(false); setStudentExcelPreviewRows([]); }} 
                className="btn btn-secondary"
              >
                Cancelar Carga
              </button>
              <button 
                onClick={handleConfirmStudentExcelImport} 
                className="btn btn-primary"
                disabled={studentExcelPreviewRows.filter(r => r.isValid).length === 0}
              >
                <CheckCircle size={16} />
                Registrar Alumnos Válidos ({studentExcelPreviewRows.filter(r => r.isValid).length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar Colegio */}
      {editingColegio && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-content" style={{ maxWidth: '500px', width: '90%' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Editar Colegio: {editingColegio.nombre}</h3>
              <button 
                onClick={() => setEditingColegio(null)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-muted)' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveEditColegio} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="form-group">
                <label className="form-label">Nombre del Colegio *</label>
                <input
                  type="text"
                  className="form-control"
                  value={editColegioNombre}
                  onChange={(e) => setEditColegioNombre(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Docente Asignado</label>
                <select
                  className="form-control"
                  value={editColegioDocenteId}
                  onChange={(e) => setEditColegioDocenteId(e.target.value)}
                >
                  <option value="">-- Sin Asignar --</option>
                  {usuarios.filter(u => u.rol === 'docente' && u.estado !== 'baja').map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.nombre_completo || doc.email} ({doc.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">NIT (Opcional)</label>
                <input
                  type="text"
                  className="form-control"
                  value={editColegioNit}
                  onChange={(e) => setEditColegioNit(e.target.value)}
                  placeholder="Ej: 900.123.456-7"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Dirección</label>
                <input
                  type="text"
                  className="form-control"
                  value={editColegioDireccion}
                  onChange={(e) => setEditColegioDireccion(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Teléfono</label>
                <input
                  type="text"
                  className="form-control"
                  value={editColegioTelefono}
                  onChange={(e) => setEditColegioTelefono(e.target.value)}
                />
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button 
                  type="button" 
                  onClick={() => setEditingColegio(null)} 
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Perfil de Alumno / Usuario */}
      {editingStudent && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-content" style={{ maxWidth: '400px', width: '90%' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Editar Nombre de Usuario</h3>
              <button 
                onClick={() => setEditingStudent(null)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-muted)' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveEditStudent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ backgroundColor: 'var(--bg-app)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', border: '1px solid var(--border-color)' }}>
                <strong>Usuario:</strong> {editingStudent.email}<br />
                <strong>Rol:</strong> {editingStudent.rol}
              </div>

              <div className="form-group">
                <label className="form-label">Nombre Completo *</label>
                <input
                  type="text"
                  className="form-control"
                  value={editStudentNombreCompleto}
                  onChange={(e) => setEditStudentNombreCompleto(e.target.value)}
                  placeholder="Ej: Juan Pérez"
                  required
                  autoFocus
                />
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button 
                  type="button" 
                  onClick={() => setEditingStudent(null)} 
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
        steps={visibleTourSteps} 
        onComplete={handleTourComplete} 
        isOpen={isTourOpen} 
      />
    </div>
  );
};
