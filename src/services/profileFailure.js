/**
 * Pure decisions for profile-boot failures.
 *
 * Free of DOM and Firebase imports so the code/phase mapping and the retry
 * decision can be unit-tested in plain Node. main.js owns rendering and auth.
 */

const PHASE_LABEL = Object.freeze({ load: 'carga', create: 'creación' });

/**
 * Map a Firestore/auth failure to an honest user-facing surface.
 * `permission-denied` is never a connectivity problem, so retrying it only
 * burns the bounded attempt budget and logs the user out.
 */
export function resolveProfileFailure({ code, phase }) {
  const scope = PHASE_LABEL[phase] || phase || 'carga';
  const detail = `Detalle: ${code || 'unknown'} (${scope})`;

  switch (code) {
    case 'permission-denied':
      return {
        title: 'No pudimos acceder a tu perfil',
        message: 'Tu cuenta no pudo acceder a los datos. Cierra sesión y vuelve a iniciarla.',
        retryable: false,
        detail,
      };
    case 'unauthenticated':
      return {
        title: 'Tu sesión venció',
        message: 'Vuelve a iniciar sesión para continuar.',
        retryable: false,
        detail,
      };
    case 'unavailable':
    case 'network-request-failed':
      return {
        title: 'No pudimos cargar tu perfil',
        message: 'Revisa tu conexión e inténtalo de nuevo.',
        retryable: true,
        detail,
      };
    case 'invalid-argument':
      return {
        title: 'No pudimos cargar tu perfil',
        message: 'Los datos de tu perfil no son válidos. Cierra sesión y vuelve a intentarlo.',
        retryable: false,
        detail,
      };
    default:
      return {
        title: 'No pudimos cargar tu perfil',
        message: 'No pudimos completar la carga. Inténtalo de nuevo.',
        retryable: true,
        detail,
      };
  }
}
