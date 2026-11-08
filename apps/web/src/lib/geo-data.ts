import type { Locale } from './i18n'

export type CountryCode = 'us' | 'uk' | 'ca' | 'au' | 'de' | 'fr' | 'br' | 'in' | 'es' | 'mx' | 'ar'

export interface Country {
  code: CountryCode
  /** Localised country name, used for headings and links. */
  name: Record<Locale, string>
  /** Two honest sentences per language. Same global product everywhere —
   *  the local angle is in words only: no local offices, staff, payment
   *  methods or country-specific offer counts are claimed. */
  intro: Record<Locale, string>
}

export const COUNTRIES: Country[] = [
  {
    code: 'us',
    name: { en: 'United States', es: 'Estados Unidos', pt: 'Estados Unidos' },
    intro: {
      en: 'Affiliates in the United States can run direct CPA offers or route mixed traffic through one SmartLink. Every click is tracked with a unique click ID, and every conversion is attributed back to it — with commissions recorded in a ledger you can audit.',
      es: 'Los afiliados en Estados Unidos pueden promocionar ofertas CPA directas o enviar el tráfico mixto a través de un solo SmartLink. Cada clic se registra con un ID único y cada conversión se atribuye a ese clic, con las comisiones registradas en un libro contable que puedes auditar.',
      pt: 'Os afiliados nos Estados Unidos podem promover ofertas de CPA diretas ou enviar o tráfego misto por um único SmartLink. Cada clique é registrado com um ID único e cada conversão é atribuída a esse clique, com as comissões registradas em um livro-razão que você pode auditar.',
    },
  },
  {
    code: 'uk',
    name: { en: 'United Kingdom', es: 'Reino Unido', pt: 'Reino Unido' },
    intro: {
      en: 'Affiliates in the United Kingdom can promote offers across the network’s verticals and earn from the same auditable ledger as everyone else. Offers state their GEO targeting up front, so you only run traffic the advertiser actually wants from the UK.',
      es: 'Los afiliados en el Reino Unido pueden promocionar ofertas en todas las verticales de la red y ganar con el mismo libro contable auditable que todos los demás. Las ofertas indican su segmentación geográfica desde el principio, así que solo promocionas el tráfico que el anunciante realmente quiere del Reino Unido.',
      pt: 'Os afiliados no Reino Unido podem promover ofertas em todas as verticais da rede e ganhar com o mesmo livro-razão auditável de todos os demais. As ofertas indicam sua segmentação geográfica desde o início, para que você só promova o tráfego que o anunciante realmente deseja do Reino Unido.',
    },
  },
  {
    code: 'ca',
    name: { en: 'Canada', es: 'Canadá', pt: 'Canadá' },
    intro: {
      en: 'Affiliates in Canada can run direct offers or use SmartLink for mixed traffic, with full-funnel tracking on every click. Payouts are manual and admin-approved, Net30 by default — the same schedule wherever you are.',
      es: 'Los afiliados en Canadá pueden promocionar ofertas directas o usar SmartLink para el tráfico mixto, con seguimiento completo en cada clic. Los pagos son manuales y aprobados por un administrador, Net30 por defecto: el mismo calendario estés donde estés.',
      pt: 'Os afiliados no Canadá podem promover ofertas diretas ou usar o SmartLink para tráfego misto, com rastreamento completo em cada clique. Os pagamentos são manuais e aprovados por um administrador, Net30 por padrão: o mesmo cronograma onde quer que você esteja.',
    },
  },
  {
    code: 'au',
    name: { en: 'Australia', es: 'Australia', pt: 'Austrália' },
    intro: {
      en: 'Affiliates in Australia can join the network, apply to offers and earn on attributed conversions. SmartLink routes each visitor to an eligible offer for their country and device, using rules you can read — not a black box.',
      es: 'Los afiliados en Australia pueden unirse a la red, solicitar ofertas y ganar con conversiones atribuidas. SmartLink dirige a cada visitante a una oferta elegible para su país y dispositivo, con reglas que puedes leer, sin caja negra.',
      pt: 'Os afiliados na Austrália podem entrar na rede, candidatar-se a ofertas e ganhar com conversões atribuídas. O SmartLink direciona cada visitante a uma oferta elegível para seu país e dispositivo, com regras que você pode ler — sem caixa-preta.',
    },
  },
  {
    code: 'de',
    name: { en: 'Germany', es: 'Alemania', pt: 'Alemanha' },
    intro: {
      en: 'Affiliates in Germany can run offers across the network’s verticals, with each offer stating its caps, traffic rules and conversion definition up front. Tracking is full-funnel: every click gets a unique ID that stays linked to its conversion.',
      es: 'Los afiliados en Alemania pueden promocionar ofertas en todas las verticales de la red, y cada oferta indica sus límites, reglas de tráfico y definición de conversión desde el principio. El seguimiento es completo: cada clic recibe un ID único que se mantiene vinculado a su conversión.',
      pt: 'Os afiliados na Alemanha podem promover ofertas em todas as verticais da rede, e cada oferta indica seus limites, regras de tráfego e definição de conversão desde o início. O rastreamento é completo: cada clique recebe um ID único que permanece vinculado à sua conversão.',
    },
  },
  {
    code: 'fr',
    name: { en: 'France', es: 'Francia', pt: 'França' },
    intro: {
      en: 'Affiliates in France can promote direct CPA offers or send traffic through one SmartLink. Conversions move through pending, approved, rejected or reversed with a record of each change — and nothing becomes payable without review.',
      es: 'Los afiliados en Francia pueden promocionar ofertas CPA directas o enviar tráfico a través de un solo SmartLink. Las conversiones pasan por pendiente, aprobada, rechazada o revertida, con registro de cada cambio, y nada se vuelve pagadero sin revisión.',
      pt: 'Os afiliados na França podem promover ofertas de CPA diretas ou enviar tráfego por um único SmartLink. As conversões passam por pendente, aprovada, rejeitada ou revertida, com registro de cada mudança — e nada se torna pagável sem revisão.',
    },
  },
  {
    code: 'br',
    name: { en: 'Brazil', es: 'Brasil', pt: 'Brasil' },
    intro: {
      en: 'Affiliates in Brazil can join AffiLayer, apply to offers and earn commission on attributed conversions. The network is open worldwide, and each offer states the countries it accepts, so you only promote where the advertiser wants traffic.',
      es: 'Los afiliados en Brasil pueden unirse a AffiLayer, solicitar ofertas y ganar comisiones por conversiones atribuidas. La red está abierta en todo el mundo, y cada oferta indica los países que acepta, así que solo promocionas donde el anunciante quiere tráfico.',
      pt: 'Os afiliados no Brasil podem entrar na AffiLayer, candidatar-se a ofertas e ganhar comissão por conversões atribuídas. A rede está aberta no mundo todo, e cada oferta indica os países que aceita, para que você só promova onde o anunciante deseja tráfego.',
    },
  },
  {
    code: 'in',
    name: { en: 'India', es: 'India', pt: 'Índia' },
    intro: {
      en: 'Affiliates in India can run direct offers or route traffic through SmartLink, with the same tracking, ledger and manual payout review as every other country. Applications are reviewed by our team.',
      es: 'Los afiliados en la India pueden promocionar ofertas directas o enviar tráfico a través de SmartLink, con el mismo seguimiento, libro contable y revisión manual de pagos que en cualquier otro país. Nuestro equipo revisa las solicitudes.',
      pt: 'Os afiliados na Índia podem promover ofertas diretas ou enviar tráfego pelo SmartLink, com o mesmo rastreamento, livro-razão e revisão manual de pagamentos de qualquer outro país. Nossa equipe analisa as inscrições.',
    },
  },
  {
    code: 'es',
    name: { en: 'Spain', es: 'España', pt: 'Espanha' },
    intro: {
      en: 'Affiliates in Spain can run direct CPA offers or route mixed traffic through one SmartLink. Finance offers commonly target Spanish traffic, and each offer states the countries it accepts up front, so you only promote where the advertiser wants traffic.',
      es: 'Los afiliados en España pueden promocionar ofertas CPA directas o enviar el tráfico mixto a través de un solo SmartLink. Las ofertas de Finanzas suelen buscar tráfico español, y cada oferta indica desde el principio los países que acepta, así que solo promocionas donde el anunciante quiere tráfico.',
      pt: 'Os afiliados na Espanha podem promover ofertas de CPA diretas ou enviar o tráfego misto por um único SmartLink. As ofertas de Finanças costumam buscar tráfego espanhol, e cada oferta indica desde o início os países que aceita, para que você só promova onde o anunciante deseja tráfego.',
    },
  },
  {
    code: 'mx',
    name: { en: 'Mexico', es: 'México', pt: 'México' },
    intro: {
      en: 'Affiliates in Mexico can run direct CPA offers or route mixed traffic through one SmartLink. Mexico is one of the largest Spanish-speaking markets, and Finance offers commonly target it — each offer states the countries it accepts, so you only promote where the advertiser wants traffic.',
      es: 'Los afiliados en México pueden promocionar ofertas CPA directas o enviar el tráfico mixto a través de un solo SmartLink. México es uno de los mercados hispanohablantes más grandes, y las ofertas de Finanzas suelen buscarlo; cada oferta indica los países que acepta, así que solo promocionas donde el anunciante quiere tráfico.',
      pt: 'Os afiliados no México podem promover ofertas de CPA diretas ou enviar o tráfego misto por um único SmartLink. O México é um dos maiores mercados de língua espanhola, e as ofertas de Finanças costumam buscá-lo; cada oferta indica os países que aceita, para que você só promova onde o anunciante deseja tráfego.',
    },
  },
  {
    code: 'ar',
    name: { en: 'Argentina', es: 'Argentina', pt: 'Argentina' },
    intro: {
      en: 'Affiliates in Argentina can run direct CPA offers or route mixed traffic through one SmartLink. Finance offers commonly target Argentine traffic, and commissions are recorded in USD in the ledger — each offer states the countries it accepts, so you only promote where the advertiser wants traffic.',
      es: 'Los afiliados en Argentina pueden promocionar ofertas CPA directas o enviar el tráfico mixto a través de un solo SmartLink. Las ofertas de Finanzas suelen buscar tráfico argentino, y las comisiones se registran en USD en el libro contable; cada oferta indica los países que acepta, así que solo promocionás donde el anunciante quiere tráfico.',
      pt: 'Os afiliados na Argentina podem promover ofertas de CPA diretas ou enviar o tráfego misto por um único SmartLink. As ofertas de Finanças costumam buscar tráfego argentino, e as comissões são registradas em USD no livro-razão; cada oferta indica os países que aceita, para que você só promova onde o anunciante deseja tráfego.',
    },
  },
]

export const COUNTRY_CODES: CountryCode[] = COUNTRIES.map((c) => c.code)

export function countryByCode(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code)
}
