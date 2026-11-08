/** SEO-targeted geo content: Finance-vertical pages for Spanish-speaking
 *  countries. One data file, one template (GeoPage in pages/geo.tsx) —
 *  a new language or country is a new entry here, never a new component.
 *
 *  Language: Spanish, with the register of each country —
 *    Spain (es-ES): vosotros forms, "móvil", "ordenador", EUR context.
 *    Mexico (es-MX): tú forms, "celular", "computadora", MXN context.
 *    Argentina (es-AR): voseo ("podés", "tenés"), "celular", ARS context.
 *  The three pages share the vertical (Finance) and the network, and differ
 *  in currency context, payout notes, vertical demand and register — that
 *  difference is the whole point; identical text on three URLs would be
 *  duplicate content, not three country signals.
 *
 *  Honesty rules (audit, non-negotiable):
 *  - No dollar rates per offer — the payout table describes the MODELS
 *    (CPA / CPL / CPS), never an invented payout amount.
 *  - Commissions are in USD; local currency (EUR / MXN / ARS) is context
 *    only. AffiLayer does not set or promise a conversion rate — the bank
 *    or payout provider converts when the money arrives.
 *  - No local offices, staff, country-specific offer counts, or payout
 *    timing. Payouts are manual, admin-approved, Net30 by default.
 *  - FAQ answers are 40–75 words, first sentence self-contained, phrased
 *    the way a person asks. The JSON-LD is generated from this same data
 *    (seo.ts), never a second copy.
 */

export type PayoutModel = 'CPA' | 'CPL' | 'CPS'

export interface PayoutRow {
  model: PayoutModel
  /** What the affiliate earns for, in plain words. No amounts. */
  what: string
  /** How the model works on AffiLayer. */
  how: string
}

export interface SeoFaq {
  q: string
  a: string
}

export interface GeoSeoContent {
  code: 'es' | 'mx' | 'ar'
  /** Finance is the vertical these pages target. */
  vertical: 'finance'
  /** Answer-first intro: the passage an answer engine quotes. */
  answer: string
  payoutRows: PayoutRow[]
  /** How affiliates in this country get paid out + currency context. */
  payoutNote: string
  /** What to know about the Finance vertical in this country. */
  countryNotes: string[]
  faq: SeoFaq[]
  /** Spanish title/description for the /es/geo/:code page. */
  seoTitle: string
  seoDescription: string
}

export const GEO_SEO: Record<string, GeoSeoContent> = {
  es: {
    code: 'es',
    vertical: 'finance',
    answer:
      'Sí, podéis ganar comisiones con ofertas de Finanzas en España a través de AffiLayer: os registráis como afiliados, vuestra solicitud es revisada por nuestro equipo y, una vez aprobada, elegís ofertas de Finanzas, generáis vuestro enlace de seguimiento y cobráis por cada conversión atribuida. Las comisiones se registran en USD en un libro contable auditable y los pagos son manuales, aprobados por un administrador, Net30 por defecto.',
    payoutRows: [
      {
        model: 'CPA',
        what: 'Una acción aprobada del usuario, según la define la oferta (por ejemplo, una solicitud completada).',
        how: 'La oferta fija la acción y sus reglas; la conversión pasa por revisión antes de ser pagadera.',
      },
      {
        model: 'CPL',
        what: 'Un lead cualificado, por ejemplo un formulario completado que cumple los criterios de la oferta.',
        how: 'Solo cuentan los leads que cumplen los criterios publicados; los demás se rechazan con registro.',
      },
      {
        model: 'CPS',
        what: 'Un porcentaje de la venta cuando el usuario referido compra.',
        how: 'La venta se atribuye a vuestro clic y el porcentaje lo fija la oferta, no la red.',
      },
    ],
    payoutNote:
      'Las comisiones se registran en USD. Cuando solicitáis un pago, vuestro banco o proveedor de pago convierte a euros al recibir el dinero; AffiLayer no fija ni promete un tipo de cambio. Los pagos son manuales y aprobados por un administrador, Net30 por defecto, y los métodos disponibles y el mínimo se muestran en vuestro panel.',
    countryNotes: [
      'Las ofertas de Finanzas suelen buscar tráfico español: banca, tarjetas y préstamos son las categorías habituales. Cada oferta indica los países que acepta, así que solo promocionáis donde el anunciante quiere tráfico.',
      'El tráfico desde el móvil es la norma en España; comprobad en cada oferta si acepta tráfico de móvil, escritorio o ambos antes de enviarlo.',
      'AffiLayer no tiene oficinas ni personal en España: la red es la misma en todos los países, con el mismo seguimiento, el mismo libro contable y la misma revisión de pagos.',
    ],
    faq: [
      {
        q: '¿Cómo pagan las ofertas de Finanzas en España?',
        a: 'Las ofertas de Finanzas pagan por modelo: CPA por una acción aprobada, CPL por un lead cualificado y CPS como porcentaje de la venta. La oferta define la acción y sus reglas, y cada conversión pasa por revisión antes de ser pagadera. Las comisiones se registran en USD en vuestro libro contable.',
      },
      {
        q: '¿Cómo cobro mis comisiones en España?',
        a: 'Las comisiones aprobadas entran en el libro contable y se vuelven pagaderas; solicitáis el pago desde el panel y un administrador lo aprueba. Los pagos son manuales, Net30 por defecto. Vuestro banco convierte de USD a euros al recibir el dinero; AffiLayer no promete un tipo de cambio.',
      },
      {
        q: '¿Qué ofertas de Finanzas aceptan tráfico de España?',
        a: 'Cada oferta indica desde el principio los países que acepta, así que solo promocionáis donde el anunciante quiere tráfico. Usad los filtros del mercado por país, vertical, dispositivo y modelo de pago para encontrar lo que os encaja, y cada oferta muestra también sus límites y reglas de tráfico.',
      },
      {
        q: '¿Necesito una empresa para promocionar ofertas en España?',
        a: 'No. Podéis solicitarlo como particulares; nuestro equipo revisa cada solicitud. Una vez aprobada, elegís ofertas, generáis vuestro enlace de seguimiento y enviáis tráfico. Si promocionáis como empresa, indicadlo en la solicitud para que quede registrado desde el principio y podamos trataros como tal.',
      },
    ],
    seoTitle: 'Ofertas de Finanzas en España | Red de afiliados CPA AffiLayer',
    seoDescription:
      'Gana comisiones con ofertas de Finanzas en España: seguimiento completo, libro contable auditable en USD y pagos manuales Net30. Regístrate, aprueba y promociona.',
  },
  mx: {
    code: 'mx',
    vertical: 'finance',
    answer:
      'Sí, puedes ganar comisiones con ofertas de Finanzas en México a través de AffiLayer: te registras como afiliado, nuestro equipo revisa tu solicitud y, una vez aprobada, eliges ofertas de Finanzas, generas tu enlace de seguimiento y cobras por cada conversión atribuida. Las comisiones se registran en USD en un libro contable auditable y los pagos son manuales, aprobados por un administrador, Net30 por defecto.',
    payoutRows: [
      {
        model: 'CPA',
        what: 'Una acción aprobada del usuario, según la define la oferta (por ejemplo, una solicitud completada).',
        how: 'La oferta fija la acción y sus reglas; la conversión pasa por revisión antes de ser pagadera.',
      },
      {
        model: 'CPL',
        what: 'Un lead cualificado, por ejemplo un formulario completado que cumple los criterios de la oferta.',
        how: 'Solo cuentan los leads que cumplen los criterios publicados; los demás se rechazan con registro.',
      },
      {
        model: 'CPS',
        what: 'Un porcentaje de la venta cuando el usuario referido compra.',
        how: 'La venta se atribuye a tu clic y el porcentaje lo fija la oferta, no la red.',
      },
    ],
    payoutNote:
      'Las comisiones se registran en USD. Cuando solicitas un pago, tu banco o proveedor de pago convierte a pesos mexicanos al recibir el dinero; AffiLayer no fija ni promete un tipo de cambio. Los pagos son manuales y aprobados por un administrador, Net30 por defecto, y los métodos disponibles y el mínimo se muestran en tu panel.',
    countryNotes: [
      'México es uno de los mercados hispanohablantes más grandes, y las ofertas de Finanzas suelen buscarlo: banca, tarjetas y préstamos son las categorías habituales. Cada oferta indica los países que acepta, así que solo promocionas donde el anunciante quiere tráfico.',
      'El tráfico desde el celular es la norma en México; revisa en cada oferta si acepta tráfico de celular, computadora o ambos antes de enviarlo.',
      'AffiLayer no tiene oficinas ni personal en México: la red es la misma en todos los países, con el mismo seguimiento, el mismo libro contable y la misma revisión de pagos.',
    ],
    faq: [
      {
        q: '¿Cómo pagan las ofertas de Finanzas en México?',
        a: 'Las ofertas de Finanzas pagan por modelo: CPA por una acción aprobada, CPL por un lead cualificado y CPS como porcentaje de la venta. La oferta define la acción y sus reglas, y cada conversión pasa por revisión antes de ser pagadera. Las comisiones se registran en USD en tu libro contable.',
      },
      {
        q: '¿Cómo cobro mis comisiones en México?',
        a: 'Las comisiones aprobadas entran en el libro contable y se vuelven pagaderas; solicitas el pago desde el panel y un administrador lo aprueba. Los pagos son manuales, Net30 por defecto. Tu banco convierte de USD a pesos mexicanos al recibir el dinero; AffiLayer no promete un tipo de cambio.',
      },
      {
        q: '¿Qué ofertas de Finanzas aceptan tráfico de México?',
        a: 'Cada oferta indica desde el principio los países que acepta, así que solo promocionas donde el anunciante quiere tráfico. Usa los filtros del mercado por país, vertical, dispositivo y modelo de pago para encontrar lo que te encaja, y cada oferta muestra también sus límites y reglas de tráfico.',
      },
      {
        q: '¿Puedo promocionar ofertas de Finanzas desde México sin experiencia?',
        a: 'Sí. Puedes solicitarlo sin experiencia previa; nuestro equipo revisa cada solicitud. Una vez aprobada, elige ofertas de Finanzas, genera tu enlace de seguimiento y envía tráfico. Empieza con una oferta y un canal que conozcas, y crece desde ahí, una oferta a la vez.',
      },
    ],
    seoTitle: 'Ofertas de Finanzas en México | Red de afiliados CPA AffiLayer',
    seoDescription:
      'Gana comisiones con ofertas de Finanzas en México: seguimiento completo, libro contable auditable en USD y pagos manuales Net30. Regístrate, aprueba y promociona.',
  },
  ar: {
    code: 'ar',
    vertical: 'finance',
    answer:
      'Sí, podés ganar comisiones con ofertas de Finanzas en Argentina a través de AffiLayer: te registrás como afiliado, nuestro equipo revisa tu solicitud y, una vez aprobada, elegís ofertas de Finanzas, generás tu enlace de seguimiento y cobrás por cada conversión atribuida. Las comisiones se registran en USD en un libro contable auditable y los pagos son manuales, aprobados por un administrador, Net30 por defecto.',
    payoutRows: [
      {
        model: 'CPA',
        what: 'Una acción aprobada del usuario, según la define la oferta (por ejemplo, una solicitud completada).',
        how: 'La oferta fija la acción y sus reglas; la conversión pasa por revisión antes de ser pagadera.',
      },
      {
        model: 'CPL',
        what: 'Un lead cualificado, por ejemplo un formulario completado que cumple los criterios de la oferta.',
        how: 'Solo cuentan los leads que cumplen los criterios publicados; los demás se rechazan con registro.',
      },
      {
        model: 'CPS',
        what: 'Un porcentaje de la venta cuando el usuario referido compra.',
        how: 'La venta se atribuye a tu clic y el porcentaje lo fija la oferta, no la red.',
      },
    ],
    payoutNote:
      'Las comisiones se registran en USD. Cuando solicitás un pago, tu banco o proveedor de pago convierte a pesos argentinos al recibir el dinero; AffiLayer no fija ni promete un tipo de cambio. Los pagos son manuales y aprobados por un administrador, Net30 por defecto, y los métodos disponibles y el mínimo se muestran en tu panel.',
    countryNotes: [
      'Las ofertas de Finanzas suelen buscar tráfico argentino: banca, tarjetas y préstamos son las categorías habituales. Cada oferta indica los países que acepta, así que solo promocionás donde el anunciante quiere tráfico.',
      'Como las comisiones se registran en USD, el valor en tu libro contable no depende del peso argentino; la conversión ocurre solo cuando el dinero llega a tu banco o proveedor de pago.',
      'El tráfico desde el celular es la norma en Argentina; revisá en cada oferta si acepta tráfico de celular, computadora o ambos antes de enviarlo.',
      'AffiLayer no tiene oficinas ni personal en Argentina: la red es la misma en todos los países, con el mismo seguimiento, el mismo libro contable y la misma revisión de pagos.',
    ],
    faq: [
      {
        q: '¿Cómo pagan las ofertas de Finanzas en Argentina?',
        a: 'Las ofertas de Finanzas pagan por modelo: CPA por una acción aprobada, CPL por un lead cualificado y CPS como porcentaje de la venta. La oferta define la acción y sus reglas, y cada conversión pasa por revisión antes de ser pagadera. Las comisiones se registran en USD en tu libro contable.',
      },
      {
        q: '¿Cómo cobro mis comisiones en Argentina?',
        a: 'Las comisiones aprobadas entran en el libro contable y se vuelven pagaderas; solicitás el pago desde el panel y un administrador lo aprueba. Los pagos son manuales, Net30 por defecto. Tu banco convierte de USD a pesos argentinos al recibir el dinero; AffiLayer no promete un tipo de cambio.',
      },
      {
        q: '¿Qué ofertas de Finanzas aceptan tráfico de Argentina?',
        a: 'Cada oferta indica desde el principio los países que acepta, así que solo promocionás donde el anunciante quiere tráfico. Usá los filtros del mercado por país, vertical, dispositivo y modelo de pago para encontrar lo que te encaja, y cada oferta muestra también sus límites y reglas de tráfico.',
      },
      {
        q: '¿Las comisiones en USD me protegen de la inflación del peso?',
        a: 'Las comisiones se registran en USD en el libro contable, así que su valor en dólares no cambia mientras esperan el pago. La conversión a pesos argentinos ocurre solo cuando el dinero llega a tu banco o proveedor de pago, al tipo de cambio que ellos apliquen en ese momento.',
      },
    ],
    seoTitle: 'Ofertas de Finanzas en Argentina | Red de afiliados CPA AffiLayer',
    seoDescription:
      'Ganá comisiones con ofertas de Finanzas en Argentina: seguimiento completo, libro contable auditable en USD y pagos manuales Net30. Registrate, aprobá y promocioná.',
  },
}

export function geoSeoByCode(code: string): GeoSeoContent | undefined {
  return GEO_SEO[code]
}
