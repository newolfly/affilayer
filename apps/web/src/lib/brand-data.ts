// /brand copy, localised EN/ES/PT. Every claim uses only verified facts:
// no counts, no testimonials, no projections. Press contact is
// support@affilayer.com — press@affilayer.com does not exist yet.
// The white-label claim ("Your affiliates never see AffiLayer") is a
// white-label product fact and is never used here or in the boilerplate.

import type { Locale } from './i18n'

export const BRAND_BOILERPLATE_SHORT =
  'AffiLayer is a global CPA affiliate network operated by MarketSync Global LLC (New Mexico, USA), connecting advertisers with affiliates through direct offers and one SmartLink, with full-funnel tracking and every commission written to an auditable ledger.'

export const BRAND_BOILERPLATE_MEDIUM =
  'AffiLayer is a global CPA affiliate network operated by MarketSync Global LLC, a registered company in New Mexico, USA. Advertisers publish offers with a stated payout and conversion action; affiliates promote them and earn commission on attributed conversions. The network opened on 7 November 2026. It is deliberately small: a focused offer catalogue, a tracking engine the team can explain, and applications and conversions reviewed by hand.'

export const BRAND_BOILERPLATE_LONG = `${BRAND_BOILERPLATE_MEDIUM} Its three principles are tracking you can audit, an append-only commission ledger — a ledger that cannot be silently rewritten — and approval on both sides. We do not run traffic ourselves, we do not buy traffic on your behalf, and we do not promise results to either side.`

export type BrandStrings = {
  slogan: string
  sub: string
  aboutH: string
  about: string
  storyH: string
  story: string[]
  principlesH: string
  principles: { t: string; d: string }[]
  differentH: string
  different: { t: string; d: string }[]
  notH: string
  notDo: string[]
  identityH: string
  identity: string
  lockupsH: string
  lockups: string[]
  colorsH: string
  colors: { name: string; value: string }[]
  doH: string
  dos: string[]
  donts: string[]
  factsH: string
  facts: string[]
  pressH: string
  press: string
  pressCta: string
}

const EN: BrandStrings = {
  slogan: 'Open books, not big promises.',
  sub: 'AffiLayer connects advertisers who need customers with affiliates who can reach them. Direct offers and one SmartLink, full-funnel tracking, and every commission written to a ledger you can audit.',
  aboutH: 'What we are',
  about: BRAND_BOILERPLATE_MEDIUM,
  storyH: 'Why we exist',
  story: [
    'Most networks ask you to trust their numbers. We built AffiLayer so you can check them.',
    'AffiLayer opened on 7 November 2026 as a new CPA affiliate network. This page says exactly what is live — no more, no less.',
    'We are deliberately small right now: a focused offer catalogue, a tracking engine we can explain, and a team that reviews applications and conversions by hand. We grow offer by offer.',
    'If you want to work with us early, that is exactly the right time to join.',
  ],
  principlesH: 'The three principles',
  principles: [
    { t: 'Tracking you can audit', d: 'Every click gets a unique click ID with country, device, referrer and sub-parameters, and stays linked to its conversion.' },
    { t: 'An append-only commission ledger', d: 'Commissions move through pending, approved, rejected or reversed states, with a record of each change, in a ledger that cannot be silently rewritten.' },
    { t: 'Approval on both sides', d: 'Affiliates apply to offers, advertisers approve them, and conversions are reviewed before they become payable. Nobody runs blind.' },
  ],
  differentH: 'What makes it different',
  different: [
    { t: 'Auditable ledger', d: 'The numbers you see are the numbers in the ledger. Every commission state change is recorded. Verify it: in your dashboard, every conversion shows its click ID.' },
    { t: 'Deterministic SmartLink', d: 'One link routes each visitor to an eligible offer for their country and device, using clear deterministic rules. No AI optimisation, no black box, no guaranteed earnings — and you see which offer each click landed on.' },
    { t: 'Manual, admin-approved payouts', d: 'Payouts are reviewed by a person before money moves. Net30 by default: approved commissions become payable 30 days after the end of the month in which they were approved.' },
  ],
  notH: 'What we do not do',
  notDo: [
    'We do not run traffic ourselves, we do not buy traffic on your behalf, and we do not promise results to either side.',
    'We do not guarantee earnings. Performance depends on the offer, the audience and the traffic.',
    'No bonus or referral program at launch.',
    'Chat traffic and incentivised traffic are not accepted.',
  ],
  identityH: 'Visual identity',
  identity:
    'The mark is a capital A built from three stacked layers — the layers of the network. Gold, always in this order top to bottom: #D97706, #F59E0B, #FBBF24. The wordmark is set in Inter ExtraBold. The site itself uses the system font stack — no webfont is loaded — so headlines are bold system sans, and the gold gradient is used sparingly: H1 accent words and slogans only.',
  lockupsH: 'Lockups',
  lockups: [
    'Dark wordmark (logo.svg) on light backgrounds.',
    'Light wordmark (logo-light.svg) on dark backgrounds.',
    'Mark alone (logo-mark.svg) for avatars, favicons and small sizes.',
    'Never recolour the bands, never add effects, never place the dark wordmark on navy.',
    'Clear space: minimum one "A-leg width" on all sides. Minimum sizes: mark 24px, full lockup 120px wide.',
  ],
  colorsH: 'Colours',
  colors: [
    { name: 'Page', value: '#070D1A' },
    { name: 'Cards', value: '#111C30' },
    { name: 'Borders', value: '#1E2A3F' },
    { name: 'Muted text', value: '#8A97A8' },
    { name: 'Gold', value: '#D97706 / #F59E0B / #FBBF24' },
    { name: 'Button text', value: '#0B1220' },
  ],
  doH: 'Do / Don\'t',
  dos: ['Use the mark on navy.', 'Keep the band order.', 'Link the logo to affilayer.com.'],
  donts: ['Do not stretch, recolour, or outline the mark.', 'Do not put the light lockup on a light background.', 'Do not add a tagline to the logo.', 'Do not use the OG image as a logo.'],
  factsH: 'Facts',
  facts: [
    'Operated by MarketSync Global LLC, New Mexico, USA',
    'Opened 7 November 2026',
    'Contact: support@affilayer.com · Partnerships: partner@affilayer.com',
    'Payout models: CPA, CPL, CPS, CPC',
    'Verticals: Dating, Finance, Gaming, Sweepstakes, Nutra, iGaming',
    'Languages: EN / ES / PT (dashboards in English)',
    'Country pages: US, UK, CA, AU, DE, FR, BR, IN, ES, MX, AR',
    'Offer catalogue: small and growing offer by offer',
  ],
  pressH: 'Press kit',
  press: 'Logos, boilerplate and brand rules — download the press kit. For press enquiries, email support@affilayer.com with the subject "Press". For tracking questions, include the click ID from your link.',
  pressCta: 'Download the press kit (.zip)',
}

const ES: BrandStrings = {
  slogan: 'Libros abiertos, no grandes promesas.',
  sub: 'AffiLayer conecta anunciantes que necesitan clientes con afiliados que pueden llegar a ellos. Ofertas directas y un solo SmartLink, seguimiento completo y cada comisión en un libro contable que puedes auditar.',
  aboutH: 'Qué somos',
  about:
    'AffiLayer es una red global de afiliados CPA operada por MarketSync Global LLC, una empresa registrada en Nuevo México, EE. UU. Los anunciantes publican ofertas con un pago y una acción de conversión definidos; los afiliados las promocionan y ganan comisión por las conversiones atribuidas. La red abrió el 7 de noviembre de 2026. Es deliberadamente pequeña: un catálogo de ofertas enfocado, un motor de seguimiento que el equipo puede explicar y solicitudes y conversiones revisadas a mano.',
  storyH: 'Por qué existimos',
  story: [
    'La mayoría de las redes te piden que confíes en sus números. Creamos AffiLayer para que puedas comprobarlos.',
    'AffiLayer abrió el 7 de noviembre de 2026 como una nueva red de afiliados CPA. Esta página dice exactamente lo que está en vivo — ni más ni menos.',
    'Somos deliberadamente pequeños ahora: un catálogo de ofertas enfocado, un motor de seguimiento que podemos explicar y un equipo que revisa solicitudes y conversiones a mano. Crecemos oferta a oferta.',
    'Si quieres trabajar con nosotros desde el principio, este es exactamente el momento adecuado.',
  ],
  principlesH: 'Los tres principios',
  principles: [
    { t: 'Seguimiento que puedes auditar', d: 'Cada clic recibe un ID único con país, dispositivo, referente y subparámetros, y queda vinculado a su conversión.' },
    { t: 'Un libro contable de comisiones de solo anexión', d: 'Las comisiones pasan por estados pendiente, aprobada, rechazada o revertida, con un registro de cada cambio, en un libro que no se puede reescribir en silencio.' },
    { t: 'Aprobación en ambos lados', d: 'Los afiliados solicitan ofertas, los anunciantes las aprueban y las conversiones se revisan antes de ser pagaderas. Nadie trabaja a ciegas.' },
  ],
  differentH: 'Qué nos hace diferentes',
  different: [
    { t: 'Libro contable auditable', d: 'Los números que ves son los números del libro contable. Cada cambio de estado de una comisión queda registrado. Verifícalo: en tu panel, cada conversión muestra su ID de clic.' },
    { t: 'SmartLink determinista', d: 'Un enlace dirige a cada visitante a una oferta elegible para su país y dispositivo, con reglas deterministas claras. Sin optimización de IA, sin caja negra, sin ganancias garantizadas — y ves a qué oferta llegó cada clic.' },
    { t: 'Pagos manuales, aprobados por un administrador', d: 'Un persona revisa los pagos antes de que se mueva el dinero. Net30 por defecto: las comisiones aprobadas se vuelven pagaderas 30 días después del fin del mes en que fueron aprobadas.' },
  ],
  notH: 'Lo que no hacemos',
  notDo: [
    'No generamos tráfico nosotros, no compramos tráfico en tu nombre y no prometemos resultados a ninguna de las partes.',
    'No garantizamos ganancias. El rendimiento depende de la oferta, la audiencia y el tráfico.',
    'Sin programa de bonos ni de referidos en el lanzamiento.',
    'No se acepta tráfico de chat ni tráfico incentivado.',
  ],
  identityH: 'Identidad visual',
  identity:
    'La marca es una A mayúscula construida con tres capas apiladas — las capas de la red. Dorado, siempre en este orden de arriba a abajo: #D97706, #F59E0B, #FBBF24. La palabra está en Inter ExtraBold. El sitio usa la pila de fuentes del sistema — no se carga ninguna fuente web — así que los titulares son sans del sistema en negrita y el degradado dorado se usa con moderación: solo palabras de acento en H1 y eslóganes.',
  lockupsH: 'Versiones del logotipo',
  lockups: [
    'Logotipo oscuro (logo.svg) sobre fondos claros.',
    'Logotipo claro (logo-light.svg) sobre fondos oscuros.',
    'Solo la marca (logo-mark.svg) para avatares, favicons y tamaños pequeños.',
    'Nunca recolorees las bandas, nunca añadas efectos, nunca pongas el logotipo oscuro sobre azul marino.',
    'Espacio libre: mínimo un "ancho de pata de A" por todos lados. Tamaños mínimos: marca 24px, logotipo completo 120px de ancho.',
  ],
  colorsH: 'Colores',
  colors: [
    { name: 'Página', value: '#070D1A' },
    { name: 'Tarjetas', value: '#111C30' },
    { name: 'Bordes', value: '#1E2A3F' },
    { name: 'Texto atenuado', value: '#8A97A8' },
    { name: 'Dorado', value: '#D97706 / #F59E0B / #FBBF24' },
    { name: 'Texto del botón', value: '#0B1220' },
  ],
  doH: 'Sí / No',
  dos: ['Usa la marca sobre azul marino.', 'Mantén el orden de las bandas.', 'Enlaza el logotipo a affilayer.com.'],
  donts: ['No estires, recolorees ni delinees la marca.', 'No pongas el logotipo claro sobre un fondo claro.', 'No añadas un eslogan al logotipo.', 'No uses la imagen OG como logotipo.'],
  factsH: 'Datos',
  facts: [
    'Operada por MarketSync Global LLC, Nuevo México, EE. UU.',
    'Apertura: 7 de noviembre de 2026',
    'Contacto: support@affilayer.com · Alianzas: partner@affilayer.com',
    'Modelos de pago: CPA, CPL, CPS, CPC',
    'Verticales: Dating, Finanzas, Gaming, Sorteos, Nutra, iGaming',
    'Idiomas: EN / ES / PT (paneles en inglés)',
    'Páginas por país: US, UK, CA, AU, DE, FR, BR, IN, ES, MX, AR',
    'Catálogo de ofertas: pequeño y creciendo oferta a oferta',
  ],
  pressH: 'Kit de prensa',
  press: 'Logotipos, texto estándar y reglas de marca — descarga el kit de prensa. Para consultas de prensa, escribe a support@affilayer.com con el asunto "Press". Para preguntas de seguimiento, incluye el ID de clic de tu enlace.',
  pressCta: 'Descargar el kit de prensa (.zip)',
}

const PT: BrandStrings = {
  slogan: 'Livros abertos, não grandes promessas.',
  sub: 'A AffiLayer conecta anunciantes que precisam de clientes a afiliados que podem alcançá-los. Ofertas diretas e um único SmartLink, rastreamento completo e cada comissão em um livro-razão que você pode auditar.',
  aboutH: 'O que somos',
  about:
    'A AffiLayer é uma rede global de afiliados CPA operada pela MarketSync Global LLC, uma empresa registrada no Novo México, EUA. Os anunciantes publicam ofertas com pagamento e ação de conversão definidos; os afiliados as promovem e ganham comissão por conversões atribuídas. A rede abriu em 7 de novembro de 2026. É deliberadamente pequena: um catálogo de ofertas focado, um motor de rastreamento que a equipe pode explicar e inscrições e conversões revisadas à mão.',
  storyH: 'Por que existimos',
  story: [
    'A maioria das redes pede que você confie nos números delas. Criamos a AffiLayer para que você possa conferi-los.',
    'A AffiLayer abriu em 7 de novembro de 2026 como uma nova rede de afiliados CPA. Esta página diz exatamente o que está no ar — nem mais, nem menos.',
    'Somos deliberadamente pequenos agora: um catálogo de ofertas focado, um motor de rastreamento que podemos explicar e uma equipe que revisa inscrições e conversões à mão. Crescemos oferta por oferta.',
    'Se você quer trabalhar conosco desde o início, este é exatamente o momento certo.',
  ],
  principlesH: 'Os três princípios',
  principles: [
    { t: 'Rastreamento que você pode auditar', d: 'Cada clique recebe um ID único com país, dispositivo, referência e subparâmetros, e permanece vinculado à sua conversão.' },
    { t: 'Um livro-razão de comissões append-only', d: 'As comissões passam pelos estados pendente, aprovada, rejeitada ou revertida, com registro de cada mudança, em um livro que não pode ser reescrito em silêncio.' },
    { t: 'Aprovação dos dois lados', d: 'Os afiliados se candidatam às ofertas, os anunciantes as aprovam e as conversões são revisadas antes de se tornarem pagáveis. Ninguém trabalha às cegas.' },
  ],
  differentH: 'O que nos torna diferentes',
  different: [
    { t: 'Livro-razão auditável', d: 'Os números que você vê são os números do livro-razão. Cada mudança de estado de uma comissão é registrada. Verifique: no seu painel, cada conversão mostra seu ID de clique.' },
    { t: 'SmartLink determinístico', d: 'Um link direciona cada visitante a uma oferta elegível para seu país e dispositivo, com regras determinísticas claras. Sem otimização de IA, sem caixa-preta, sem ganhos garantidos — e você vê para qual oferta cada clique foi.' },
    { t: 'Pagamentos manuais, aprovados por um administrador', d: 'Uma pessoa revisa os pagamentos antes de o dinheiro se mover. Net30 por padrão: as comissões aprovadas se tornam pagáveis 30 dias após o fim do mês em que foram aprovadas.' },
  ],
  notH: 'O que não fazemos',
  notDo: [
    'Não geramos tráfego, não compramos tráfego em seu nome e não prometemos resultados a nenhuma das partes.',
    'Não garantimos ganhos. O desempenho depende da oferta, do público e do tráfego.',
    'Sem programa de bônus ou de indicação no lançamento.',
    'Tráfego de chat e tráfego incentivado não são aceitos.',
  ],
  identityH: 'Identidade visual',
  identity:
    'A marca é um A maiúsculo construído com três camadas empilhadas — as camadas da rede. Dourado, sempre nesta ordem de cima para baixo: #D97706, #F59E0B, #FBBF24. A palavra está em Inter ExtraBold. O site usa a pilha de fontes do sistema — nenhuma fonte web é carregada — então os títulos são sans do sistema em negrito e o gradiente dourado é usado com moderação: apenas palavras de destaque em H1 e slogans.',
  lockupsH: 'Versões do logotipo',
  lockups: [
    'Logotipo escuro (logo.svg) sobre fundos claros.',
    'Logotipo claro (logo-light.svg) sobre fundos escuros.',
    'Apenas a marca (logo-mark.svg) para avatares, favicons e tamanhos pequenos.',
    'Nunca recoloque as faixas, nunca adicione efeitos, nunca coloque o logotipo escuro sobre azul-marinho.',
    'Espaço livre: mínimo de uma "largura de perna do A" em todos os lados. Tamanhos mínimos: marca 24px, logotipo completo 120px de largura.',
  ],
  colorsH: 'Cores',
  colors: [
    { name: 'Página', value: '#070D1A' },
    { name: 'Cartões', value: '#111C30' },
    { name: 'Bordas', value: '#1E2A3F' },
    { name: 'Texto atenuado', value: '#8A97A8' },
    { name: 'Dourado', value: '#D97706 / #F59E0B / #FBBF24' },
    { name: 'Texto do botão', value: '#0B1220' },
  ],
  doH: 'Faça / Não faça',
  dos: ['Use a marca sobre azul-marinho.', 'Mantenha a ordem das faixas.', 'Vincule o logotipo a affilayer.com.'],
  donts: ['Não estique, recoloque nem contorne a marca.', 'Não coloque o logotipo claro sobre fundo claro.', 'Não adicione um slogan ao logotipo.', 'Não use a imagem OG como logotipo.'],
  factsH: 'Dados',
  facts: [
    'Operada pela MarketSync Global LLC, Novo México, EUA',
    'Abertura: 7 de novembro de 2026',
    'Contato: support@affilayer.com · Parcerias: partner@affilayer.com',
    'Modelos de pagamento: CPA, CPL, CPS, CPC',
    'Verticais: Dating, Finanças, Gaming, Sweepstakes, Nutra, iGaming',
    'Idiomas: EN / ES / PT (painéis em inglês)',
    'Páginas por país: US, UK, CA, AU, DE, FR, BR, IN, ES, MX, AR',
    'Catálogo de ofertas: pequeno e crescendo oferta por oferta',
  ],
  pressH: 'Kit de imprensa',
  press: 'Logotipos, texto padrão e regras de marca — baixe o kit de imprensa. Para consultas de imprensa, escreva para support@affilayer.com com o assunto "Press". Para perguntas de rastreamento, inclua o ID de clique do seu link.',
  pressCta: 'Baixar o kit de imprensa (.zip)',
}

export const BRAND_STRINGS: Record<Locale, BrandStrings> = { en: EN, es: ES, pt: PT }
