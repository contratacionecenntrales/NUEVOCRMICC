#!/usr/bin/env python3
"""Genera las páginas de la web de Elite Energy.

Cada página tiene su contenido en tools/web/pages/<archivo>.html y aquí se le
añaden la cabecera, el pie, las etiquetas SEO y los datos estructurados.

Uso:  python3 tools/web/build.py
Salida: web-elite-energy/*.html, sitemap.xml y robots.txt
"""
import json
import pathlib
from datetime import date
from html import escape

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "tools" / "web" / "pages"
PARTIALS = ROOT / "tools" / "web" / "partials"
OUT = ROOT / "web-elite-energy"

# ---------------------------------------------------------------------------
# Datos de la empresa: cambiar aquí y volver a ejecutar el script.
# ---------------------------------------------------------------------------
SITE = "https://www.eliteeenergy.es"
EMPRESA = {
    "marca": "Elite Energy",
    "razon_social": "ELITE ENERGY SL",
    "cif": "B01634468",
    "calle": "Calle Posada Herrera, 6, 1.º",
    "cp": "33002",
    "ciudad": "Oviedo",
    "provincia": "Asturias",
    "telefono": "984 518 342",
    "telefono_e164": "+34984518342",
    "email": "info@eliteeenergy.es",
    "fundacion": "2020-06-17",
    "zonas": ["Oviedo", "Gijón", "Avilés", "Siero", "Langreo", "Mieres", "Llanera", "Castrillón", "Corvera", "Villaviciosa"],
}
HOY = date.today().isoformat()

# Menú principal: (archivo, texto)
MENU = [
    ("luz-y-gas.html", "Luz y gas"),
    ("placas-solares-asturias.html", "Placas solares"),
    ("puntos-de-recarga-asturias.html", "Recarga coche eléctrico"),
    ("eficiencia-energetica-asturias.html", "Eficiencia"),
    ("colaboradores.html", "Distribuye con nosotros"),
    ("contacto.html", "Contacto"),
]

# Páginas: archivo, título SEO, descripción, prioridad sitemap, migas, extras
PAGES = [
    dict(file="index.html", seg="hogar", nav=None,
         title="Empresa de energía en Asturias: luz y gas | Elite Energy",
         desc="Empresa de energía en Oviedo (Asturias). Revisamos tu factura de luz y gas, instalamos placas solares y cargadores para coche eléctrico. Estudio gratis.",
         prio="1.0", crumbs=None, schema=["website"]),
    dict(file="luz-y-gas.html", interes="luz", seg="hogar", nav="luz-y-gas.html",
         title="Tarifas de luz y gas en Asturias | Elite Energy",
         desc="Comparamos tarifas de luz y gas en Asturias y ajustamos tu potencia. Asesoría para hogares, pymes e industria en Oviedo, Gijón y Avilés. Estudio gratuito.",
         prio="0.9", crumbs=[("Luz y gas", None)],
         service=("Asesoría en tarifas de luz y gas", "Comparativa de tarifas de electricidad y gas natural, optimización de potencia y revisión de facturas para hogares y empresas en Asturias.")),
    dict(file="placas-solares-asturias.html", interes="solar", seg="hogar", nav="placas-solares-asturias.html",
         title="Placas solares en Asturias: instalación | Elite Energy",
         desc="Instalación de placas solares en Asturias para viviendas, comunidades y empresas. Estudio de tu tejado, legalización y ayudas. Calcula tu ahorro en un minuto.",
         prio="0.9", crumbs=[("Placas solares en Asturias", None)],
         service=("Instalación de placas solares y autoconsumo", "Estudio, instalación y legalización de autoconsumo fotovoltaico con o sin baterías en Asturias.")),
    dict(file="puntos-de-recarga-asturias.html", interes="recarga", seg="hogar", nav="puntos-de-recarga-asturias.html",
         title="Cargador para coche eléctrico en Asturias | Elite Energy",
         desc="Instalamos puntos de recarga para coche eléctrico en Asturias: vivienda, garaje comunitario y empresa. Boletín, legalización y gestión de ayudas incluidos.",
         prio="0.9", crumbs=[("Puntos de recarga en Asturias", None)],
         service=("Instalación de puntos de recarga para vehículo eléctrico", "Instalación de wallbox y puntos de recarga en viviendas, garajes comunitarios y empresas de Asturias.")),
    dict(file="eficiencia-energetica-asturias.html", interes="eficiencia", seg="empresa", nav="eficiencia-energetica-asturias.html",
         title="Eficiencia energética en Asturias | Elite Energy",
         desc="Auditorías energéticas, monitorización y eliminación de la reactiva para empresas y comunidades de Asturias. Te decimos qué cambiar y cuánto ahorras.",
         prio="0.8", crumbs=[("Eficiencia energética", None)],
         service=("Eficiencia energética y auditorías", "Auditorías energéticas, monitorización, corrección de energía reactiva y mejoras de climatización e iluminación para empresas en Asturias.")),
    dict(file="colaboradores.html", seg="colab", nav="colaboradores.html",
         title="Distribuye energía con nosotros | Elite Energy Asturias",
         desc="Hazte comercial o distribuidor de Elite Energy en Asturias. Vende luz, gas, placas solares y cargadores con una plataforma que analiza la factura.",
         prio="0.8", crumbs=[("Distribuye con nosotros", None)], schema=["jobs"]),
    dict(file="contacto.html", seg="hogar", nav="contacto.html",
         title="Contacto: asesoría energética en Oviedo | Elite Energy",
         desc="Contacta con Elite Energy en Oviedo: 984 518 342, info@eliteeenergy.es. Calle Posada Herrera 6, 33002 Oviedo. Envíanos tu factura y te llamamos con el estudio.",
         prio="0.7", crumbs=[("Contacto", None)]),
    dict(file="aviso-legal.html", seg=None, nav=None, legal=True,
         title="Aviso legal | Elite Energy", desc="Aviso legal de la web de ELITE ENERGY SL (CIF B01634468), con domicilio en Oviedo, Asturias.",
         prio="0.3", crumbs=[("Aviso legal", None)]),
    dict(file="politica-privacidad.html", seg=None, nav=None, legal=True,
         title="Política de privacidad | Elite Energy", desc="Cómo trata ELITE ENERGY SL tus datos personales: finalidades, base legal, conservación, destinatarios y cómo ejercer tus derechos.",
         prio="0.3", crumbs=[("Política de privacidad", None)]),
    dict(file="politica-cookies.html", seg=None, nav=None, legal=True,
         title="Política de cookies | Elite Energy", desc="Qué cookies usa la web de Elite Energy, para qué sirven y cómo puedes aceptarlas, rechazarlas o cambiar tu elección.",
         prio="0.3", crumbs=[("Política de cookies", None)]),
    dict(file="gracias.html", seg=None, nav=None, noindex=True, conversion="formulario",
         title="Solicitud recibida | Elite Energy", desc="Hemos recibido tu solicitud.", crumbs=None),
    dict(file="404.html", seg=None, nav=None, noindex=True, base=True,
         title="Página no encontrada | Elite Energy", desc="La página que buscas no existe.", crumbs=None),
]

# ---------------------------------------------------------------------------
ICON = {
    "tel": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
    "mail": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    "pin": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-12a7 7 0 1 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
    "doc": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 3H6v18h12V7zM14 3v4h4"/></svg>',
}


def url(file):
    return SITE + "/" if file == "index.html" else f"{SITE}/{file}"


def address_schema():
    e = EMPRESA
    return {"@type": "PostalAddress", "streetAddress": e["calle"], "postalCode": e["cp"],
            "addressLocality": e["ciudad"], "addressRegion": e["provincia"], "addressCountry": "ES"}


def org_schema():
    e = EMPRESA
    return {
        "@type": ["Organization", "ProfessionalService"],
        "@id": SITE + "/#empresa",
        "name": e["marca"], "legalName": e["razon_social"], "taxID": e["cif"],
        "url": SITE + "/", "logo": SITE + "/logos/logo-elite-energy.png", "image": SITE + "/assets/img/og-elite-energy.png",
        "telephone": "+34 984 51 83 42", "email": e["email"], "foundingDate": e["fundacion"],
        "address": address_schema(),
        "areaServed": [{"@type": "AdministrativeArea", "name": "Asturias"}] + [{"@type": "City", "name": z} for z in e["zonas"][:6]],
        "description": "Asesoría energética en Asturias: tarifas de luz y gas, placas solares, puntos de recarga y eficiencia energética para hogares y empresas.",
        "knowsAbout": ["tarifas de luz", "tarifas de gas", "autoconsumo fotovoltaico", "puntos de recarga", "eficiencia energética"],
    }


def schema_for(p, faqs):
    graph = [org_schema()]
    if "website" in p.get("schema", []):
        graph.append({"@type": "WebSite", "@id": SITE + "/#web", "url": SITE + "/", "name": "Elite Energy", "inLanguage": "es-ES",
                      "publisher": {"@id": SITE + "/#empresa"}})
    if p.get("crumbs"):
        items = [{"@type": "ListItem", "position": 1, "name": "Inicio", "item": SITE + "/"}]
        for i, (name, _) in enumerate(p["crumbs"], start=2):
            items.append({"@type": "ListItem", "position": i, "name": name, "item": url(p["file"])})
        graph.append({"@type": "BreadcrumbList", "itemListElement": items})
    if p.get("service"):
        name, desc = p["service"]
        graph.append({"@type": "Service", "name": name, "description": desc, "serviceType": name,
                      "provider": {"@id": SITE + "/#empresa"}, "areaServed": {"@type": "AdministrativeArea", "name": "Asturias"},
                      "url": url(p["file"])})
    if "jobs" in p.get("schema", []):
        graph.append({"@type": "WebPage", "name": "Distribuye energía con Elite Energy", "url": url(p["file"]),
                      "about": "Captación de comerciales autónomos y distribuidores de energía en Asturias"})
    if faqs:
        graph.append({"@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faqs]})
    return json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, indent=1)


def extract_faqs(body):
    """Lee las preguntas de los <details data-faq> para el marcado FAQPage."""
    import re
    faqs = []
    for m in re.finditer(r'<details[^>]*data-faq[^>]*>\s*<summary>(.*?)</summary>\s*<p>(.*?)</p>', body, re.S):
        q = re.sub(r"<[^>]+>", "", m.group(1)).strip()
        a = re.sub(r"<[^>]+>", "", m.group(2)).strip()
        faqs.append((q, a))
    return faqs


def head(p, faqs, extra_css):
    robots = "noindex, follow" if p.get("noindex") else "index, follow, max-image-preview:large"
    canonical = "" if p.get("noindex") else f'<link rel="canonical" href="{url(p["file"])}">\n'
    schema = "" if p.get("noindex") else f'<script type="application/ld+json">\n{schema_for(p, faqs)}\n</script>\n'
    og = "" if p.get("noindex") else f"""<meta property="og:type" content="website">
<meta property="og:locale" content="es_ES">
<meta property="og:site_name" content="Elite Energy">
<meta property="og:title" content="{escape(p['title'])}">
<meta property="og:description" content="{escape(p['desc'])}">
<meta property="og:url" content="{url(p['file'])}">
<meta property="og:image" content="{SITE}/assets/img/og-elite-energy.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
"""
    css = f"<style>\n{extra_css}\n</style>\n" if extra_css else ""
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
{'<base href="/">' + chr(10) if p.get("base") else ""}<title>{escape(p['title'])}</title>
<meta name="description" content="{escape(p['desc'])}">
<meta name="robots" content="{robots}">
{canonical}<meta name="geo.region" content="ES-AS">
<meta name="geo.placename" content="Oviedo">
{og}<link rel="icon" href="logos/favicon.svg" type="image/svg+xml">
<link rel="icon" href="logos/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="logos/favicon-180.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#002a5c">
<link rel="preload" href="assets/fonts/dm-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/space-grotesk-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/css/site.css">
{css}{schema}</head>"""


def topbar(p):
    seg = p.get("seg")
    def a(href, txt, key):
        on = ' class="on" aria-current="true"' if seg == key else ""
        return f'<a href="{href}"{on}>{txt}</a>'
    e = EMPRESA
    return f"""<div class="topbar">
  <div class="wrap">
    <nav class="seg-top" aria-label="Tipo de cliente">
      {a("index.html", "Hogares", "hogar")}
      {a("luz-y-gas.html#empresas", "Empresas", "empresa")}
      {a("colaboradores.html", "Distribuidores", "colab")}
    </nav>
    <div class="top-r">
      <a href="mailto:{e['email']}" class="hide-s">{ICON['mail']}{e['email']}</a>
      <a href="tel:{e['telefono_e164']}">{ICON['tel']}{e['telefono']}</a>
    </div>
  </div>
</div>"""


def header(p):
    items = []
    for href, txt in MENU:
        cur = ' class="on" aria-current="page"' if p.get("nav") == href else ""
        items.append(f'<a href="{href}"{cur}>{txt}</a>')
    return f"""<header class="site">
  <div class="wrap nav">
    <a href="index.html" class="logo" aria-label="Elite Energy – inicio"><img src="logos/floral-core-claro.svg" alt="" width="34" height="34"><span><span class="w1">Elite</span> <span class="w2">Energy</span></span></a>
    <nav class="menu" id="menu" aria-label="Principal">
      {chr(10).join('      ' + i for i in items).strip()}
    </nav>
    <div class="nav-r">
      <a href="contacto.html" class="btn sm">Estudio gratis</a>
      <button class="burger" id="burger" type="button" aria-label="Abrir menú" aria-expanded="false" aria-controls="menu"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#002a5c" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    </div>
  </div>
</header>"""


def crumbs_html(p):
    c = p.get("crumbs")
    if not c:
        return ""
    parts = ['<a href="index.html">Inicio</a>']
    for name, _ in c:
        parts.append(f'<span aria-current="page">{name}</span>')
    return '<nav class="crumbs" aria-label="Migas de pan">' + ' <span aria-hidden="true">›</span> '.join(parts) + "</nav>"


def footer():
    e = EMPRESA
    zonas = ", ".join(e["zonas"])
    return f"""<footer class="site">
  <div class="ft-cta">
    <div class="wrap">
      <p>¿Hablamos de tu factura?<span>Mándanos una y te llamamos con el estudio hecho. Sin coste y sin compromiso.</span></p>
      <div class="acts"><a href="contacto.html" class="btn white">Enviar mi factura</a><a href="tel:{e['telefono_e164']}" class="btn ghost">Llamar al {e['telefono']}</a></div>
    </div>
  </div>
  <div class="ft-main">
    <div class="wrap">
      <div class="ft">
        <div class="ft-brand">
          <a href="index.html" class="logo" aria-label="Elite Energy – inicio"><img src="logos/floral-core-oscuro.svg" alt="" width="34" height="34"><span><span class="w1">Elite</span> <span class="w2">Energy</span></span></a>
          <p>Asesoría energética en Asturias. Tarifas de luz y gas, placas solares, puntos de recarga y eficiencia energética para hogares y empresas.</p>
          <address>
            <div>{ICON['pin']}<span>{e['calle']}<br>{e['cp']} {e['ciudad']} ({e['provincia']})</span></div>
            <div>{ICON['tel']}<a href="tel:{e['telefono_e164']}">{e['telefono']}</a></div>
            <div>{ICON['mail']}<a href="mailto:{e['email']}">{e['email']}</a></div>
            <div>{ICON['doc']}<span>{e['razon_social']} · CIF {e['cif']}</span></div>
          </address>
        </div>
        <nav aria-labelledby="ft-serv">
          <h2 id="ft-serv">Servicios</h2>
          <ul>
            <li><a href="luz-y-gas.html">Tarifas de luz y gas</a></li>
            <li><a href="luz-y-gas.html#empresas">Energía para empresas</a></li>
            <li><a href="placas-solares-asturias.html">Placas solares en Asturias</a></li>
            <li><a href="puntos-de-recarga-asturias.html">Puntos de recarga</a></li>
            <li><a href="eficiencia-energetica-asturias.html">Eficiencia energética</a></li>
          </ul>
        </nav>
        <nav aria-labelledby="ft-emp">
          <h2 id="ft-emp">Elite Energy</h2>
          <ul>
            <li><a href="luz-y-gas.html#simulador">Simulador de ahorro</a></li>
            <li><a href="luz-y-gas.html#factura">Revisión de factura</a></li>
            <li><a href="colaboradores.html">Distribuye con nosotros</a></li>
            <li><a href="contacto.html">Contacto</a></li>
          </ul>
        </nav>
        <nav aria-labelledby="ft-legal">
          <h2 id="ft-legal">Información legal</h2>
          <ul>
            <li><a href="aviso-legal.html">Aviso legal</a></li>
            <li><a href="politica-privacidad.html">Política de privacidad</a></li>
            <li><a href="politica-cookies.html">Política de cookies</a></li>
            <li><button type="button" class="linkish" data-ck="open">Configurar cookies</button></li>
          </ul>
        </nav>
      </div>
      <p class="ft-zones"><b>Damos servicio en toda Asturias:</b> {zonas} y resto del Principado.</p>
    </div>
  </div>
  <div class="ft-legal">
    <div class="wrap">
      <div>
        <span>© <span data-year>{date.today().year}</span> {e['razon_social']} · CIF {e['cif']} · {e['calle']}, {e['cp']} {e['ciudad']}</span>
        <p class="ft-note">Elite Energy actúa como asesor energético e intermediario. El suministro de luz y gas lo presta la comercializadora que elijas, con la que firmas el contrato. Los cálculos de la web son orientativos.</p>
      </div>
      <nav aria-label="Legal"><a href="aviso-legal.html">Aviso legal</a><a href="politica-privacidad.html">Privacidad</a><a href="politica-cookies.html">Cookies</a><button type="button" data-ck="open">Configurar cookies</button></nav>
    </div>
  </div>
</footer>"""


def consent_ui():
    return """<a href="contacto.html" class="float" aria-label="Te llamamos gratis"><span class="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg></span><span class="lb">Te llamamos</span></a>

<div class="ck-banner" id="ck-banner" role="region" aria-label="Aviso de cookies">
  <h2>Usamos cookies</h2>
  <p>Usamos cookies técnicas necesarias para que la web funcione y, solo si nos das permiso, cookies de análisis y de publicidad de Google para medir las visitas y mejorar nuestras campañas. Puedes aceptarlas, rechazarlas o elegir cuáles. Más información en la <a href="politica-cookies.html">política de cookies</a>.</p>
  <div class="ck-actions">
    <button type="button" class="btn" data-ck="accept">Aceptar todas</button>
    <button type="button" class="btn" data-ck="reject">Rechazar todas</button>
    <button type="button" class="btn out" data-ck="config">Configurar</button>
  </div>
</div>

<div class="ck-modal" id="ck-modal" role="dialog" aria-modal="true" aria-labelledby="ck-title">
  <div class="ck-dialog">
    <h2 id="ck-title">Configurar cookies</h2>
    <p>Elige qué cookies aceptas. Puedes cambiarlo cuando quieras desde «Configurar cookies» en el pie de la web.</p>
    <div class="ck-cat"><header><h3>Técnicas (necesarias)</h3><span class="always">Siempre activas</span></header><p>Guardan tu elección sobre las cookies y permiten que la web funcione. No necesitan consentimiento.</p></div>
    <div class="ck-cat"><header><h3><label for="ck-an">Análisis</label></h3><span class="sw"><input type="checkbox" id="ck-an"><span></span></span></header><p>Google Analytics: nos dice cuántas personas visitan la web y qué páginas usan, de forma agregada.</p></div>
    <div class="ck-cat"><header><h3><label for="ck-ads">Publicidad</label></h3><span class="sw"><input type="checkbox" id="ck-ads"><span></span></span></header><p>Google Ads: mide si nuestros anuncios funcionan y permite mostrarte anuncios relacionados.</p></div>
    <div class="ck-actions">
      <button type="button" class="btn" data-ck="save">Guardar mi elección</button>
      <button type="button" class="btn" data-ck="accept">Aceptar todas</button>
      <button type="button" class="btn out" data-ck="reject">Rechazar todas</button>
    </div>
  </div>
</div>

<script src="assets/js/config.js"></script>
<script src="assets/js/site.js"></script>"""


def expand_partials(src):
    """Sustituye <!--NOMBRE--> por el bloque de tools/web/partials/NOMBRE.html."""
    import re
    def part(name):
        if name == "SIMULADORES":
            return part("SIM_FACTURA") + "\n    " + part("SIM_SOLAR")
        if name == "SIM_SOLAR_SOLO":
            return part("SIM_SOLAR").replace('class="pane sim-grid"', 'class="pane on sim-grid"', 1)
        f = PARTIALS / f"{name}.html"
        return f.read_text(encoding="utf-8").strip() if f.exists() else f"<!--{name}-->"
    return re.sub(r"<!--([A-Z_]+)-->", lambda m: part(m.group(1)), src)


def build():
    built = []
    for p in PAGES:
        src = (SRC / p["file"]).read_text(encoding="utf-8")
        extra_css = ""
        if src.startswith("<style>"):
            end = src.index("</style>")
            extra_css = src[len("<style>"):end].strip()
            src = src[end + len("</style>"):].lstrip()
        src = expand_partials(src)
        if p.get("interes"):
            src = src.replace(f'<option value="{p["interes"]}">', f'<option value="{p["interes"]}" selected>')
        e = EMPRESA
        repl = {
            "{{ORIGEN}}": p["file"].replace(".html", ""),
            "{{CRUMBS}}": crumbs_html(p), "{{TEL}}": e["telefono"], "{{TEL164}}": e["telefono_e164"],
            "{{EMAIL}}": e["email"], "{{CALLE}}": e["calle"], "{{CP}}": e["cp"], "{{CIUDAD}}": e["ciudad"],
            "{{RAZON}}": e["razon_social"], "{{CIF}}": e["cif"], "{{SITE}}": SITE, "{{HOY}}": HOY,
            "{{HOY_TXT}}": date.today().strftime("%d/%m/%Y"),
        }
        for k, v in repl.items():
            src = src.replace(k, v)
        faqs = extract_faqs(src)
        conv = f' data-conversion="{p["conversion"]}"' if p.get("conversion") else ""
        html = (head(p, faqs, extra_css) + f"\n<body{conv}>\n" +
                '<a class="skip" href="#contenido">Saltar al contenido</a>\n' +
                topbar(p) + "\n\n" + header(p) + '\n\n<main id="contenido">\n' + src.strip() + "\n</main>\n\n" +
                footer() + "\n\n" + consent_ui() + "\n</body>\n</html>\n")
        (OUT / p["file"]).write_text(html, encoding="utf-8")
        built.append(p)

    # sitemap.xml
    urls = "\n".join(
        f"  <url><loc>{url(p['file'])}</loc><lastmod>{HOY}</lastmod><priority>{p['prio']}</priority></url>"
        for p in built if not p.get("noindex"))
    (OUT / "sitemap.xml").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n',
        encoding="utf-8")
    (OUT / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\nDisallow: /gracias.html\nDisallow: /enviar.php\n\nSitemap: {SITE}/sitemap.xml\n", encoding="utf-8")
    print("Páginas generadas:", ", ".join(p["file"] for p in built))


if __name__ == "__main__":
    build()
