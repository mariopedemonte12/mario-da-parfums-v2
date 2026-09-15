const H2_CLASSNAME = "font-serif text-3xl text-primary italic";
const H3_CLASSNAME = "mb-3 mt-8 font-serif text-xl text-primary";
const P_CLASSNAME = "font-sans text-sm leading-relaxed text-text-muted";
const UL_CLASSNAME = "list-disc space-y-2 pl-5 font-sans text-sm leading-relaxed text-text-muted";

export default function TermsSection() {
  return (
    <section id="terminos" aria-labelledby="terminos-heading">
      <h2 id="terminos-heading" className={H2_CLASSNAME}>
        Términos y condiciones
      </h2>

      <h3 className={H3_CLASSNAME}>1. Qué es Mario da Parfums</h3>
      <p className={P_CLASSNAME}>
        Mario da Parfums es un <strong className="text-text">comparador de precios de
        perfumes</strong> en Chile. No vendemos perfumes ni procesamos pagos: no hay carrito
        ni checkout en el sitio. Nuestro rol es mostrarte, para una misma fragancia, los
        precios publicados por distintos vendors para que puedas compararlos.
      </p>
      <p className={`mt-3 ${P_CLASSNAME}`}>
        Cuando decides comprar, te llevamos a la página del vendor correspondiente. La
        compra ocurre por completo fuera de Mario da Parfums, bajo los términos, precios y
        condiciones de ese vendor.
      </p>

      <h3 className={H3_CLASSNAME}>2. Los precios y la disponibilidad son referenciales</h3>
      <p className={P_CLASSNAME}>
        Los precios y la disponibilidad que ves en el sitio provienen de una actualización
        periódica y son <strong className="text-text">referenciales</strong>: pueden no
        coincidir con el precio o el stock real al momento exacto en que los consultas.
      </p>
      <p className={`mt-3 ${P_CLASSNAME}`}>
        Antes de comprar, visita siempre la página del vendor enlazada para confirmar el
        precio efectivo y la disponibilidad real. No garantizamos que el precio mostrado en
        Mario da Parfums sea el precio final de compra.
      </p>
      <p className={`mt-3 ${P_CLASSNAME}`}>
        No somos responsables por diferencias entre el precio o la disponibilidad que
        mostramos y los del sitio del vendor, ni por el proceso de compra, el envío, la
        garantía o la postventa, que son enteramente responsabilidad del vendor.
      </p>

      <h3 className={H3_CLASSNAME}>3. Sobre el contenido del catálogo</h3>
      <p className={P_CLASSNAME}>
        Los nombres, marcas y descripciones del catálogo provienen de un dataset externo con
        descripciones referenciales/ilustrativas creadas para este proyecto — no son fichas
        oficiales de cada marca ni material provisto por los fabricantes.
      </p>

      <h3 className={H3_CLASSNAME}>4. Uso del sitio y límites de responsabilidad</h3>
      <ul className={UL_CLASSNAME}>
        <li>El sitio se ofrece tal como está disponible, sin garantía de precio ni de stock en tiempo real.</li>
        <li>Usar el comparador para decidir una compra es responsabilidad de quien navega.</li>
        <li>No es necesario crear una cuenta para comparar precios: una cuenta solo es necesaria para usar favoritos.</li>
      </ul>
    </section>
  );
}
