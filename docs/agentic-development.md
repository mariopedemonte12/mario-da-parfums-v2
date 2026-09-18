# Desarrollo con agentes de código

Este proyecto se construyó trabajando con Claude Code. Este documento describe **el proceso tal como está codificado en el repositorio**: convenciones, specs, skills y flujo de sesiones. No cuenta qué se aprendió ni qué funcionó mejor o peor; eso solo lo puede escribir el autor (secciones `TODO(autor)` más abajo).

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

## Lo que solo puede escribir el autor

> TODO(autor): **Qué aprendiste** trabajando así: qué te sorprendió, qué te obligó a cambiar de enfoque.

> TODO(autor): **Qué funcionó bien** (por ejemplo, specs antes de código, sesiones separadas) y por qué crees que fue así.

> TODO(autor): **Qué falló o costó** (contexto perdido, agentes que se desviaron del spec, retrabajo) y cómo lo corregiste.

> TODO(autor): **Cómo delegaste y revisaste**: qué pedías a los agentes, qué revisabas tú, qué no delegarías.

> TODO(autor): **Consejos para otra persona** que quiera reproducir el proceso.

> TODO(autor): **Cuánto del resultado es tuyo y cuánto de los agentes**, en tus palabras, para el lector externo.
