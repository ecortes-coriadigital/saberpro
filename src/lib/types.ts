export type ComponenteICFES = 
  | 'Ciencias Naturales' 
  | 'Ciencias Sociales' 
  | 'Inglés' 
  | 'Lectura Crítica' 
  | 'Matemáticas';

export type RolUsuario = 'admin' | 'docente' | 'estudiante';

export type DificultadPregunta = 'bajo' | 'medio' | 'alto';

// 1. Colegios
export interface Colegio {
  id: string; // UUID
  nombre: string;
  docente_id: string | null; // FK -> Usuario (docente asignado)
  metadata: {
    nit?: string;
    direccion?: string;
    telefono?: string;
    fecha_registro: string;
  };
}

// 2. Grupos
export interface Grupo {
  id: string; // UUID
  colegio_id: string; // FK -> Colegio
  nombre_grupo: string;
}

// 3. Usuarios
export interface Usuario {
  id: string; // UUID
  email: string;
  password_hash: string;
  rol: RolUsuario;
  grupo_id: string | null; // FK -> Grupo (Solo si rol === 'estudiante')
  nombre_completo?: string; // Nombre completo de la persona
  login_count?: number; // Veces que ha ingresado a la sesión
  last_active_at?: string; // Fecha de última actividad en línea
  estado?: 'activo' | 'baja'; // Estado de la cuenta
}

// 4. Preguntas
export interface Pregunta {
  id: string; // UUID
  componente: ComponenteICFES;
  texto_pregunta: string;
  opciones_json: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  respuesta_correcta: 'A' | 'B' | 'C' | 'D';
  dificultad: DificultadPregunta;
}

// 5. Simulacros
export interface Simulacro {
  id: string; // UUID
  estudiante_id: string; // FK -> Usuario
  fecha_inicio: string; // ISO String
  fecha_fin: string | null; // ISO String
  estado: 'en_progreso' | 'terminado';
  preguntas_ids: string[]; // List of question IDs selected for this exam
  respuestas_json: Record<string, 'A' | 'B' | 'C' | 'D' | ''>; // maps pregunta_id -> answer
  configuracion_preguntas: Record<ComponenteICFES, number>; // number of questions per subject
}

// 6. Resultados (Por componente para cada simulacro)
export interface Resultado {
  id: string; // UUID
  simulacro_id: string; // FK -> Simulacro
  componente: ComponenteICFES;
  puntaje_obtenido: number; // Escala 0 a 100
  respuestas_alumno_json: Record<string, 'A' | 'B' | 'C' | 'D' | ''>; // pregunta_id -> respuesta
}

// 7. Bitácora de Errores (Diagnóstico Técnico)
export interface BitacoraError {
  id: string; // UUID
  timestamp: string; // ISO String
  codigo_error: string;
  descripcion: string;
  usuario_id: string | null; // FK -> Usuario (si hay sesión activa)
}
