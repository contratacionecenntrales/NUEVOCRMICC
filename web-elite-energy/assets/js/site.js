/* Elite Energy · funciones comunes de la web */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var qa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var fmt = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  var dec = function (n, d) { return n.toFixed(d === undefined ? 3 : d).replace('.', ','); };
  var CFG = window.EE_CONFIG || {};

  /* ---------- Menú móvil ---------- */
  var menu = $('menu'), burger = $('burger');
  if (menu && burger) {
    burger.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      burger.setAttribute('aria-expanded', open);
      burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    });
    qa('a', menu).forEach(function (a) {
      a.addEventListener('click', function () { menu.classList.remove('open'); burger.setAttribute('aria-expanded', false); });
    });
  }

  /* ---------- Banner de portada ---------- */
  var slides = qa('.slide'), tabsB = qa('.b-tabs button');
  if (slides.length && tabsB.length) {
    var show = function (i) {
      slides.forEach(function (s, k) { s.classList.toggle('on', k === i); });
      tabsB.forEach(function (d, k) { d.classList.toggle('on', k === i); d.setAttribute('aria-selected', k === i); });
    };
    tabsB.forEach(function (d, i) { d.addEventListener('click', function () { show(i); }); });
  }

  /* ---------- Tipos de tarifa ---------- */
  var plansBox = $('plans');
  if (plansBox) {
    var check = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
    var PLANS = {
      hogar: [
        { k: 'Precio fijo', n: 'Tarifa de precio fijo', d: 'Pagas lo mismo por cada kWh a cualquier hora durante todo el contrato.', fitT: 'Para ti si…', fit: 'prefieres estabilidad y no quieres sorpresas en la factura.', f: ['Comparamos ofertas de varias comercializadoras', 'Potencia ajustada a tu consumo real', 'Revisamos cada factura nueva'], star: true, i: 'luz' },
        { k: 'Por horas', n: 'Discriminación horaria', d: 'Más barata por la noche y los fines de semana.', fitT: 'Para ti si…', fit: 'consumes sobre todo de noche o cargas el coche eléctrico en casa.', f: ['Te decimos si te compensa con tus horarios', 'Ideal con punto de recarga', 'Sin cambiar de instalación'], i: 'luz' },
        { k: 'Autoconsumo', n: 'Tarifa con excedentes', d: 'Para quien tiene placas solares: la energía que no usas se descuenta de la factura.', fitT: 'Para ti si…', fit: 'tienes placas o vas a instalarlas con nosotros.', f: ['Compensación de excedentes', 'Batería virtual si la comercializadora la ofrece', 'Tramitamos el alta del autoconsumo'], i: 'solar' }
      ],
      empresa: [
        { k: 'Pymes · 3.0TD', n: 'Precio fijo para negocio', d: 'Precio estable para comercios, hostelería, oficinas y talleres.', fitT: 'Para tu negocio si…', fit: 'quieres presupuestar la energía sin sustos.', f: ['Gestor asignado', 'Ajuste de potencia por periodos', 'Varios suministros en un mismo estudio'], star: true, i: 'empresa' },
        { k: 'Industria · 6.1TD', n: 'Indexada con cobertura', d: 'Precio ligado al mercado con parte del consumo a precio cerrado.', fitT: 'Para tu empresa si…', fit: 'tienes grandes consumos y puedes aprovechar las horas baratas.', f: ['Estudio de curvas de carga', 'Coberturas a medida', 'Seguimiento mensual del precio'], i: 'empresa' },
        { k: 'Gas natural', n: 'Gas para empresa', d: 'Para hostelería, calderas centralizadas y procesos industriales.', fitT: 'Para tu negocio si…', fit: 'el gas pesa en tus costes y nunca has revisado el contrato.', f: ['Revisión del caudal contratado', 'Precio fijo o indexado', 'Una sola persona para luz y gas'], i: 'gas' }
      ]
    };
    var renderPlans = function (t) {
      plansBox.innerHTML = PLANS[t].map(function (p) {
        return '<article class="plan' + (p.star ? ' star' : '') + '">' + (p.star ? '<span class="badge">La más solicitada</span>' : '') +
          '<span class="kind">' + p.k + '</span><h3>' + p.n + '</h3><p class="desc">' + p.d + '</p>' +
          '<div class="fit"><b>' + p.fitT + '</b>' + p.fit + '</div>' +
          '<ul>' + p.f.map(function (x) { return '<li>' + check + '<span>' + x + '</span></li>'; }).join('') + '</ul>' +
          '<a href="contacto.html?interes=' + p.i + '" class="btn' + (p.star ? ' white' : ' out') + '">Comparar mi tarifa</a></article>';
      }).join('');
    };
    var setPlan = function (t) {
      qa('.switch button').forEach(function (x) { var on = x.dataset.plan === t; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); });
      renderPlans(t);
    };
    qa('.switch button').forEach(function (b) { b.addEventListener('click', function () { setPlan(b.dataset.plan); }); });
    setPlan(location.hash === '#empresas' ? 'empresa' : (plansBox.dataset.start || 'hogar'));
  }

  /* ---------- Pestañas del simulador ---------- */
  var setTab = function (t) {
    qa('.tabs button').forEach(function (b) { var on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    qa('.pane').forEach(function (p) { p.classList.toggle('on', p.id === 'pane-' + t); });
  };
  qa('.tabs button').forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.tab); }); });
  qa('[data-tab-link]').forEach(function (a) { a.addEventListener('click', function () { setTab(a.dataset.tabLink); }); });

  /* ---------- Simulador de factura (porcentajes orientativos) ---------- */
  var sim = $('sim');
  if (sim) {
    var S = { hogar: { min: 30, max: 400, step: 5, def: 85, base: .14, kwh: .168 }, pyme: { min: 100, max: 4000, step: 10, def: 450, base: .20, kwh: .152 }, empresa: { min: 1000, max: 40000, step: 100, def: 6000, base: .18, kwh: .131 } };
    var tAdj = { fija: .03, indexada: 0, nose: .02 }, pAdj = [0, .03, .06];
    var g = $('gasto'), prev = 'hogar';
    var calc = function () {
      var t = sim.tipo.value, c = S[t];
      if (t !== prev) { g.min = c.min; g.max = c.max; g.step = c.step; g.value = c.def; $('minL').textContent = fmt(c.min) + ' €'; $('maxL').textContent = fmt(c.max) + ' €'; prev = t; }
      var m = +g.value, pct = Math.min(c.base + tAdj[sim.tarifa.value] + pAdj[+sim.pot.value], .35), n = m * (1 - pct);
      $('gastoOut').textContent = fmt(m) + ' €'; $('vOld').textContent = fmt(m) + ' €'; $('vNew').textContent = fmt(n) + ' €';
      $('barNew').style.width = (100 * (1 - pct)) + '%';
      $('anual').textContent = fmt(Math.round((m - n) * 12 / 10) * 10) + ' €';
      $('pctTxt').textContent = 'Un ' + Math.round(pct * 100) + ' % menos en tu factura';
      $('mes').textContent = fmt(m - n) + ' €';
      $('kOld').textContent = dec(c.kwh); $('kNew').textContent = dec(c.kwh * (1 - pct * .75));
    };
    sim.addEventListener('input', calc); calc();
  }

  /* ---------- Simulador solar (valores orientativos para Asturias) ---------- */
  var sol = $('sol');
  if (sol) {
    var SOL = { hogar: { min: 40, max: 400, step: 5, def: 110, price: .17, day: .35, eur: 1250, maxk: 10 }, empresa: { min: 200, max: 10000, step: 50, def: 1500, price: .14, day: .65, eur: 900, maxk: 200 } };
    var sg = $('sgasto'), sprev = 'hogar';
    var scalc = function () {
      var t = sol.stipo.value, c = SOL[t];
      if (t !== sprev) { sg.min = c.min; sg.max = c.max; sg.step = c.step; sg.value = c.def; $('sMin').textContent = fmt(c.min) + ' €'; $('sMax').textContent = fmt(c.max) + ' €'; sprev = t; }
      var m = +sg.value, prod1 = +sol.zona.value, bat = sol.bat.value === '1';
      var kwhYear = m * 12 / c.price;
      var kwp = Math.max(2, Math.min(c.maxk, Math.round((kwhYear * .6 / prod1) * 2) / 2));
      var prod = kwp * prod1, share = Math.min(1, c.day + (bat ? .3 : 0));
      var self = Math.min(prod * (bat ? .9 : .7), kwhYear * share);
      var save = self * c.price + (prod - self) * .06;
      var cost = kwp * c.eur + (bat ? (t === 'hogar' ? 4000 : kwp * 300) : 0);
      $('sOut').textContent = fmt(m) + ' €';
      $('sAnual').textContent = fmt(Math.round(save / 10) * 10) + ' €';
      $('sPct').textContent = 'Un ' + Math.round(Math.min(save / (m * 12), .85) * 100) + ' % menos en tu factura de luz';
      $('sKwp').textContent = dec(kwp, 1) + ' kWp';
      $('sPan').textContent = Math.ceil(kwp * 1000 / 450) + ' × 450 W';
      $('sCost').textContent = fmt(Math.round(cost / 100) * 100) + ' €';
      $('sRet').textContent = dec(cost / save, 1) + ' años';
    };
    sol.addEventListener('input', scalc); scalc();
  }

  /* ---------- Factura anotada ---------- */
  qa('.tip[data-k]').forEach(function (t) {
    var l = document.querySelector('.bl[data-k="' + t.dataset.k + '"]');
    if (!l) return;
    t.addEventListener('mouseenter', function () { l.classList.add('hot'); });
    t.addEventListener('mouseleave', function () { l.classList.remove('hot'); });
  });

  /* ---------- Formularios ---------- */
  qa('input[type=file][data-label]').forEach(function (inp) {
    var lab = $(inp.dataset.label), base = lab ? lab.textContent : '';
    inp.addEventListener('change', function () {
      var f = inp.files[0];
      if (!lab) return;
      if (f && f.size > 8 * 1024 * 1024) { alert('El archivo supera 8 MB. Envía una foto más ligera o el PDF original.'); inp.value = ''; lab.textContent = base; return; }
      lab.textContent = f ? f.name : base;
    });
  });
  qa('input[name=ts]').forEach(function (i) { i.value = String(Date.now()); });
  var params = new URLSearchParams(location.search);
  var interes = params.get('interes');
  qa('select[name=interes]').forEach(function (s) {
    if (!interes) return;
    qa('option', s).forEach(function (o) { if (o.value === interes) s.value = interes; });
  });
  var formMsg = $('form-msg');
  if (formMsg && params.get('error')) {
    formMsg.className = 'alert err';
    formMsg.textContent = params.get('error') === 'archivo' ? 'No hemos podido adjuntar el archivo. Usa un PDF, JPG o PNG de menos de 8 MB.' : 'No hemos podido enviar el formulario. Revisa los datos o llámanos al 984 518 342.';
    formMsg.hidden = false;
  }

  /* Alta de colaboradores en dos pasos */
  var jform = $('jform');
  if (jform) {
    var paso = function (n) {
      if (n === 2) {
        var ok = qa('#s1 input[required]').every(function (i) { return i.reportValidity(); });
        if (!ok) return;
      }
      $('s1').classList.toggle('on', n === 1); $('s2').classList.toggle('on', n === 2);
      qa('.stepper i').forEach(function (i, k) { i.classList.toggle('on', k < n); });
      var first = (n === 1 ? $('s1') : $('s2')).querySelector('input,select');
      if (first) first.focus();
    };
    qa('[data-paso]', jform).forEach(function (b) { b.addEventListener('click', function () { paso(+b.dataset.paso); }); });
  }

  /* ---------- Consentimiento de cookies (RGPD / LSSI) ---------- */
  var KEY = 'ee_consent', banner = $('ck-banner'), modal = $('ck-modal');
  var read = function () {
    try {
      var c = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!c || !c.date) return null;
      if (Date.now() - new Date(c.date).getTime() > 365 * 864e5) return null; // se vuelve a pedir pasados 12 meses
      return c;
    } catch (e) { return null; }
  };
  var clearTracking = function () {
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (/^(_ga|_gid|_gat|_gcl)/.test(name)) {
        var host = location.hostname.replace(/^www\./, '');
        ['', '; domain=' + location.hostname, '; domain=.' + host].forEach(function (d) {
          document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + d;
        });
      }
    });
  };
  var gtagLoaded = false;
  var apply = function (c) {
    var wantA = c && c.analytics && CFG.ga4, wantAds = c && c.ads && CFG.adsId;
    if (!wantA && !wantAds) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    gtag('consent', gtagLoaded ? 'update' : 'default', {
      analytics_storage: c.analytics ? 'granted' : 'denied',
      ad_storage: c.ads ? 'granted' : 'denied',
      ad_user_data: c.ads ? 'granted' : 'denied',
      ad_personalization: c.ads ? 'granted' : 'denied'
    });
    if (!gtagLoaded) {
      var s = document.createElement('script');
      s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + (wantA ? CFG.ga4 : CFG.adsId);
      document.head.appendChild(s);
      gtag('js', new Date());
      gtagLoaded = true;
    }
    if (wantA) gtag('config', CFG.ga4);
    if (wantAds) gtag('config', CFG.adsId);
    if (document.body.dataset.conversion) {
      if (wantA) gtag('event', 'generate_lead', { form: document.body.dataset.conversion });
      if (wantAds && CFG.adsLeadLabel) gtag('event', 'conversion', { send_to: CFG.adsId + '/' + CFG.adsLeadLabel });
    }
  };
  var save = function (analytics, ads) {
    var c = { v: 1, date: new Date().toISOString(), analytics: !!analytics, ads: !!ads };
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
    if (!c.analytics || !c.ads) clearTracking();
    if (banner) banner.classList.remove('show');
    document.body.classList.remove('ck-open');
    if (modal) modal.classList.remove('show');
    apply(c);
  };
  var openModal = function () {
    var c = read() || { analytics: false, ads: false };
    if ($('ck-an')) $('ck-an').checked = !!c.analytics;
    if ($('ck-ads')) $('ck-ads').checked = !!c.ads;
    if (modal) { modal.classList.add('show'); var f = modal.querySelector('input,button'); if (f) f.focus(); }
  };
  qa('[data-ck]').forEach(function (b) {
    b.addEventListener('click', function () {
      var a = b.dataset.ck;
      if (a === 'accept') save(true, true);
      else if (a === 'reject') save(false, false);
      else if (a === 'save') save($('ck-an').checked, $('ck-ads').checked);
      else if (a === 'config' || a === 'open') openModal();
      else if (a === 'close' && modal) modal.classList.remove('show');
    });
  });
  if (modal) modal.addEventListener('keydown', function (e) { if (e.key === 'Escape') modal.classList.remove('show'); });
  var current = read();
  if (current) apply(current); else if (banner) { banner.classList.add('show'); document.body.classList.add('ck-open'); }

  /* Medición de clics en el teléfono (solo con consentimiento) */
  qa('a[href^="tel:"]').forEach(function (a) {
    a.addEventListener('click', function () {
      var c = read();
      if (!window.gtag || !c) return;
      if (c.analytics && CFG.ga4) gtag('event', 'click_telefono');
      if (c.ads && CFG.adsId && CFG.adsCallLabel) gtag('event', 'conversion', { send_to: CFG.adsId + '/' + CFG.adsCallLabel });
    });
  });

  qa('[data-year]').forEach(function (y) { y.textContent = new Date().getFullYear(); });
})();
