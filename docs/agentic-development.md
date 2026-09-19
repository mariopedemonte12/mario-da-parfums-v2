# Desarrollo con agentes de código

Este proyecto se construyó trabajando con Claude Code. Este documento describe **el proceso tal como está codificado en el repositorio**: convenciones, specs, skills y flujo de sesiones. Lo que se aprendió y qué funcionó mejor o peor está en la última sección, escrita por el autor.

Todo lo afirmado aquí se puede comprobar en los archivos citados.

## Piezas del proceso

### `CLAUDE.md`: convenciones que leen los agentes
- [`CLAUDE.md`](../CLAUDE.md) (raíz): convenciones globales del monorepo: flujo de worktrees, specs por feature, separación entre sesiones de implementación y de testing, y dónde va la documentación.
- Un `CLAUDE.md` por paquete con las guías específicas de su stack: [`backend/`](../backend/CLAUDE.md), [`frontend/`](../frontend/CLAUDE.md), [`chatbot/`](../chatbot/CLAUDE.md), [`similarityServer/`](../similarityServer/CLAUDE.md), [`priceGenerator/`](../priceGenerator/CLAUDE.md).
- La regla del repo es que la raíz aplica a todos los paquetes y cada paquete añade solo lo propio de su stack.

### Skills
Instrucciones empaquetadas que el agente carga cuando la tarea coincide con su descripción:
- [`testing`](../.claude/skills/testing/SKILL.md) (raíz): diseño de tests de caja negra (análisis de valores límite, tablas de decisión, cobertura de estados), fuzzing por búsqueda, y mutation testing para juzgar la calidad de la suite. Incluye referencias en [`references/`](../.claude/skills/testing/references).
- [`security-audit`](../.claude/skills/security-audit/SKILL.md) (raíz): auditoría de seguridad de punta a punta de todos los servicios.
- Dos skills específicas del backend, `module-standards` (mínimo de calidad para módulos CRUD: batch, filtros/paginación en el servidor, seeds) y `sql-query-optimization` (índices y planes de consulta con Drizzle + Postgres), en `backend/.claude/skills/`.

### Specs por feature
- Cada feature tiene un archivo `specs/<feature-slug>.md` (hoy hay más de veinte en [`specs/`](../specs)), cuyo slug coincide con el nombre de la rama.
- La regla ([`CLAUDE.md`](../CLAUDE.md)): se redacta pronto, acordada entre el usuario y Claude, con las preguntas abiertas resueltas en el propio archivo. Contiene comportamiento, reglas de negocio, casos borde y lo que queda fuera de alcance; **no** notas de implementación ni listas de tareas.
- Es la fuente principal para las pruebas de caja negra y el contexto compartido de todos los agentes que tocan la feature.
- Ejemplos: [`text-search-partial.md`](../specs/text-search-partial.md) (contrato, reglas numeradas, ejemplos y casos borde) y [`docker-infra.md`](../specs/docker-infra.md).

### Worktree por feature
- Una feature = un worktree = una rama = una sesión de Claude Code, creado con la opción `--worktree` (regla de [`CLAUDE.md`](../CLAUDE.md)).
- El worktree no se borra al terminar la implementación: permanece hasta que las pruebas terminan y la feature está cerrada.
- [`.worktreeinclude`](../.worktreeinclude) lista los archivos ignorados por git (por ejemplo `.env`, claves y certificados) que se copian automáticamente a cada worktree nuevo, para que las sesiones de feature y de testing puedan correr la aplicación y los e2e.

### Implementación y testing en sesiones separadas
- La sesión que implementa **no** prueba: se detiene tras implementar, lintear y hacer chequeos que no sean "¿funciona como se pidió?" (typecheck, regresión con la suite existente).
- El testing ocurre en una sesión nueva sobre el mismo worktree, que actúa como revisor independiente y usa el spec como fuente primaria de verdad, no la implementación.
- El objetivo declarado es que quien verifica no esté sesgado por haber escrito el código.
- La regla fija además que todo módulo ejecutable tiene tests unitarios y que los de integración se añaden solo cuando la feature lo exige (puerta de alcance en la skill `testing`).

### Mutation testing
Hay configuración de mutation testing por paquete: [`backend/stryker.config.json`](../backend/stryker.config.json) y [`chatbot/stryker.config.json`](../chatbot/stryker.config.json) (Stryker), y configuraciones `cosmic-ray` en [`similarityServer/`](../similarityServer) y [`priceGenerator/mutation-testing/`](../priceGenerator/mutation-testing). Se usan para medir si las suites detectan defectos (la skill `testing` lo llama "mutation score").

### Documentación con criterio
- `NOTES.md` dentro de un módulo, solo para decisiones de negocio o acuerdos no obvios de ese módulo (una condición de carrera, una decisión de seguridad, una rareza del esquema). "La mayoría de los directorios no lo necesitan".
- `docs/` de un paquete (por ejemplo [`backend/docs/`](../backend/docs)) para decisiones transversales sin un módulo dueño.
- Esa documentación es para personas; la regla dice que los agentes no la leen para entender el código: leen el código.
- Los documentos de portafolio de este directorio ([`README.md`](README.md)) son un tercer nivel: describen el sistema completo para un lector externo.

## Flujo resumido

1. Se entiende el requerimiento y se redacta `specs/<feature>.md`, resolviendo dudas con el usuario.
2. Se crea un worktree y una rama para la feature, y una sesión implementa.
3. La sesión de implementación termina en lint, typecheck y regresión, sin probar la feature.
4. Una sesión distinta abre el mismo worktree y prueba contra el spec (skill `testing`).
5. Si hay decisiones no obvias, se registran en `NOTES.md` del módulo o en `docs/`.
6. Cuando la feature está cerrada, se integra a `master` y recién entonces se retira el worktree.

(El paso 6 sigue lo que dicen las reglas del repo; el historial de git muestra merges de ramas de feature a `master`, por ejemplo `Merge feature/docker-infra`.)

## Reflexión del autor

**Qué aprendiste** Para gestionar múltiples agentes de IA en paralelo fue necesario desarrollar un proceso de gestión de agentes estricto, esto supuso la creación de múltiples skills y convenciones en los CLAUDE.md que obligaría a los agentes a seguir con las especificaciones de código que yo consideré pertinente. Admito que en principio fue muy difícil seguir el ritmo de los agentes, por lo que ahi aprendí la importancia de la definición de reglas claras para los agentes: Qué deben hacer, que no, cuando consultarme. Una cosa en particular que me llamó la atención es que eventualmente los agentes toman decisiones sin consultarte. Por ello es fundamental explicitar en CLAUDE.md o en alguna skill global que está terminalmente prohibido tomar decisiones sin consultarte. 
Otro aspecto que me pareció importante es que cada sesión de código o agente tenga un solo objetivo dentro del proceso de software. La idea es que sea la tarea más granular posible para que el agente no tenga problemas tipo "lost in the middle" cuando su contexto crece demasiado. Siempre proponer sesiones cortas, es por ello que estructuré la creación de código en 3 fases separadas, que veremos más adelante.

**Qué funcionó bien** Dividir el proceso de desarrollo de una feature en 3 partes: Spec, Implement y Testing. Cada sesión cumple con su objetivo en particular y luego otro agente autónomo recibe el producto de la fase anterior, lo analiza y luego según alguna habilidad se encarga de resolver el problema. Esto es limpio porque evita en la sesión de testing el "happy path" bias. Otro aspecto importante fue el uso de la funcionalidad de worktrees de git. Esto permitía que cada agente estuviera contenido en un sandbox donde sus cambios no pisan a los demás. Esto permite trabajar sobre múltiples features y hace el proceso mucho más limpio.

**Qué falló o costó** Principalmente que los agentes asumieran cosas que yo no les dije explicitamente, esto se mitigó modificando el CLAUDE.md pero para sesiones muy largas el agente puede perder detalle de las instrucciones.

**Cómo delegaste y revisaste**: La creación de los specs siempre fue un trabajo compartido entre yo y los agentes. Siempre iniciaba explicando mi idea general de como quería realizar la feature y luego el agente me hacía preguntas. Una vez completado el spec, lo leía personalmente y revisaba que todas las decisiones fueran lo que yo esperaba. La implementación y testing era delegaba completamente a los agentes, pero bajo estrictas instrucciones de como realizar el proceso. Se crearon skills de testing y de implementación que permitieron definir una estructura de trabajo estricta. En particular la inclusión de mutation testing por parte de la habilidad fue muy útil, permitió ver al agente casos en el código que los tests simplemente no cubrían. Los mutantes equivalentes fueron revisados de forma manual, en ningún caso encontré un falso positivo.

**Consejos para otra persona** El primer paso es desarrollar los documentos de instrucciones generales para los agentes. Antes de tocar código es importante definir un procedimiento general de desarrollo del software, además de habilidades más específicas que permitan realizar las fases del proceso de forma más precisa. Esto debe estar armado y validado por el usuario antes de iniciar el desarrollo de las features. Esto simplifica el proceso de desarrollo porque no debe repetirte en cada sesión, todos los agentes ya saben como deben trabajar y que cosas no pueden tocar. Es mucho más ordenado. 

**Cuánto del resultado es tuyo y cuánto de los agentes** Si bien los pilares básicos del código los escribí a mano, la mayor parte del código fue generado por agentes de IA. Esto no supone que este proyecto sea propiedad de la IA. Los agentes implementaron bajo mis decisiones, mis reglas y mi criterio. Todas las decisiones de diseño y features son de mi propiedad y soy responsable de ellas. Los agentes fueron una herramienta que me permitió desarrollar un software completo por mi mismo, con relativa velocidad y con buenos estándares de calidad. No estoy diciendo que el código generado sea perfecto, pero bajo mi conjunto de reglas y pruebas es suficiente. La estructura es ordenada, y no hay archivos de más de 800 lineas. Aunque como todos sabemos, el código es un ente cambiante y siempre se puede hacer mejor, intente inculcar las mejores prácticas en los agentes pero tampoco seguí todas las reglas de CleanCode, pero conceptos como SRP (Single responsability principle), inyección de dependencias y bajo acoplamiento están presentes en el código generado. 
