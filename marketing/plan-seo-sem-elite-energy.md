# Plan SEO y SEM · Elite Energy (Asturias)

Plan para posicionar en Google la web de **ELITE ENERGY SL** (Oviedo) y captar clientes y distribuidores con Google Ads.
Ningún proveedor puede garantizar una posición concreta en Google: el SEO tarda semanas o meses en dar resultados y depende de la competencia. Lo que sí se puede hacer es dejar la web técnicamente perfecta, con el contenido adecuado, y empujarla con la ficha de Google y con anuncios desde el primer día.

---

## 1. Lo que ya está hecho en la web

| Elemento | Estado |
|---|---|
| Una página propia para cada servicio, orientada a búsquedas en Asturias | Hecho |
| Títulos (máx. 60 caracteres) y descripciones (máx. 160) únicos por página | Hecho |
| Un único H1 por página, estructura de encabezados limpia | Hecho |
| Datos estructurados (schema.org): empresa, dirección, CIF, zona de servicio, servicios, migas de pan y preguntas frecuentes | Hecho |
| `sitemap.xml` y `robots.txt` | Hecho |
| URL canónica, etiquetas Open Graph e imagen para compartir en redes y WhatsApp | Hecho |
| Datos de contacto idénticos en todas las páginas (nombre, dirección y teléfono) | Hecho |
| Web rápida: fuentes alojadas en el propio servidor, sin librerías externas | Hecho |
| Adaptada a móvil y accesible (teclado, contraste, textos alternativos) | Hecho |
| Aviso legal, política de privacidad y de cookies; banner de cookies con aceptar, rechazar y configurar | Hecho |
| Formularios que envían el correo con la factura adjunta a info@eliteeenergy.es | Hecho (requiere hosting con PHP) |
| Medición preparada: Google Analytics 4 y conversiones de Google Ads, solo con consentimiento | Falta poner los identificadores en `assets/js/config.js` |

### Mapa de palabras clave por página

| Página | Búsqueda principal | Búsquedas secundarias |
|---|---|---|
| Inicio (`/`) | empresa de energía Asturias | asesoría energética Asturias, asesor energético Oviedo, luz y gas Asturias |
| `luz-y-gas.html` | tarifas de luz y gas Asturias | comparar tarifas luz, tarifa luz empresas, optimizar potencia, energía reactiva, tarifa gas empresas |
| `placas-solares-asturias.html` | placas solares Asturias | instalación placas solares Oviedo / Gijón / Avilés, autoconsumo Asturias, ayudas placas solares Asturias |
| `puntos-de-recarga-asturias.html` | cargador coche eléctrico Asturias | instalar wallbox, punto de recarga garaje comunitario, instalador cargador Oviedo / Gijón |
| `eficiencia-energetica-asturias.html` | eficiencia energética empresas Asturias | auditoría energética, eliminar energía reactiva, aerotermia empresas |
| `colaboradores.html` | distribuir energía / comercial energía Asturias | comercial autónomo luz y gas, agente comercial energía, distribuidor de luz y gas |
| `contacto.html` | Elite Energy Oviedo | asesoría energética Oviedo teléfono |

---

## 2. Pasos para publicar y posicionar (por orden)

1. **Comprobar el dominio y el correo.** La web está preparada para `www.eliteeenergy.es` y `info@eliteeenergy.es`. Si el dominio es otro, se cambia en una línea y se vuelve a generar.
2. **Subir la web** al hosting con certificado SSL (HTTPS) activo. Subir también `.htaccess`, `enviar.php`, `sitemap.xml` y `robots.txt`.
3. **Probar el formulario** desde la web publicada y confirmar que llega el correo a info@eliteeenergy.es (revisar también la carpeta de spam la primera vez). Si el hosting lo pide, crear el buzón `web@eliteeenergy.es` como remitente.
4. **Google Search Console** (search.google.com/search-console): dar de alta el dominio, verificarlo y enviar `https://www.eliteeenergy.es/sitemap.xml`. Pedir la indexación de las 7 páginas principales.
5. **Bing Webmaster Tools**: importar desde Search Console (5 minutos).
6. **Perfil de Empresa en Google (Google Business Profile)**. Es lo que más pesa en búsquedas locales como «placas solares Oviedo».
   - Nombre: *Elite Energy* (sin añadir palabras clave al nombre, Google lo penaliza).
   - Dirección: Calle Posada Herrera, 6, 1.º, 33002 Oviedo. Teléfono: 984 518 342. Web: la portada.
   - Categoría principal: la más cercana a «asesor/consultor energético» que ofrezca Google. Categorías secundarias: *Empresa de energía solar*, *Contratista de estaciones de carga para vehículos eléctricos* y similares.
   - Zona de servicio: Asturias y los concejos principales.
   - Servicios: los cinco de la web, con su descripción.
   - Fotos reales: fachada u oficina, equipo, instalaciones hechas (tejados, cargadores). Mínimo 10.
   - Horario real de atención.
7. **Reseñas.** Pedir reseña en Google a cada cliente satisfecho (enviar el enlace directo por WhatsApp tras cada trabajo). Objetivo: 20 reseñas en 3 meses. Responder a todas.
8. **Directorios con los mismos datos exactos** (nombre, dirección, teléfono): Páginas Amarillas, Cylex, Infoisinfo, QDQ, Europages, Bing Places, Apple Business Connect y el directorio de la Cámara de Comercio de Oviedo.
9. **Enlaces locales.** Asociaciones empresariales (FADE, asociaciones de hostelería y comercio), proveedores e instaladores con los que trabajéis, medios locales (notas de prensa sobre instalaciones relevantes).
10. **Contenido mensual** (ver punto 5). Google premia las webs que se actualizan.

---

## 3. Campañas de Google Ads (SEM)

### Configuración común
- **Tipo:** campañas de búsqueda (Search), una por servicio. Sin Display ni socios de búsqueda al principio.
- **Ubicación:** Asturias, opción «Presencia: personas que están o que suelen estar en tus ubicaciones».
- **Idioma:** español.
- **Puja:** empezar con *Maximizar clics* con CPC máximo durante 2–3 semanas; cuando haya 15–30 conversiones, pasar a *Maximizar conversiones* y después a *CPA objetivo*.
- **Horario:** lunes a viernes en horario de oficina para las campañas con llamada; formularios, todo el día.
- **Conversiones:** envío de formulario (página `gracias.html`), llamadas desde anuncios (recurso de llamada) y clic en el teléfono de la web. Se configuran poniendo los identificadores en `assets/js/config.js`.
- **Presupuesto orientativo para empezar:** entre 15 y 30 € al día en total, repartido según prioridad. Revisar el CPC real en el Planificador de palabras clave antes de fijarlo: en energía y placas solares los clics suelen ser caros.
- **Campaña de marca** aparte, con muy poco presupuesto: «elite energy», «elite energy oviedo», «elite energy asturias». Protege tu nombre frente a la competencia.

### Recursos (extensiones) para todas las campañas
- **Llamada:** 984 518 342.
- **Ubicación:** vinculando el Perfil de Empresa en Google.
- **Enlaces de sitio:** Tarifas de luz y gas · Placas solares · Cargador coche eléctrico · Eficiencia energética · Contacto.
- **Textos destacados:** Estudio gratis · Sin cortes de luz · Oficina en Oviedo · Toda Asturias · Legalización incluida · Te llamamos.
- **Fragmentos estructurados (Servicios):** Tarifas de luz, Tarifas de gas, Placas solares, Puntos de recarga, Eficiencia energética.
- **Imagen:** logotipo y fotos reales de instalaciones.

### Campaña: Luz y gas Asturias

**Página de destino:** `luz-y-gas.html`

**Palabras clave** (entre comillas = concordancia de frase; entre corchetes = exacta):

`"asesoría energética asturias"`, `"asesor energético oviedo"`, `"asesor energético gijón"`, `"comparar tarifas de luz"`, `"bajar factura de la luz"`, `"optimizar potencia contratada"`, `"tarifa luz empresas"`, `"tarifa gas empresas"`, `"cambiar compañía de luz"`, `[asesoría energética oviedo]`, `[empresa de energía asturias]`

**Anuncio adaptable de búsqueda: títulos (máx. 30 caracteres)**

| # | Título | Caracteres |
|---|---|---|
| 1 | Asesoría Energética Asturias | 28 |
| 2 | Revisamos Tu Factura Gratis | 27 |
| 3 | Paga Menos Luz y Gas | 20 |
| 4 | Estudio de Factura en 48 h | 26 |
| 5 | Ajustamos Tu Potencia | 21 |
| 6 | Asesores en Oviedo | 18 |
| 7 | Luz y Gas para Empresas | 23 |
| 8 | Compara Ofertas de Luz | 22 |
| 9 | Sin Cortes de Suministro | 24 |
| 10 | Te Llamamos Con Números | 23 |
| 11 | Tarifas 3.0TD y 6.1TD | 21 |
| 12 | Elimina la Energía Reactiva | 27 |
| 13 | Un Asesor Para Todo | 19 |
| 14 | Envíanos Tu Factura | 19 |
| 15 | Llama al 984 518 342 | 20 |

**Descripciones (máx. 90 caracteres)**

| # | Descripción | Caracteres |
|---|---|---|
| 1 | Revisamos tu factura de luz y gas sin coste. Si no podemos mejorarla, te lo decimos. | 84 |
| 2 | Ajuste de potencia, comparativa de ofertas y gestión del cambio. Hogar y empresa. | 81 |
| 3 | Empresa de energía en Oviedo para toda Asturias. Te llamamos con el estudio hecho. | 82 |
| 4 | Manda una foto de tu factura y en 48 h tienes tu estudio con el ahorro calculado. | 81 |

### Campaña: Placas solares Asturias

**Página de destino:** `placas-solares-asturias.html`

**Palabras clave** (entre comillas = concordancia de frase; entre corchetes = exacta):

`"placas solares asturias"`, `"placas solares oviedo"`, `"placas solares gijón"`, `"placas solares avilés"`, `"instalación placas solares asturias"`, `"autoconsumo asturias"`, `"fotovoltaica empresas asturias"`, `"ayudas placas solares asturias"`, `[instaladores placas solares asturias]`

**Anuncio adaptable de búsqueda: títulos (máx. 30 caracteres)**

| # | Título | Caracteres |
|---|---|---|
| 1 | Placas Solares en Asturias | 26 |
| 2 | Autoconsumo Llave en Mano | 25 |
| 3 | Estudio de Tejado Gratis | 24 |
| 4 | Instalación y Legalización | 26 |
| 5 | Calcula Tus Placas Online | 25 |
| 6 | Con o Sin Batería | 17 |
| 7 | Placas Solares en Oviedo | 24 |
| 8 | Placas Solares en Gijón | 23 |
| 9 | Tramitamos Las Ayudas | 21 |
| 10 | Hasta un 50 % Menos de Luz | 26 |
| 11 | Para Casas y Empresas | 21 |
| 12 | Compensación de Excedentes | 26 |
| 13 | Asesores en Oviedo | 18 |
| 14 | Pide Tu Propuesta | 17 |
| 15 | Llama al 984 518 342 | 20 |

**Descripciones (máx. 90 caracteres)**

| # | Descripción | Caracteres |
|---|---|---|
| 1 | Calculamos tu instalación con tu consumo real. Estudio, montaje y legalización. | 79 |
| 2 | Autoconsumo para viviendas, comunidades y empresas en toda Asturias. Pide tu estudio. | 85 |
| 3 | Te decimos cuántas placas necesitas, cuánto cuestan y en cuántos años se pagan. | 79 |
| 4 | Tramitamos permisos, compensación de excedentes y las ayudas disponibles. | 73 |

### Campaña: Recarga coche eléctrico

**Página de destino:** `puntos-de-recarga-asturias.html`

**Palabras clave** (entre comillas = concordancia de frase; entre corchetes = exacta):

`"instalar cargador coche eléctrico"`, `"cargador coche eléctrico asturias"`, `"wallbox asturias"`, `"punto de recarga garaje comunitario"`, `"instalador cargador coche eléctrico oviedo"`, `"instalador cargador coche eléctrico gijón"`, `[puntos de recarga empresas asturias]`

**Anuncio adaptable de búsqueda: títulos (máx. 30 caracteres)**

| # | Título | Caracteres |
|---|---|---|
| 1 | Cargador Coche Eléctrico | 24 |
| 2 | Wallbox Instalado en Asturias | 29 |
| 3 | Recarga en Garaje Comunitario | 29 |
| 4 | Boletín y Legalización | 22 |
| 5 | Carga Por 1,5 € Cada 100 km | 27 |
| 6 | Instaladores Habilitados | 24 |
| 7 | Presupuesto Sin Compromiso | 26 |
| 8 | Para Casas y Empresas | 21 |
| 9 | Te Asesoramos la Tarifa | 23 |
| 10 | Puntos de Recarga en Oviedo | 27 |
| 11 | Puntos de Recarga en Gijón | 26 |
| 12 | Gestionamos Las Ayudas | 22 |
| 13 | Visita Técnica Gratis | 21 |
| 14 | Pide Presupuesto Hoy | 20 |
| 15 | Llama al 984 518 342 | 20 |

**Descripciones (máx. 90 caracteres)**

| # | Descripción | Caracteres |
|---|---|---|
| 1 | Instalamos tu punto de recarga en vivienda, garaje comunitario o empresa en Asturias. | 85 |
| 2 | Revisamos tu cuadro, montamos el wallbox y lo legalizamos. Presupuesto cerrado. | 79 |
| 3 | Carga de noche con la tarifa adecuada: unos 1,5 € cada 100 km. Te ayudamos a elegirla. | 86 |
| 4 | En garajes comunitarios basta con comunicarlo a la comunidad. Nos encargamos de todo. | 85 |

### Campaña: Eficiencia energética empresas

**Página de destino:** `eficiencia-energetica-asturias.html`

**Palabras clave** (entre comillas = concordancia de frase; entre corchetes = exacta):

`"auditoría energética empresas"`, `"auditoría energética asturias"`, `"eficiencia energética empresas asturias"`, `"eliminar energía reactiva"`, `"batería de condensadores"`, `"aerotermia empresas asturias"`

**Anuncio adaptable de búsqueda: títulos (máx. 30 caracteres)**

| # | Título | Caracteres |
|---|---|---|
| 1 | Eficiencia Energética Asturias | 30 |
| 2 | Auditoría Energética | 20 |
| 3 | Elimina la Energía Reactiva | 27 |
| 4 | Reduce el Consumo de Tu Nave | 28 |
| 5 | Plan de Ahorro Con Números | 26 |
| 6 | Monitorización del Consumo | 26 |
| 7 | Aerotermia y LED | 16 |
| 8 | Para Empresas e Industria | 25 |
| 9 | Ahorro Medido y Comprobado | 26 |
| 10 | Asesores en Oviedo | 18 |
| 11 | Solicita Tu Auditoría | 21 |
| 12 | Comunidades de Vecinos | 22 |
| 13 | Un Solo Interlocutor | 20 |
| 14 | Te Decimos Qué Cambiar | 22 |
| 15 | Llama al 984 518 342 | 20 |

**Descripciones (máx. 90 caracteres)**

| # | Descripción | Caracteres |
|---|---|---|
| 1 | Auditamos tu consumo y te damos cada medida con su coste, ahorro y plazo de retorno. | 84 |
| 2 | Reactiva, climatización, iluminación y autoconsumo para empresas de toda Asturias. | 82 |
| 3 | Medimos antes y después para que compruebes el ahorro. Pide tu auditoría. | 73 |
| 4 | Empresa de energía en Oviedo. Un solo interlocutor del estudio a la ejecución. | 78 |

### Campaña: Distribuidores y comerciales

**Página de destino:** `colaboradores.html`

**Palabras clave** (entre comillas = concordancia de frase; entre corchetes = exacta):

`"comercial energía asturias"`, `"comercial autónomo luz y gas"`, `"agente comercial energía"`, `"distribuidor de energía"`, `"trabajar vendiendo luz y gas"`, `"colaborador comercializadora luz"`, `[ser distribuidor de luz y gas]`

**Anuncio adaptable de búsqueda: títulos (máx. 30 caracteres)**

| # | Título | Caracteres |
|---|---|---|
| 1 | Hazte Distribuidor de Energía | 29 |
| 2 | Comercial de Energía Asturias | 29 |
| 3 | Vende Luz, Gas y Solar | 22 |
| 4 | Pago Semanal de Comisiones | 26 |
| 5 | Sin Exclusividad | 16 |
| 6 | Plataforma Que Lee Facturas | 27 |
| 7 | Formación Incluida | 18 |
| 8 | Back-Office Que Te Respalda | 27 |
| 9 | Para Autónomos y Agencias | 25 |
| 10 | Empieza Esta Semana | 19 |
| 11 | Cinco Líneas de Producto | 24 |
| 12 | Trabaja Desde Tu Zona | 21 |
| 13 | Únete a Elite Energy | 20 |
| 14 | Alta en Tres Pasos | 18 |
| 15 | Solicita Tu Alta | 16 |

**Descripciones (máx. 90 caracteres)**

| # | Descripción | Caracteres |
|---|---|---|
| 1 | Vende luz, gas, placas solares, cargadores y eficiencia con una plataforma que te ayuda. | 88 |
| 2 | Comisiones claras y pago semanal de los contratos validados. Sin permanencia. | 77 |
| 3 | Para comerciales autónomos, agencias, instaladores y asesorías de Asturias. | 75 |
| 4 | No necesitas experiencia: la plataforma analiza la factura y te da los argumentos. | 82 |

### Palabras clave negativas (añadir a todas las campañas salvo la de marca)

`iberdrola teléfono`, `naturgy teléfono`, `edp teléfono`, `totalenergies teléfono`, `atención al cliente`, `avería`, `corte de luz`, `lectura contador`, `factura duplicado`, `precio luz hoy`, `precio de la luz mañana`, `bono social`, `qué es`, `pdf`, `curso`, `oposiciones`, `segunda mano`, `kit placas solares`, `amazon`, `leroy merlin`, `bricomart`, `aliexpress`, `gratis descargar`

Añade además, cada semana, las búsquedas irrelevantes que aparezcan en el informe de términos de búsqueda.

> En la campaña de **distribuidores** no añadas como negativa «empleo» ni «trabajo»: son búsquedas que te interesan.

---

## 4. Calendario de los primeros 90 días

| Semana | Tareas |
|---|---|
| 1 | Publicar la web, Search Console, sitemap, Perfil de Empresa en Google, crear GA4 y Google Ads y poner los identificadores |
| 2 | Lanzar campañas de luz y gas, placas solares y marca. Pedir las primeras reseñas |
| 3–4 | Revisar términos de búsqueda, añadir negativas, ajustar pujas. Lanzar recarga y distribuidores |
| 5–8 | Publicar 4 artículos (ver punto 5). Alta en directorios. Primeras fotos de instalaciones en la ficha de Google |
| 9–12 | Pasar a *Maximizar conversiones* donde haya datos. Revisar qué páginas reciben visitas en Search Console y reforzarlas |

---

## 5. Contenidos recomendados (uno o dos al mes)

1. ¿Compensan las placas solares en Asturias? Producción real por zonas.
2. Cómo instalar un cargador en un garaje comunitario en Asturias, paso a paso.
3. Tarifa 3.0TD: cómo ajustar la potencia de tu negocio y cuánto se ahorra.
4. Ayudas para placas solares y cargadores en Asturias: qué hay abierto este año.
5. Energía reactiva: qué es, por qué la pagas y cómo eliminarla.
6. Precio fijo o indexado: cuál conviene a un bar, un taller o una nave.
7. Autoconsumo colectivo en comunidades de vecinos de Oviedo y Gijón.
8. Casos reales de clientes (con su permiso): factura antes y después.

Cada artículo debe enlazar a la página del servicio correspondiente.

---

## 6. Cómo medir si funciona

| Indicador | Dónde se mira | Objetivo a 3 meses |
|---|---|---|
| Páginas indexadas | Search Console | Las 7 principales |
| Impresiones y clics por búsquedas locales | Search Console | Tendencia al alza mes a mes |
| Llamadas y visitas desde la ficha de Google | Perfil de Empresa | Tendencia al alza |
| Reseñas en Google | Perfil de Empresa | 20 o más, media superior a 4,5 |
| Formularios recibidos | Correo / GA4 (`generate_lead`) | Fijar tras el primer mes |
| Coste por contacto en Google Ads | Google Ads | Fijar tras el primer mes |

---

## 7. Datos a confirmar antes de publicar

- Dominio y correo: `eliteeenergy.es` / `info@eliteeenergy.es` (tal como se indicó; revisar que no sea `eliteenergy.es`).
- Datos registrales para el aviso legal (tomo, folio y hoja del Registro Mercantil de Asturias).
- Horario de atención (para la ficha de Google y la web).
- Que se puedan cumplir los compromisos que aparecen en la web: estudio en 48 h, pago semanal a colaboradores, instaladores habilitados.
- Que Elite Energy realiza (o subcontrata con instaladores habilitados) las instalaciones de placas, cargadores y eficiencia.
