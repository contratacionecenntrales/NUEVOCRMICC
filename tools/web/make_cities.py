"""Genera las páginas locales (Oviedo, Gijón, Avilés) con contenido propio para cada ciudad."""
import pathlib
OUT = pathlib.Path(__file__).parent / "pages"
C = {
 "oviedo": dict(nombre="Oviedo", h1='Empresa de energía en <span class="pill-hl">Oviedo</span>.',
  lead="Nuestra oficina está en Oviedo, en la calle Posada Herrera. Revisamos facturas de luz y gas, instalamos placas solares y cargadores y mejoramos la eficiencia de viviendas, comercios y empresas de la capital y su entorno.",
  intro=["Al tener la oficina en el centro de Oviedo, puedes traernos la factura en mano o que vayamos nosotros a ver tu instalación el mismo día. Trabajamos en todos los barrios y en los concejos cercanos, como <strong>Siero, Llanera, Ribera de Arriba o Las Regueras</strong>.",
         "En Oviedo vemos sobre todo pisos en edificios con garaje comunitario, comercios del centro y oficinas. Por eso dos de las consultas más habituales son <strong>cómo instalar un cargador en la plaza de garaje</strong> y cómo bajar la potencia contratada de un local que paga más de lo que usa."],
  casos=[("Pisos y comunidades","Revisión de potencia y tarifa, cargador en la plaza del garaje y autoconsumo compartido en la cubierta del edificio."),
         ("Comercios y oficinas","Tarifas 2.0TD y 3.0TD ajustadas por periodos, revisión de extras en la factura y climatización eficiente."),
         ("Casas en el entorno","En las zonas de unifamiliares de los alrededores, placas solares con o sin batería y wallbox en el garaje.")],
  faq=[("¿Puedo llevaros la factura a la oficina?","Sí. Estamos en Calle Posada Herrera, 6, 1.º, en Oviedo. Llámanos antes al 984 518 342 para que te atienda tu asesor."),
       ("¿Trabajáis también fuera de Oviedo?","Sí, en toda Asturias. Desde Oviedo nos desplazamos a Siero, Llanera, Gijón, Avilés y el resto de concejos."),
       ("¿Se puede poner un cargador en un garaje comunitario de Oviedo?","Sí. Basta con comunicarlo a la comunidad de propietarios antes de la instalación. Nosotros hacemos la instalación desde tu contador hasta tu plaza.")]),
 "gijon": dict(nombre="Gijón", h1='Energía en <span class="pill-hl">Gijón</span>: luz, gas, placas y cargadores.',
  lead="Asesoramos a hogares, hostelería, comercios e industria de Gijón. Revisamos tu factura de luz y gas, instalamos placas solares y puntos de recarga y te ayudamos a consumir menos.",
  intro=["Gijón es la ciudad más poblada de Asturias y tiene una gran concentración de <strong>hostelería, comercio y empresas industriales</strong>. Son negocios donde la factura de luz y gas pesa mucho y casi nunca se revisa: potencias sobredimensionadas, energía reactiva o contratos de gas renovados sin mirar.",
         "Desde nuestra oficina de Oviedo llegamos a Gijón en una media hora, así que la visita técnica para placas solares o un cargador no supone ningún problema. Trabajamos en todos los barrios y en las zonas industriales y polígonos de alrededor."],
  casos=[("Hostelería","Luz y gas revisados juntos: potencia por periodos, cámaras y cocinas, y caudal de gas contratado."),
         ("Industria y polígonos","Tarifas 3.0TD y 6.1TD, corrección de energía reactiva y autoconsumo en cubiertas de naves."),
         ("Viviendas","Placas solares en casas, cargador en garaje y tarifa por horas para cargar el coche de noche.")],
  faq=[("¿Os desplazáis a Gijón?","Sí. Venimos desde Oviedo, a unos 30 minutos, para las visitas técnicas de placas solares, cargadores y eficiencia."),
       ("¿Trabajáis con hostelería en Gijón?","Sí. Revisamos la luz y el gas del local juntos y vigilamos los excesos de potencia, que son habituales en cocinas y cámaras frigoríficas."),
       ("¿Compensan las placas solares en una nave de Gijón?","Normalmente sí, porque las empresas consumen sobre todo de día, que es cuando producen las placas. Lo calculamos con tu curva de consumo real.")]),
 "aviles": dict(nombre="Avilés", h1='Empresa de energía en <span class="pill-hl">Avilés</span>.',
  lead="Ayudamos a empresas, comercios y hogares de Avilés y la comarca a pagar menos energía: tarifas de luz y gas, eficiencia, placas solares y puntos de recarga.",
  intro=["Avilés y su comarca tienen un fuerte tejido industrial y de pequeñas empresas de servicios. En estos negocios suelen aparecer <strong>recargos por energía reactiva y excesos de potencia</strong> que se pueden eliminar, además de oportunidades claras de autoconsumo en cubiertas.",
         "Damos servicio en Avilés, <strong>Castrillón, Corvera, Gozón e Illas</strong>. Desde Oviedo estamos a unos 30 minutos, así que podemos ver tu instalación cuando haga falta."],
  casos=[("Talleres e industria","Batería de condensadores contra la reactiva, ajuste de potencia y tarifas indexadas con cobertura."),
         ("Comercio y servicios","Revisión de tarifa y potencia, iluminación LED y climatización eficiente."),
         ("Hogares de la comarca","Placas solares en viviendas unifamiliares y cargador para el coche eléctrico.")],
  faq=[("¿Dais servicio en Castrillón y Corvera?","Sí, en toda la comarca de Avilés: Castrillón, Corvera, Gozón, Illas y el resto de concejos cercanos."),
       ("¿Qué es la energía reactiva que aparece en mi factura?","Es un recargo que paga la empresa cuando su factor de potencia baja de 0,95, algo habitual con motores y compresores. Se corrige con una batería de condensadores."),
       ("¿Cuánto tarda el estudio de mi factura?","Normalmente te damos el estudio con números en unas 48 horas desde que recibimos la factura.")]),
}
SERV = [("luz-y-gas.html","Tarifas de luz y gas","Revisamos tu factura y ajustamos la potencia."),
        ("placas-solares-asturias.html","Placas solares","Estudio de tejado, instalación y legalización."),
        ("puntos-de-recarga-asturias.html","Cargador coche eléctrico","En vivienda, garaje comunitario o empresa."),
        ("eficiencia-energetica-asturias.html","Eficiencia energética","Auditoría, reactiva, climatización y LED.")]
for k, c in C.items():
    n = c["nombre"]
    serv = "".join(f'<a class="rel" href="{f}"><b>{t} en {n}</b><span>{d}</span><i aria-hidden="true">→</i></a>' for f,t,d in SERV)
    casos = "".join(f'<div class="box"><h3>{a}</h3><p>{b}</p></div>' for a,b in c["casos"])
    faq = "\n      ".join(f'<details data-faq{" open" if i==0 else ""}><summary>{q}</summary><p>{a}</p></details>' for i,(q,a) in enumerate(c["faq"]))
    html = f'''<section class="page-hero" style="padding-bottom:0">
  <div class="wrap">
    <div class="ph-box">
      <div class="txt">
        {{{{CRUMBS}}}}
        <h1>{c["h1"]}</h1>
        <p>{c["lead"]}</p>
        <div class="acts"><a href="contacto.html" class="btn white">Pedir estudio gratis</a><a href="tel:{{{{TEL164}}}}" class="btn ghost">Llamar al {{{{TEL}}}}</a></div>
        <div class="ph-facts"><span>{n} y alrededores</span><span>Estudio gratuito</span><span>Hogar y empresa</span></div>
      </div>
      <div class="art" aria-hidden="true">
        <svg class="bg" viewBox="0 0 600 520" preserveAspectRatio="xMidYMid slice"><rect width="600" height="520" fill="#072762"/><circle cx="480" cy="110" r="210" fill="#0A6CFF"/><circle cx="480" cy="110" r="130" fill="#3D8BFF"/><circle cx="480" cy="110" r="54" fill="#22C2FE"/><path d="M0 440C140 380 260 490 420 420S600 400 600 400V520H0Z" fill="#0D3577"/></svg>
        <div class="float-card num"><h4>Elite Energy <small>{n}</small></h4><div class="fc-row"><span>Estudio de factura</span><b>Gratis</b></div><div class="fc-row"><span>Visita técnica</span><b>En {n}</b></div><div class="fc-hi"><span>Teléfono</span><b>{{{{TEL}}}}</b></div></div>
      </div>
    </div>
  </div>
</section>

<section>
  <div class="wrap split wide">
    <div class="prose-lite">
      <p class="eyebrow">Asesoría energética en {n}</p>
      <h2 class="mt12">Tu empresa de energía de confianza en {n}</h2>
      <p>{c["intro"][0]}</p>
      <p>{c["intro"][1]}</p>
    </div>
    <aside class="aside-card">
      <h3>Contacto</h3>
      <dl>
        <div><dt>Oficina</dt><dd>{{{{CALLE}}}}<br>{{{{CP}}}} {{{{CIUDAD}}}}</dd></div>
        <div><dt>Teléfono</dt><dd><a href="tel:{{{{TEL164}}}}">{{{{TEL}}}}</a></dd></div>
        <div><dt>Correo</dt><dd><a href="mailto:{{{{EMAIL}}}}">{{{{EMAIL}}}}</a></dd></div>
        <div><dt>Zona</dt><dd>{n} y alrededores</dd></div>
      </dl>
      <a href="contacto.html" class="btn white">Enviar mi factura</a>
    </aside>
  </div>
</section>

<section class="soft">
  <div class="wrap">
    <p class="eyebrow">Servicios en {n}</p><h2 class="mt12">Qué hacemos en {n}</h2>
    <div class="rel-grid" style="margin-top:28px">{serv}</div>
    <h2 class="mt12" style="margin-top:56px;font-size:clamp(24px,2.6vw,32px)">Para quién trabajamos en {n}</h2>
    <div class="boxes three" style="margin-top:22px">{casos}</div>
  </div>
</section>

<section id="ayuda">
  <div class="wrap help-grid">
    <div><p class="eyebrow">Preguntas frecuentes</p><h2 class="mt12">Dudas habituales en {n}</h2></div>
    <div>
      {faq}
    </div>
  </div>
</section>

<section id="llamada" style="padding-top:0">
  <div class="wrap">
    <div class="cb">
      <span class="deco" aria-hidden="true"></span>
      <div><h2>Te llamamos gratis</h2><p>Déjanos tus datos y un asesor te llama. Si adjuntas la factura, te llamamos con el estudio hecho.</p></div>
      <!--FORM_CORTO-->
    </div>
  </div>
</section>
'''
    (OUT / f"energia-{k}.html").write_text(html, encoding="utf-8")
print("ok")
