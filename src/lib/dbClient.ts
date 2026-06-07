import type { 
  Colegio, 
  Grupo, 
  Usuario, 
  Pregunta, 
  Simulacro, 
  Resultado, 
  BitacoraError, 
  ComponenteICFES, 
  RolUsuario,
  DificultadPregunta
} from './types';
import { indexedDbClient } from './indexedDbClient';

// Helper to generate UUIDs locally
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Global error logging function
export function logSystemError(codigo: string, descripcion: string, usuarioId: string | null = null): void {
  try {
    const errorLog: BitacoraError = {
      id: generateUUID(),
      timestamp: new Date().toISOString(),
      codigo_error: codigo,
      descripcion,
      usuario_id: usuarioId
    };
    const errors = JSON.parse(localStorage.getItem('db_bitacora_errores') || '[]');
    errors.push(errorLog);
    localStorage.setItem('db_bitacora_errores', JSON.stringify(errors));
  } catch (e) {
    console.error('Error logging to bitacora_errores:', e);
  }
}

// Hook up global window error handling
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const currentUserId = localStorage.getItem('session_user_id');
    logSystemError(
      'CLIENT_JS_ERROR',
      `Unhandled error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`,
      currentUserId
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    const currentUserId = localStorage.getItem('session_user_id');
    logSystemError(
      'CLIENT_PROMISE_REJECTION',
      `Unhandled Promise rejection: ${event.reason}`,
      currentUserId
    );
  });
}

// ----------------------------------------------------
// DB CLIENT IMPLEMENTATION
// ----------------------------------------------------
export const dbClient = {
  // Reset and Seed everything
  initialize: (forceReset = false) => {
    try {
      const initialized = localStorage.getItem('db_initialized');
      if (initialized && !forceReset) {
        return;
      }

      // Clear all
      localStorage.removeItem('db_colegios');
      localStorage.removeItem('db_grupos');
      localStorage.removeItem('db_usuarios');
      localStorage.removeItem('db_preguntas');
      localStorage.removeItem('db_simulacros');
      localStorage.removeItem('db_resultados');
      localStorage.removeItem('db_bitacora_errores');

      // 1. Seed Docente ID first to link it to Colegio
      const docenteId = generateUUID();
      const colegioId = generateUUID();

      const colegios: Colegio[] = [
        {
          id: colegioId,
          nombre: 'Colegio Distrital Jaime Colombia',
          docente_id: docenteId,
          metadata: {
            nit: '900.123.456-7',
            direccion: 'Calle 100 #20-30, Bogotá D.C.',
            telefono: '3109999999',
            fecha_registro: new Date().toISOString()
          }
        }
      ];

      // 2. Seed Grupos
      const grupo1Id = generateUUID();
      const grupo2Id = generateUUID();
      const grupos: Grupo[] = [
        { id: grupo1Id, colegio_id: colegioId, nombre_grupo: 'Grado 11-01' },
        { id: grupo2Id, colegio_id: colegioId, nombre_grupo: 'Grado 11-02' }
      ];

      // 3. Seed Usuarios (admin, docente, estudiante1, estudiante2, estudiante3)
      const usuarios: Usuario[] = [
        {
          id: generateUUID(),
          email: 'admin@icfes.com',
          password_hash: 'admin123', // stored plain for demo login simplicity
          rol: 'admin',
          grupo_id: null,
          nombre_completo: 'Administrador General',
          login_count: 0,
          estado: 'activo'
        },
        {
          id: docenteId,
          email: 'docente@icfes.com',
          password_hash: 'docente123',
          rol: 'docente',
          grupo_id: null,
          nombre_completo: 'Docente Principal',
          login_count: 0,
          estado: 'activo'
        },
        {
          id: generateUUID(),
          email: 'estudiante1@icfes.com',
          password_hash: 'estudiante123',
          rol: 'estudiante',
          grupo_id: grupo1Id,
          nombre_completo: 'Estudiante Uno',
          login_count: 0,
          estado: 'activo'
        },
        {
          id: generateUUID(),
          email: 'estudiante2@icfes.com', // Student without group assigned yet
          password_hash: 'estudiante123',
          rol: 'estudiante',
          grupo_id: null,
          nombre_completo: 'Estudiante Dos',
          login_count: 0,
          estado: 'activo'
        },
        {
          id: generateUUID(),
          email: 'estudiante3@icfes.com',
          password_hash: 'estudiante123',
          rol: 'estudiante',
          grupo_id: grupo2Id,
          nombre_completo: 'Estudiante Tres',
          login_count: 0,
          estado: 'activo'
        }
      ];

      // 4. Generate 500 Questions (100 per component)
      const preguntas: Pregunta[] = [];
      const areas: ComponenteICFES[] = [
        'Ciencias Naturales',
        'Ciencias Sociales',
        'Inglés',
        'Lectura Crítica',
        'Matemáticas'
      ];

      // Mathematical question templates
      const mathTemplates = [
        (i: number) => ({
          texto: `Si en una pastelería se venden ${i + 5} pasteles al día por un valor de $${(i + 1) * 5000} cada uno, y los costos fijos diarios son de $${i * 1000 + 2000}. ¿Cuál es la ganancia diaria neta de la pastelería?`,
          opciones: {
            A: `$${(i + 5) * (i + 1) * 5000 - (i * 1000 + 2000)} pesos.`,
            B: `$${(i + 5) * (i + 1) * 4000} pesos.`,
            C: `$${(i + 5) * (i + 1) * 5000 + (i * 1000 + 2000)} pesos.`,
            D: `$${((i + 5) * (i + 1) * 5000) / 2} pesos.`
          },
          correcta: 'A' as const
        }),
        (i: number) => ({
          texto: `En un triángulo rectángulo, la hipotenusa mide ${i + 10} cm y uno de los catetos mide ${i + 6} cm. ¿Cuánto mide el otro cateto en centímetros? (Redondeado a un decimal si es necesario)`,
          opciones: {
            A: `${Math.sqrt(Math.pow(i + 10, 2) - Math.pow(i + 6, 2)).toFixed(1)} cm.`,
            B: `${(i + 10 + i + 6) / 2} cm.`,
            C: `${Math.sqrt(Math.pow(i + 10, 2) + Math.pow(i + 6, 2)).toFixed(1)} cm.`,
            D: `${i + 4} cm.`
          },
          correcta: 'A' as const
        }),
        (i: number) => ({
          texto: `Una empresa de telefonía cobra una tarifa básica mensual de $${i * 500 + 10000} más $${i + 50} por minuto adicional de llamada. Si un usuario pagó $${(i * 500 + 10000) + (i + 50) * (i + 10)} este mes, ¿cuántos minutos adicionales consumió?`,
          opciones: {
            A: `${i + 10} minutos.`,
            B: `${i + 5} minutos.`,
            C: `${i + 20} minutos.`,
            D: `${i * 2} minutos.`
          },
          correcta: 'A' as const
        })
      ];

      // Natural sciences templates
      const scienceTemplates = [
        (i: number) => ({
          texto: `Un objeto de masa ${i + 2} kg se desplaza sobre una superficie horizontal sin fricción a una velocidad constante de ${i + 3} m/s. Se le aplica una fuerza contraria al movimiento de ${i + 1} N. ¿Cuál será la aceleración del objeto?`,
          opciones: {
            A: `-${((i + 1) / (i + 2)).toFixed(2)} m/s² en dirección opuesta al movimiento.`,
            B: `${((i + 1) / (i + 2)).toFixed(2)} m/s² en la misma dirección del movimiento.`,
            C: `-${((i + 2) / (i + 1)).toFixed(2)} m/s².`,
            D: `0 m/s² ya que la velocidad es constante.`
          },
          correcta: 'A' as const
        }),
        (i: number) => ({
          texto: `Si disolvemos ${i + 10} gramos de cloruro de sodio (NaCl) en ${i * 50 + 200} gramos de agua destilada a 25°C. ¿Cuál es el porcentaje en masa (% m/m) de la solución resultante?`,
          opciones: {
            A: `${(((i + 10) / (i + 10 + i * 50 + 200)) * 100).toFixed(2)}%.`,
            B: `${(((i + 10) / (i * 50 + 200)) * 100).toFixed(2)}%.`,
            C: `${(i + 10)}%.`,
            D: `${(((i * 50 + 200) / (i + 10)) * 100).toFixed(2)}%.`
          },
          correcta: 'A' as const
        }),
        (_i: number) => ({
          texto: `En una cadena trófica de un ecosistema andino, ¿qué sucede directamente si la población de depredadores tope disminuye drásticamente debido a la caza ilegal?`,
          opciones: {
            A: `Aumenta descontroladamente la población de herbívoros (consumidores primarios), sobreexplotando a los productores.`,
            B: `Aumenta de inmediato la población de productores debido al abono orgánico.`,
            C: `Los descomponedores dejan de actuar por completo en la cadena.`,
            D: `No ocurre ningún cambio porque el ecosistema se autorregula instantáneamente.`
          },
          correcta: 'A' as const
        })
      ];

      // Social sciences templates
      const socialTemplates = [
        (i: number) => ({
          texto: `El artículo ${i + 1} de la Constitución Política de Colombia establece que Colombia es un Estado social de derecho, organizado en forma de República unitaria, descentralizada. Esta noción de "Estado social de derecho" busca principalmente:`,
          opciones: {
            A: `Garantizar la dignidad humana y los derechos fundamentales de todos los ciudadanos.`,
            B: `Centralizar todo el poder administrativo en el Presidente de la República.`,
            C: `Establecer un modelo económico estrictamente socialista y planificado.`,
            D: `Permitir que cada departamento dicte sus propias leyes de forma independiente.`
          },
          correcta: 'A' as const
        }),
        (_i: number) => ({
          texto: `Durante la primera mitad del siglo XX en Colombia, el proceso conocido como "La Violencia" bipartidista generó grandes olas migratorias del campo a la ciudad. Un impacto demográfico directo de este suceso fue:`,
          opciones: {
            A: `El crecimiento urbano acelerado y desordenado de las principales ciudades colombianas.`,
            B: `El repoblamiento masivo de las zonas agrícolas del país.`,
            C: `La disminución de la densidad poblacional en las grandes ciudades capitales.`,
            D: `La desaparición total del sector de servicios en el país.`
          },
          correcta: 'A' as const
        })
      ];

      // Reading templates
      const readingTemplates = [
        (i: number) => ({
          texto: `Fragmento filosófico ${i + 1}: "El conocimiento no es una vasija que se llena, sino un fuego que se enciende". De acuerdo con el texto anterior, ¿cuál de los siguientes enunciados representa mejor la crítica implícita en la metáfora del autor?`,
          opciones: {
            A: `Una crítica a la educación pasiva basada puramente en la memorización de contenidos.`,
            B: `Un rechazo rotundo a la lectura de libros clásicos de filosofía.`,
            C: `El argumento de que el cerebro humano tiene capacidad de almacenamiento limitada.`,
            D: `La idea de que el fuego destruye la verdad y las ideas tradicionales.`
          },
          correcta: 'A' as const
        }),
        (i: number) => ({
          texto: `Fragmento argumentativo ${i + 1}: "Las redes sociales han democratizado la expresión pública, pero simultáneamente han precarizado el debate al privilegiar la inmediatez sobre la reflexión". En este texto, la palabra "precarizado" puede reemplazarse, sin alterar el sentido global, por:`,
          opciones: {
            A: `Debilitado o empobrecido.`,
            B: `Mejorado o fortalecido.`,
            C: `Organizado o regulado.`,
            D: `Acelerado o dinamizado.`
          },
          correcta: 'A' as const
        })
      ];

      // English templates
      const englishTemplates = [
        (_i: number) => ({
          texto: `Complete the sentence with the correct grammatical option: "If she __________ hard for the ICFES exam last month, she would have scored higher."`,
          opciones: {
            A: `had studied`,
            B: `has studied`,
            C: `studied`,
            D: `would study`
          },
          correcta: 'A' as const
        }),
        (_i: number) => ({
          texto: `Select the option that best completes the conversation: \n- Speaker A: "Excuse me, how do I get to the principal's office?" \n- Speaker B: "__________"`,
          opciones: {
            A: `Go straight down this corridor and turn right, it's at the end.`,
            B: `I am fine, thank you very much for asking.`,
            C: `No, you cannot stay here during classes.`,
            D: `Yes, I am a new teacher in this school.`
          },
          correcta: 'A' as const
        })
      ];

      // Populate 100 questions per component
      areas.forEach((comp) => {
        for (let i = 1; i <= 100; i++) {
          let qData;
          const diff: DificultadPregunta = i <= 30 ? 'bajo' : i <= 75 ? 'medio' : 'alto';
          
          if (comp === 'Matemáticas') {
            const template = mathTemplates[(i - 1) % mathTemplates.length];
            qData = template(i);
          } else if (comp === 'Ciencias Naturales') {
            const template = scienceTemplates[(i - 1) % scienceTemplates.length];
            qData = template(i);
          } else if (comp === 'Ciencias Sociales') {
            const template = socialTemplates[(i - 1) % socialTemplates.length];
            qData = template(i);
          } else if (comp === 'Lectura Crítica') {
            const template = readingTemplates[(i - 1) % readingTemplates.length];
            qData = template(i);
          } else {
            const template = englishTemplates[(i - 1) % englishTemplates.length];
            qData = template(i);
          }

          preguntas.push({
            id: generateUUID(),
            componente: comp,
            texto_pregunta: `[Pregunta ${i}] - Dificultad: ${diff.toUpperCase()}\n${qData.texto}`,
            opciones_json: qData.opciones,
            respuesta_correcta: qData.correcta,
            dificultad: diff
          });
        }
      });

      // Write everything to LocalStorage
      localStorage.setItem('db_colegios', JSON.stringify(colegios));
      localStorage.setItem('db_grupos', JSON.stringify(grupos));
      localStorage.setItem('db_usuarios', JSON.stringify(usuarios));
      localStorage.setItem('db_preguntas', JSON.stringify(preguntas));
      localStorage.setItem('db_simulacros', JSON.stringify([]));
      localStorage.setItem('db_resultados', JSON.stringify([]));
      localStorage.setItem('db_bitacora_errores', JSON.stringify([]));
      localStorage.setItem('db_initialized', 'true');

      console.log('Database successfully seeded with 500 questions.');
    } catch (e: any) {
      logSystemError('DB_SEED_FAIL', `Seeding failed: ${e.message}`);
    }
  },

  // ----------------------------------------------------
  // COLEGIOS CRUD
  // ----------------------------------------------------
  getColegios: (): Colegio[] => {
    return JSON.parse(localStorage.getItem('db_colegios') || '[]');
  },

  createColegio: (nombre: string, docenteId: string | null, metadata: Omit<Colegio['metadata'], 'fecha_registro'>): Colegio => {
    if (!nombre.trim()) {
      const err = 'El nombre del colegio no puede estar vacío';
      logSystemError('SQL_CONSTRAINT_FAIL', err);
      throw new Error(err);
    }
    const colegios = dbClient.getColegios();
    const nuevoColegio: Colegio = {
      id: generateUUID(),
      nombre: nombre.trim(),
      docente_id: docenteId,
      metadata: {
        ...metadata,
        fecha_registro: new Date().toISOString()
      }
    };
    colegios.push(nuevoColegio);
    localStorage.setItem('db_colegios', JSON.stringify(colegios));
    return nuevoColegio;
  },

  // ----------------------------------------------------
  // GRUPOS CRUD
  // ----------------------------------------------------
  getGrupos: (): Grupo[] => {
    return JSON.parse(localStorage.getItem('db_grupos') || '[]');
  },

  createGrupo: (colegioId: string, nombreGrupo: string): Grupo => {
    if (!nombreGrupo.trim()) {
      const err = 'El nombre del grupo no puede estar vacío';
      logSystemError('SQL_CONSTRAINT_FAIL', err);
      throw new Error(err);
    }

    // Verify foreign key
    const colegios = dbClient.getColegios();
    if (!colegios.some(c => c.id === colegioId)) {
      const err = `Violación de llave foránea: El colegio_id '${colegioId}' no existe en colegios`;
      logSystemError('SQL_FK_FAIL', err);
      throw new Error(err);
    }

    const grupos = dbClient.getGrupos();
    const nuevoGrupo: Grupo = {
      id: generateUUID(),
      colegio_id: colegioId,
      nombre_grupo: nombreGrupo.trim()
    };
    grupos.push(nuevoGrupo);
    localStorage.setItem('db_grupos', JSON.stringify(grupos));
    return nuevoGrupo;
  },

  // ----------------------------------------------------
  // USUARIOS CRUD
  // ----------------------------------------------------
  getUsuarios: (): Usuario[] => {
    return JSON.parse(localStorage.getItem('db_usuarios') || '[]');
  },

  createUsuario: (email: string, passwordHash: string, rol: RolUsuario, grupoId: string | null, nombreCompleto?: string): Usuario => {
    const emailNormalized = email.trim().toLowerCase();
    if (!emailNormalized || !passwordHash) {
      const err = 'El email y la contraseña son obligatorios';
      logSystemError('SQL_CONSTRAINT_FAIL', err);
      throw new Error(err);
    }

    const usuarios = dbClient.getUsuarios();
    
    // Check if user already exists
    const usuarioExistenteIdx = usuarios.findIndex(u => u.email === emailNormalized);
    if (usuarioExistenteIdx !== -1) {
      const usuarioExistente = usuarios[usuarioExistenteIdx];
      // REACTIVATION: If user exists and is 'baja', reactivate them!
      if (usuarioExistente.estado === 'baja') {
        usuarioExistente.estado = 'activo';
        usuarioExistente.password_hash = passwordHash;
        if (nombreCompleto) {
          usuarioExistente.nombre_completo = nombreCompleto;
        }
        
        // Verify group foreign key if student
        if (rol === 'estudiante' && grupoId !== null) {
          const grupos = dbClient.getGrupos();
          if (!grupos.some(g => g.id === grupoId)) {
            const err = `Violación de llave foránea: El grupo_id '${grupoId}' no existe en grupos`;
            logSystemError('SQL_FK_FAIL', err);
            throw new Error(err);
          }
        }
        usuarioExistente.grupo_id = rol === 'estudiante' ? grupoId : null;
        usuarios[usuarioExistenteIdx] = usuarioExistente;
        localStorage.setItem('db_usuarios', JSON.stringify(usuarios));
        return usuarioExistente;
      } else {
        // Unique constraint on active user email
        const err = `Violación de restricción única: El email '${emailNormalized}' ya está registrado`;
        logSystemError('SQL_UNIQUE_FAIL', err);
        throw new Error(err);
      }
    }

    // Foreign key and business constraints
    if (rol === 'estudiante') {
      if (grupoId !== null) {
        const grupos = dbClient.getGrupos();
        if (!grupos.some(g => g.id === grupoId)) {
          const err = `Violación de llave foránea: El grupo_id '${grupoId}' no existe en grupos`;
          logSystemError('SQL_FK_FAIL', err);
          throw new Error(err);
        }
      }
    } else {
      // Non-students cannot have a group assigned
      if (grupoId !== null) {
        const err = `Restricción de Negocio: Un usuario con rol '${rol}' no puede tener asignado un grupo`;
        logSystemError('SQL_CHECK_FAIL', err);
        throw new Error(err);
      }
    }

    const nuevoUsuario: Usuario = {
      id: generateUUID(),
      email: emailNormalized,
      password_hash: passwordHash,
      rol,
      grupo_id: grupoId,
      nombre_completo: nombreCompleto || emailNormalized.split('@')[0],
      login_count: 0,
      estado: 'activo'
    };
    usuarios.push(nuevoUsuario);
    localStorage.setItem('db_usuarios', JSON.stringify(usuarios));
    return nuevoUsuario;
  },

  updateUsuarioGrupo: (usuarioId: string, grupoId: string | null): Usuario => {
    const usuarios = dbClient.getUsuarios();
    const usuarioIdx = usuarios.findIndex(u => u.id === usuarioId);
    if (usuarioIdx === -1) {
      const err = `El usuario con id '${usuarioId}' no existe`;
      logSystemError('SQL_NOT_FOUND', err);
      throw new Error(err);
    }

    const usuario = usuarios[usuarioIdx];
    if (usuario.rol !== 'estudiante') {
      const err = 'Solo se puede asignar grupo a usuarios con rol estudiante';
      logSystemError('SQL_CHECK_FAIL', err);
      throw new Error(err);
    }

    if (grupoId !== null) {
      const grupos = dbClient.getGrupos();
      if (!grupos.some(g => g.id === grupoId)) {
        const err = `Violación de llave foránea: El grupo_id '${grupoId}' no existe`;
        logSystemError('SQL_FK_FAIL', err);
        throw new Error(err);
      }
    }

    usuario.grupo_id = grupoId;
    usuarios[usuarioIdx] = usuario;
    localStorage.setItem('db_usuarios', JSON.stringify(usuarios));
    return usuario;
  },

  incrementarLogin: (usuarioId: string): void => {
    const usuarios = dbClient.getUsuarios();
    const idx = usuarios.findIndex(u => u.id === usuarioId);
    if (idx !== -1) {
      usuarios[idx].login_count = (usuarios[idx].login_count || 0) + 1;
      usuarios[idx].last_active_at = new Date().toISOString();
      localStorage.setItem('db_usuarios', JSON.stringify(usuarios));
    }
  },

  actualizarActividad: (usuarioId: string): void => {
    const usuarios = dbClient.getUsuarios();
    const idx = usuarios.findIndex(u => u.id === usuarioId);
    if (idx !== -1) {
      usuarios[idx].last_active_at = new Date().toISOString();
      localStorage.setItem('db_usuarios', JSON.stringify(usuarios));
    }
  },

  setUsuarioEstado: (usuarioId: string, estado: 'activo' | 'baja'): void => {
    const usuarios = dbClient.getUsuarios();
    const idx = usuarios.findIndex(u => u.id === usuarioId);
    if (idx !== -1) {
      usuarios[idx].estado = estado;
      if (estado === 'baja') {
        usuarios[idx].grupo_id = null; // Unassign group when deactivating
      }
      localStorage.setItem('db_usuarios', JSON.stringify(usuarios));
    }
  },

  // ----------------------------------------------------
  // PREGUNTAS CRUD
  // ----------------------------------------------------
  getPreguntas: (): Pregunta[] => {
    return JSON.parse(localStorage.getItem('db_preguntas') || '[]');
  },
  
  guardarPreguntas: (preguntas: Pregunta[]): void => {
    localStorage.setItem('db_preguntas', JSON.stringify(preguntas));
    indexedDbClient.saveAll('preguntas', preguntas).catch(e => console.error('IndexedDB questions save fail:', e));
  },

  // ----------------------------------------------------
  // SIMULACROS CRUD
  // ----------------------------------------------------
  getSimulacros: (): Simulacro[] => {
    return JSON.parse(localStorage.getItem('db_simulacros') || '[]');
  },

  createSimulacro: (estudianteId: string, configuracion: Record<ComponenteICFES, number>): Simulacro => {
    // Validate student existence
    const usuarios = dbClient.getUsuarios();
    const estudiante = usuarios.find(u => u.id === estudianteId);
    if (!estudiante || estudiante.rol !== 'estudiante') {
      const err = `Violación de llave foránea: El estudiante con id '${estudianteId}' no existe o no tiene rol estudiante`;
      logSystemError('SQL_FK_FAIL', err);
      throw new Error(err);
    }

    // Select random questions based on config
    const todasLasPreguntas = dbClient.getPreguntas();
    const preguntasSeleccionadasIds: string[] = [];

    const components = Object.keys(configuracion) as ComponenteICFES[];
    components.forEach((comp) => {
      const cantidadRequerida = configuracion[comp] || 0;
      if (cantidadRequerida <= 0) return;

      const preguntasDelComponente = todasLasPreguntas.filter(q => q.componente === comp);
      if (preguntasDelComponente.length < cantidadRequerida) {
        const err = `No hay suficientes preguntas de '${comp}'. Requeridas: ${cantidadRequerida}, Disponibles: ${preguntasDelComponente.length}`;
        logSystemError('BIZ_LOGIC_FAIL', err);
        throw new Error(err);
      }

      // Shuffle component questions and select N
      const shuffled = [...preguntasDelComponente].sort(() => 0.5 - Math.random());
      const seleccionadas = shuffled.slice(0, cantidadRequerida);
      seleccionadas.forEach(q => preguntasSeleccionadasIds.push(q.id));
    });

    const simulacros = dbClient.getSimulacros();
    const nuevoSimulacro: Simulacro = {
      id: generateUUID(),
      estudiante_id: estudianteId,
      fecha_inicio: new Date().toISOString(),
      fecha_fin: null,
      estado: 'en_progreso',
      preguntas_ids: preguntasSeleccionadasIds,
      respuestas_json: {},
      configuracion_preguntas: configuracion
    };

    simulacros.push(nuevoSimulacro);
    localStorage.setItem('db_simulacros', JSON.stringify(simulacros));
    indexedDbClient.saveAll('simulacros', simulacros).catch(e => console.error('IndexedDB simulacros save fail:', e));
    return nuevoSimulacro;
  },

  // Save student intermediate answers
  guardarRespuestasExamen: (simulacroId: string, respuestas: Record<string, 'A' | 'B' | 'C' | 'D'>): void => {
    const simulacros = dbClient.getSimulacros();
    const idx = simulacros.findIndex(s => s.id === simulacroId);
    if (idx === -1) {
      const err = `El simulacro con id '${simulacroId}' no existe`;
      logSystemError('SQL_NOT_FOUND', err);
      throw new Error(err);
    }

    if (simulacros[idx].estado === 'terminado') {
      const err = `No se pueden modificar respuestas en un simulacro ya finalizado`;
      logSystemError('BIZ_LOGIC_FAIL', err);
      throw new Error(err);
    }

    simulacros[idx].respuestas_json = respuestas;
    localStorage.setItem('db_simulacros', JSON.stringify(simulacros));
    indexedDbClient.saveAll('simulacros', simulacros).catch(e => console.error('IndexedDB simulacros save fail:', e));
  },

  // Finish exam and calculate results
  finalizarSimulacro: (simulacroId: string): Simulacro => {
    const simulacros = dbClient.getSimulacros();
    const idx = simulacros.findIndex(s => s.id === simulacroId);
    if (idx === -1) {
      const err = `El simulacro con id '${simulacroId}' no existe`;
      logSystemError('SQL_NOT_FOUND', err);
      throw new Error(err);
    }

    const simulacro = simulacros[idx];
    if (simulacro.estado === 'terminado') {
      return simulacro; // Already completed
    }

    // Fetch all questions to compare answers
    const todasLasPreguntas = dbClient.getPreguntas();
    const preguntasSimulacro = todasLasPreguntas.filter(q => simulacro.preguntas_ids.includes(q.id));

    // Calculate score per component
    const componentesActivos = Object.keys(simulacro.configuracion_preguntas) as ComponenteICFES[];
    const resultadosPorComponente: Resultado[] = [];

    componentesActivos.forEach((comp) => {
      const preguntasDelComp = preguntasSimulacro.filter(q => q.componente === comp);
      if (preguntasDelComp.length === 0) return;

      let correctas = 0;
      const respuestasComponente: Record<string, 'A' | 'B' | 'C' | 'D' | ''> = {};

      preguntasDelComp.forEach((q) => {
        const respuestaEstudiante = simulacro.respuestas_json[q.id];
        respuestasComponente[q.id] = respuestaEstudiante || ''; // default blank if not answered
        
        if (respuestaEstudiante === q.respuesta_correcta) {
          correctas++;
        }
      });

      // Calculate score on the 0-100 ICFES scale
      const puntaje = Math.round((correctas / preguntasDelComp.length) * 100);

      resultadosPorComponente.push({
        id: generateUUID(),
        simulacro_id: simulacroId,
        componente: comp,
        puntaje_obtenido: puntaje,
        respuestas_alumno_json: respuestasComponente
      });
    });

    // Save results
    const resultados = dbClient.getResultados();
    resultados.push(...resultadosPorComponente);
    localStorage.setItem('db_resultados', JSON.stringify(resultados));

    // Update simulacro state
    simulacro.estado = 'terminado';
    simulacro.fecha_fin = new Date().toISOString();
    simulacros[idx] = simulacro;
    localStorage.setItem('db_simulacros', JSON.stringify(simulacros));

    indexedDbClient.saveAll('resultados', resultados).catch(e => console.error('IndexedDB resultados save fail:', e));
    indexedDbClient.saveAll('simulacros', simulacros).catch(e => console.error('IndexedDB simulacros save fail:', e));

    return simulacro;
  },

  // ----------------------------------------------------
  // RESULTADOS CRUD
  // ----------------------------------------------------
  getResultados: (): Resultado[] => {
    return JSON.parse(localStorage.getItem('db_resultados') || '[]');
  },

  getResultadosPorSimulacro: (simulacroId: string): Resultado[] => {
    const resultados = dbClient.getResultados();
    return resultados.filter(r => r.simulacro_id === simulacroId);
  },

  // ----------------------------------------------------
  // BITACORA ERRORES CRUD
  // ----------------------------------------------------
  getBitacoraErrores: (): BitacoraError[] => {
    return JSON.parse(localStorage.getItem('db_bitacora_errores') || '[]');
  },

  // ----------------------------------------------------
  // HYBRID SYNC OPERATIONS
  // ----------------------------------------------------
  syncToIndexedDb: async (): Promise<void> => {
    try {
      const preguntas = dbClient.getPreguntas();
      const simulacros = dbClient.getSimulacros();
      const resultados = dbClient.getResultados();

      await indexedDbClient.saveAll('preguntas', preguntas);
      await indexedDbClient.saveAll('simulacros', simulacros);
      await indexedDbClient.saveAll('resultados', resultados);
      console.log('Synchronized database cache to IndexedDB successfully.');
    } catch (e) {
      console.error('Failed to sync to IndexedDB:', e);
    }
  },

  initializeAsync: async (forceReset = false): Promise<void> => {
    try {
      const initialized = localStorage.getItem('db_initialized');
      if (initialized && !forceReset) {
        const localQuestions = localStorage.getItem('db_preguntas');
        if (!localQuestions || JSON.parse(localQuestions).length === 0) {
          const idbQuestions = await indexedDbClient.getAll<Pregunta>('preguntas');
          if (idbQuestions.length > 0) {
            const idbSimulacros = await indexedDbClient.getAll<any>('simulacros');
            const idbResultados = await indexedDbClient.getAll<any>('resultados');
            localStorage.setItem('db_preguntas', JSON.stringify(idbQuestions));
            localStorage.setItem('db_simulacros', JSON.stringify(idbSimulacros));
            localStorage.setItem('db_resultados', JSON.stringify(idbResultados));
            console.log('Restored LocalStorage cache from IndexedDB.');
            return;
          }
        }
        await dbClient.syncToIndexedDb();
        return;
      }

      if (!forceReset) {
        const idbQuestions = await indexedDbClient.getAll<Pregunta>('preguntas');
        if (idbQuestions.length > 0) {
          const idbSimulacros = await indexedDbClient.getAll<any>('simulacros');
          const idbResultados = await indexedDbClient.getAll<any>('resultados');
          localStorage.setItem('db_preguntas', JSON.stringify(idbQuestions));
          localStorage.setItem('db_simulacros', JSON.stringify(idbSimulacros));
          localStorage.setItem('db_resultados', JSON.stringify(idbResultados));
          localStorage.setItem('db_initialized', 'true');
          console.log('Restored database from IndexedDB on startup.');
          return;
        }
      }

      dbClient.initialize(forceReset);
      await dbClient.syncToIndexedDb();
    } catch (e: any) {
      console.error('Error in initializeAsync:', e);
      dbClient.initialize(forceReset);
    }
  }
};
