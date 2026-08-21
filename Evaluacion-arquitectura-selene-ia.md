# Evaluación de arquitectura de Selene-IA: qué tenemos hoy y qué falta para ser un producto empresarial

Este documento resume la evaluación de la **arquitectura** (la forma en que está organizado el código de una aplicación) del proyecto **Selene-IA**. Está escrito para el equipo de desarrollo de Monolith Studio: cada término técnico se define entre paréntesis la primera vez que aparece, las secciones son cortas a propósito y hay tablas y checklists en lugar de párrafos densos. **Veredicto en una frase:** Selene-IA funciona muy bien como prototipo, pero todavía no cumple los requisitos mínimos para operar como asistente de IA empresarial, y el riesgo más urgente es que la clave secreta de la IA viaja dentro de los archivos que descarga cualquier visitante.

## 1. Respuesta corta

¿Sirve la arquitectura actual para un asistente de IA empresarial?

**No todavía. Es un excelente prototipo.**

- Un **prototipo** demuestra que la idea funciona: pocas personas lo usan, hay poco que proteger y poco que perder si algo falla.
- Un **producto empresarial** debe aguantar muchos usuarios al mismo tiempo, controlar cuánto se gasta, dejar registro de todo lo que ocurre y proteger los datos según leyes.
- Selene-IA hoy está en el primer grupo. El resto del documento explica qué falta para llegar al segundo, y en qué orden hacerlo.

## 2. ¿Cómo está hoy Selene-IA?

Contexto mínimo antes de leer la evaluación:

| Dato | Detalle |
|------|---------|
| Qué es | Una aplicación de chat con inteligencia artificial (IA) |
| Con qué está hecha | JavaScript directo en el navegador (sin *framework*: sin herramientas grandes como React o Vue que estructuran el proyecto por nosotros) |
| Tamaño | Aproximadamente 3.400 líneas de código |
| Servicios externos | **Gemini** (el modelo de IA de Google) y **Firebase** (plataforma de Google que provee base de datos y login con cuenta de Google) |
| Estado de la revisión | Exploración completa terminada; este documento resume sus conclusiones |

## 3. Los 4 pilares: ¿cómo estamos?

Evaluamos la arquitectura contra cuatro pilares (requisitos de calidad que todo producto serio debe cumplir):

| Pilar | ¿Pasa? | Qué significa esto en simple | Evidencia encontrada |
|-------|--------|------------------------------|----------------------|
| **Escalable** (que el sistema aguante crecer: más usuarios, más mensajes y más costos bajo control, sin romperse) | ⚠️ Parcial | El código está bien ordenado en una sola dirección y sin círculos. Pero TODO corre en el navegador de cada usuario y no existe un servidor propio que controle costos ni límites de uso. | Carpetas bien organizadas; todo el tráfico sale directo del navegador hacia Gemini y Firebase, sin pasar por nuestro control. |
| **Auditable** (que quede registro de qué pasó, con qué recursos y cuánto costó, para poder revisarlo después) | ❌ No | Los mensajes guardan solo texto, rol y fecha. No queda registro de qué modelo respondió ni cuánto tardó. Los errores aparecen en la consola del navegador, donde nadie del equipo los ve. | Esquema de mensajes mínimo; errores solo visibles con `console.error`, sin sistema central de reporte. |
| **Testeable** (con pruebas automáticas: pequeños programas que comprueban solos que el código sigue funcionando después de cada cambio) | ❌ No | Hay cero pruebas automáticas. Solo cerca del 10% del código se podría probar hoy, porque casi todo está pegado al DOM (la parte del navegador que dibuja lo que se ve en pantalla). | No existen carpetas ni configuración de pruebas; la lógica está mezclada dentro de los archivos que dibujan la pantalla. |
| **Bien diseñada** | ❌ No | `ChatArea.js` hace de todo: habla con la IA, guarda en la base de datos y dibuja en pantalla. Eso se llama *god-object* (un archivo que concentra demasiadas responsabilidades): cambiar una cosa puede romper otra. | `src/components/ChatArea.js` mezcla llamadas a la IA, guardado en Firebase y renderizado de la interfaz. |

## 4. Los 2 riesgos más urgentes

> ⚠️ **Importante:** estos dos riesgos van ANTES que cualquier funcionalidad nueva.

### Riesgo #1 — La clave secreta de la IA está expuesta

La **API key** (clave secreta: un código que identifica a nuestra aplicación ante el servicio de IA y permite facturarnos el uso) de Gemini viaja dentro de los archivos JavaScript que el navegador de cualquier visitante descarga al abrir la app. Cualquiera puede abrir esos archivos, copiar la clave y usarla: la factura llegaría a nosotros.

**Analogía:** es como dejar la llave del local pegada con cinta en la puerta. Da igual lo bien ordenado que esté adentro: cualquiera que pase por la calle entra y gasta lo que encuentra.

**Solución:** mover las llamadas a la IA detrás de un servidor propio (decisión D2).

### Riesgo #2 — Las reglas de seguridad de la base de datos no están en el repositorio

Las **reglas de seguridad de Firebase** (las reglas que definen quién puede leer y escribir cada dato de la base de datos) no están **versionadas** (guardadas en el repositorio Git del proyecto, con historial de cambios). Consecuencia directa: hoy no podemos verificar que estén bien configuradas. Podrían permitir, por ejemplo, que alguien lea conversaciones ajenas, y no nos enteraríamos.

**Solución:** guardar esas reglas en el repositorio y revisarlas (decisión D6).

## 5. Lo que SÍ está bien

Honestidad completa: hay cosas bien hechas, y conviene reconocerlas antes de corregir lo demás.

- ✅ **Organización limpia:** el código fluye en una sola dirección y no hay dependencias circulares (cuando dos módulos se necesitan mutuamente formando un círculo, algo difícil de entender y mantener).
- ✅ **Landing separada de la app:** la página pública de presentación vive aparte de la aplicación de chat.
- ✅ **Tamaño manejable:** con aproximadamente 3.400 líneas, se puede arreglar por partes. No hace falta reescribir todo desde cero.

## 6. Las 6 decisiones nivel senior

Estas son las decisiones que guiarán el trabajo. Cada una resuelve algo concreto detectado en la evaluación.

### D1 — Arreglar por partes, no demoler

**Refactor incremental** significa mejorar el código de a pedazos, manteniendo la app funcionando en todo momento. Cada cambio chico se verifica antes de pasar al siguiente. Con un proyecto de este tamaño, reescribir todo sería un riesgo innecesario.

### D2 — Mover la IA detrás de un servidor propio (innegociable y primero)

Un **proxy** es un intermediario nuestro entre el usuario y Gemini: el navegador le pide al servidor, el servidor guarda la clave y llama a Gemini. Así la clave nunca llega al navegador del visitante. Esta decisión resuelve el Riesgo #1 y va primera.

### D3 — Separar "el cerebro" de "las manos"

La **lógica del negocio** (las reglas de la aplicación: cómo se procesa un mensaje, qué se guarda, cuándo responde la IA) debe vivir separada de lo que dibuja la pantalla. Esa es la idea central de la **arquitectura hexagonal**: organizar el código en un núcleo propio rodeado de adaptadores, piezas que conectan ese núcleo con el mundo exterior (la pantalla, la base de datos, la IA).

### D4 — Guardar datos empresariales desde ya

Cada mensaje debería registrar también: qué **modelo** respondió, la **sesión** (identificador de la conversación del usuario) y un **identificador de seguimiento** (código único que permite rastrear cada pedido de principio a fin). Sin estos datos, después no habrá control de costos ni posibilidad de auditar.

### D5 — Mantener JavaScript puro por ahora

No agregamos frameworks todavía. La disciplina será separar componentes (archivos con una sola responsabilidad clara). Menos tecnología nueva mientras arreglamos lo urgente.

### D6 — Seguridad primero

Tres frentes de trabajo:

1. Guardar en el repositorio las reglas de seguridad de la base de datos (resuelve el Riesgo #2).
2. Limpiar textos peligrosos antes de mostrarlos. **XSS** es una técnica de ataque donde alguien inyecta código malicioso a través de textos que el sistema muestra a otros usuarios.
3. Configurar la seguridad del navegador: cabeceras como *Content-Security-Policy* (instrucciones que le indican al navegador qué contenido y qué scripts tiene permiso de cargar la página).

## 7. Plan por fases F0 → F4

El trabajo avanza en orden; cada fase habilita la siguiente.

| Fase | Nombre | Qué se hace | Para qué sirve |
|------|--------|-------------|----------------|
| **F0** | Estabilización | Tapar los agujeros de seguridad urgentes; borrar código muerto (`LoginScreen.js` y `PrivacyPolicyModal.js`: archivos que ya nadie usa); arreglar fugas al cerrar sesión (datos que quedan guardados en el navegador después de salir). | Reducir el riesgo inmediato sin cambiar la arquitectura. |
| **F1** | Servidor mínimo | Crear el intermediario (proxy) para Gemini; las claves salen definitivamente del navegador. | La clave deja de estar expuesta; empieza el control de costos y de uso. |
| **F2** | Núcleo separado + primeras pruebas | Extraer la lógica del negocio fuera de la pantalla; escribir las primeras pruebas automáticas. | Poder cambiar cosas sin miedo a romper otras; base sólida para crecer. |
| **F3** | Capacidades de asistente | Que la IA consulte documentos de la empresa y use herramientas (funciones externas que la IA puede invocar, como buscar información en una base de datos propia). | Pasar de "chat genérico" a asistente realmente útil para el negocio. |
| **F4** | Nivel empresa | Varios clientes con permisos distintos; registro de auditoría completo; cumplimiento del GDPR (Reglamento General de Protección de Datos: ley europea sobre el tratamiento de datos personales). | Poder ofrecer el producto a empresas reales, con sus exigencias legales. |

## 8. Checklist de comprensión

Marca cada casilla solo cuando puedas responderlo de memoria:

- [ ] Puedo explicar por qué la clave secreta (API key) no debe vivir en el navegador.
- [ ] Puedo explicar qué es un proxy y por qué lo ponemos entre el usuario y Gemini.
- [ ] Sé nombrar los 2 riesgos más urgentes y la decisión que resuelve cada uno.
- [ ] Entiendo qué es un god-object y por qué `ChatArea.js` es uno hoy.
- [ ] Puedo decir qué datos empresariales faltan en cada mensaje (modelo usado, sesión, identificador de seguimiento).
- [ ] Puedo explicar la diferencia entre prototipo y producto empresarial.
- [ ] Sé qué fase va primero (F0) y qué tres trabajos incluye.

## 9. Próximo paso

Arrancar la **Fase F0 (Estabilización)** cuando el líder del equipo lo ordene.

Este documento queda como referencia compartida del equipo: ante cualquier duda sobre un término, por favor comunicarlo y volvemos a la sección correspondiente antes de avanzar.
