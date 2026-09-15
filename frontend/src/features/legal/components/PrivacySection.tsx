type PrivacySectionProps = {
  lastUpdated: string;
};

const H2_CLASSNAME = "font-serif text-3xl text-primary italic";
const H3_CLASSNAME = "mb-3 mt-8 font-serif text-xl text-primary";
const P_CLASSNAME = "font-sans text-sm leading-relaxed text-text-muted";
const UL_CLASSNAME = "list-disc space-y-2 pl-5 font-sans text-sm leading-relaxed text-text-muted";
const PLACEHOLDER_CLASSNAME =
  "rounded-lg border border-dashed border-border bg-surface/40 px-4 py-3 font-sans text-sm text-text-muted italic";

export default function PrivacySection({ lastUpdated }: PrivacySectionProps) {
  return (
    <section id="privacidad" aria-labelledby="privacidad-heading">
      <h2 id="privacidad-heading" className={H2_CLASSNAME}>
        Política de privacidad
      </h2>
      <p className={`mt-4 ${P_CLASSNAME}`}>
        Esta política describe qué datos usamos en Mario da Parfums y para qué, en línea con
        la Ley N° 19.628 sobre Protección de la Vida Privada y anticipando los estándares de
        la Ley N° 21.719 de protección de datos personales. Es un resumen en lenguaje simple,
        pensado para que cualquier persona entienda cómo tratamos sus datos — no reemplaza
        una revisión legal formal.
      </p>

      <h3 className={H3_CLASSNAME}>Cookies y sesión</h3>
      <p className={P_CLASSNAME}>
        El sitio usa <strong className="text-text">una única cookie</strong>, de sesión, que
        nos permite reconocerte cuando inicias sesión y mantenerte autenticado entre
        visitas. Es una cookie <strong className="text-text">httpOnly</strong> (no puede
        leerla ningún script en el navegador) y viaja con el atributo{" "}
        <strong className="text-text">SameSite=Lax</strong>.
      </p>
      <p className={`mt-3 ${P_CLASSNAME}`}>
        Esa cookie es estrictamente funcional: solo sirve para reconocer una sesión ya
        iniciada (por ejemplo, para mostrarte tus favoritos o tu perfil). No la usamos para
        rastrear tu comportamiento de navegación.
      </p>
      <p className={`mt-3 ${P_CLASSNAME}`}>
        No usamos cookies ni scripts de analítica, tracking o publicidad, propios ni de
        terceros. Navegar el sitio y comparar precios no requiere cuenta ni login, y por lo
        tanto no requiere aceptar ninguna cookie: la cookie de sesión solo se crea si decides
        registrarte o iniciar sesión.
      </p>

      <h3 className={H3_CLASSNAME}>Datos de la cuenta: uso y libertades</h3>
      <ul className={UL_CLASSNAME}>
        <li>Los datos de tu cuenta se usan únicamente para operar la cuenta: mantener tu sesión y mostrar/administrar tus favoritos. No los usamos con fines de analítica, perfilamiento o marketing, ni los compartimos ni vendemos a terceros.</li>
        <li>Crear una cuenta es opcional y solo es necesaria para usar favoritos; puedes comparar precios sin registrarte.</li>
        <li>Puedes cerrar sesión en cualquier momento desde el menú de tu perfil; eso termina tu sesión activa.</li>
        <li>Hoy no existe un flujo propio para exportar o eliminar tu cuenta directamente desde el sitio (ver «Conservación de datos» más abajo).</li>
      </ul>

      <h3 className={H3_CLASSNAME}>Qué datos personales recopilamos</h3>
      <ul className={UL_CLASSNAME}>
        <li><strong className="text-text">Cuenta</strong>: nombre, correo electrónico y contraseña — la contraseña se guarda como hash con argon2, nunca en texto plano ni de forma recuperable —, además de tu rol y las fechas de creación/última actualización de la cuenta.</li>
        <li><strong className="text-text">Perfil (opcional)</strong>: una foto de perfil, si decides subir una, almacenada en un proveedor de almacenamiento de objetos compatible con S3.</li>
        <li><strong className="text-text">Favoritos</strong>: qué fragancias marcaste como favoritas.</li>
        <li><strong className="text-text">No recopilamos</strong>: datos de pago, dirección, teléfono, ni categorías de datos sensibles (salud, origen étnico, afiliación política o religiosa, etc.) — el sitio no procesa compras ni pagos.</li>
      </ul>

      <h3 className={H3_CLASSNAME}>Responsable del tratamiento</h3>
      <p className={P_CLASSNAME}>
        Quien trata estos datos y el canal de contacto para consultas o para ejercer tus
        derechos son:
      </p>
      <p className={`mt-3 ${PLACEHOLDER_CLASSNAME}`}>
        [Completar antes de publicar: razón social / persona responsable del tratamiento de
        datos y un canal de contacto — por ejemplo, un correo electrónico — para consultas o
        ejercicio de derechos.]
      </p>

      <h3 className={H3_CLASSNAME}>Finalidad y base de licitud del tratamiento</h3>
      <p className={P_CLASSNAME}>
        Tratamos tus datos para autenticarte (registro e inicio de sesión), mantener tu
        sesión iniciada y gestionar tus favoritos y tu perfil — nunca para perfilamiento,
        publicidad dirigida ni analítica.
      </p>
      <p className={`mt-3 ${P_CLASSNAME}`}>
        La base de licitud es el consentimiento que otorgas al registrarte (aceptando estos
        términos) y la necesidad de ejecutar el servicio que tú mismo solicitas: mantener tu
        sesión iniciada y mostrarte tus favoritos.
      </p>

      <h3 className={H3_CLASSNAME}>Tus derechos (ARCO / ARCOP)</h3>
      <p className={P_CLASSNAME}>
        Tienes derecho a acceder, rectificar, cancelar/eliminar y oponerte al tratamiento de
        tus datos personales, y también a su portabilidad. Puedes ejercer estos derechos
        escribiendo al canal de contacto indicado en «Responsable del tratamiento». No
        prometemos un plazo de respuesta específico; te responderemos a la brevedad posible.
      </p>

      <h3 className={H3_CLASSNAME}>Conservación de datos</h3>
      <p className={P_CLASSNAME}>
        Conservamos tus datos mientras tu cuenta permanezca activa. Hoy no existe un flujo
        de autoservicio para exportar o eliminar tu cuenta desde el sitio: una solicitud de
        eliminación se gestiona por el canal de contacto indicado arriba, de forma manual.
      </p>

      <h3 className={H3_CLASSNAME}>Medidas de seguridad</h3>
      <p className={P_CLASSNAME}>
        Tu contraseña nunca se almacena ni se transmite en texto plano: se guarda como hash
        con argon2. Tu sesión viaja en una cookie httpOnly, no legible por JavaScript (ver
        «Cookies y sesión» arriba).
      </p>

      <h3 className={H3_CLASSNAME}>Encargados de tratamiento y terceros</h3>
      <p className={P_CLASSNAME}>
        El proveedor de almacenamiento de objetos que usamos para las fotos de perfil actúa
        como encargado técnico de almacenamiento, no como un tercero que use tus datos para
        fines propios. Fuera de eso, no compartimos datos personales con integraciones de
        terceros: no hay analítica, no hay CRM ni pasarelas de pago.
      </p>

      <h3 className={H3_CLASSNAME}>Transferencia internacional de datos</h3>
      <p className={P_CLASSNAME}>
        La infraestructura de hosting y almacenamiento de producción todavía no está
        definida. Si el proveedor elegido termina alojado fuera de Chile, actualizaremos
        esta política para declarar esa transferencia y las garantías aplicables.
      </p>

      <h3 className={H3_CLASSNAME}>Menores de edad</h3>
      <p className={P_CLASSNAME}>
        Este servicio no está dirigido a menores de edad. Actualmente no verificamos la edad
        de quien se registra.
      </p>

      <h3 className={H3_CLASSNAME}>Cambios a esta política</h3>
      <p className={P_CLASSNAME}>
        Cuando cambiemos el contenido de esta página, actualizaremos la fecha de última
        actualización. Última actualización: <strong className="text-text">{lastUpdated}</strong>.
      </p>
    </section>
  );
}
