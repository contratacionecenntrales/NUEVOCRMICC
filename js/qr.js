/* =============================================================================
   ICC CRM · Código QR sin librerías externas (tomado del CRM de Labs).
   Para el enlace otpauth:// del doble factor. window.icc.qr.svg(texto, px).
   ============================================================================= */
(function () {
function qrMatriz(texto, mascaraForzada){
  var datos = Array.prototype.slice.call(new TextEncoder().encode(texto));
  var ECC = [0,10,16,26,18,24,16,18,22,22,26];      // códigos de corrección por bloque (nivel M)
  var BLQ = [0,1,1,1,2,2,4,4,4,5,5];                 // número de bloques (nivel M)
  function modulosDatos(v){
    var r = (16*v + 128)*v + 64;
    if(v >= 2){ var n = Math.floor(v/7) + 2; r -= (25*n - 10)*n - 55; if(v >= 7) r -= 36; }
    return r;
  }
  var ver = 0, capacidad = 0;
  for(var v = 1; v <= 10; v++){
    capacidad = Math.floor(modulosDatos(v)/8) - ECC[v]*BLQ[v];
    var bitsNecesarios = 4 + (v < 10 ? 8 : 16) + datos.length*8;
    if(bitsNecesarios <= capacidad*8){ ver = v; break; }
  }
  if(!ver) throw new Error('Texto demasiado largo para el código QR');

  /* Bits de datos: modo byte (0100), longitud, bytes, terminador y relleno. */
  var bits = [];
  function pon(val, n){ for(var i = n-1; i >= 0; i--) bits.push((val >>> i) & 1); }
  pon(4, 4); pon(datos.length, ver < 10 ? 8 : 16);
  datos.forEach(function(b){ pon(b, 8); });
  pon(0, Math.min(4, capacidad*8 - bits.length));
  pon(0, (8 - bits.length % 8) % 8);
  for(var relleno = 0xEC; bits.length < capacidad*8; relleno ^= 0xEC ^ 0x11) pon(relleno, 8);
  var cw = [];
  for(var i = 0; i < bits.length; i += 8){
    var b = 0; for(var j = 0; j < 8; j++) b = (b << 1) | bits[i+j]; cw.push(b);
  }

  /* Reed-Solomon sobre GF(256), polinomio 0x11D. */
  function mult(x, y){ var z = 0; for(var i = 7; i >= 0; i--){ z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; }
  function divisor(grado){
    var r = []; for(var i = 0; i < grado-1; i++) r.push(0); r.push(1);
    var raiz = 1;
    for(var i = 0; i < grado; i++){
      for(var j = 0; j < r.length; j++){ r[j] = mult(r[j], raiz); if(j+1 < r.length) r[j] ^= r[j+1]; }
      raiz = mult(raiz, 0x02);
    }
    return r;
  }
  function resto(d, div){
    var r = div.map(function(){ return 0; });
    d.forEach(function(b){
      var f = b ^ r.shift(); r.push(0);
      div.forEach(function(c, i){ r[i] ^= mult(c, f); });
    });
    return r;
  }

  /* Bloques, corrección e intercalado. */
  var nBlq = BLQ[ver], nEcc = ECC[ver], crudos = Math.floor(modulosDatos(ver)/8);
  var cortos = nBlq - crudos % nBlq, largoCorto = Math.floor(crudos / nBlq);
  var div = divisor(nEcc), bloques = [];
  for(var i = 0, k = 0; i < nBlq; i++){
    var dat = cw.slice(k, k + largoCorto - nEcc + (i < cortos ? 0 : 1));
    k += dat.length;
    var ec = resto(dat, div);
    if(i < cortos) dat.push(0);
    bloques.push(dat.concat(ec));
  }
  var final = [];
  for(var i = 0; i < bloques[0].length; i++){
    bloques.forEach(function(bl, j){
      if(i !== largoCorto - nEcc || j >= cortos) final.push(bl[i]);
    });
  }

  /* Dibujo de los patrones fijos. */
  var n = ver*4 + 17, m = [], fijo = [];
  for(var y = 0; y < n; y++){ m.push([]); fijo.push([]); for(var x = 0; x < n; x++){ m[y].push(false); fijo[y].push(false); } }
  function pinta(x, y, on){ m[y][x] = on; fijo[y][x] = true; }
  for(var i = 0; i < n; i++){ pinta(6, i, i % 2 === 0); pinta(i, 6, i % 2 === 0); }
  function buscador(cx, cy){
    for(var dy = -4; dy <= 4; dy++) for(var dx = -4; dx <= 4; dx++){
      var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = cx+dx, yy = cy+dy;
      if(xx >= 0 && xx < n && yy >= 0 && yy < n) pinta(xx, yy, d !== 2 && d !== 4);
    }
  }
  buscador(3, 3); buscador(n-4, 3); buscador(3, n-4);
  var al = [];
  if(ver > 1){
    var na = Math.floor(ver/7) + 2, paso = Math.ceil((ver*4 + 4) / (na*2 - 2)) * 2;
    al = [6];
    for(var p = ver*4 + 10; al.length < na; p -= paso) al.splice(1, 0, p);
  }
  al.forEach(function(ay, i){ al.forEach(function(ax, j){
    if((i === 0 && j === 0) || (i === 0 && j === al.length-1) || (i === al.length-1 && j === 0)) return;
    for(var dy = -2; dy <= 2; dy++) for(var dx = -2; dx <= 2; dx++)
      pinta(ax+dx, ay+dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }); });
  function formato(mask){
    var dat = (0 << 3) | mask, r = dat;               // nivel M = 00
    for(var i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    var bitsF = ((dat << 10) | r) ^ 0x5412;
    function bt(i){ return ((bitsF >>> i) & 1) !== 0; }
    for(var i = 0; i <= 5; i++) pinta(8, i, bt(i));
    pinta(8, 7, bt(6)); pinta(8, 8, bt(7)); pinta(7, 8, bt(8));
    for(var i = 9; i < 15; i++) pinta(14 - i, 8, bt(i));
    for(var i = 0; i < 8; i++) pinta(n - 1 - i, 8, bt(i));
    for(var i = 8; i < 15; i++) pinta(8, n - 15 + i, bt(i));
    pinta(8, n - 8, true);
  }
  formato(0);
  if(ver >= 7){
    var r = ver;
    for(var i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
    var bv = (ver << 12) | r;
    for(var i = 0; i < 18; i++){
      var on = ((bv >>> i) & 1) !== 0, a = n - 11 + i % 3, bb = Math.floor(i / 3);
      pinta(a, bb, on); pinta(bb, a, on);
    }
  }

  /* Datos en zigzag. */
  var bi = 0;
  for(var der = n - 1; der >= 1; der -= 2){
    if(der === 6) der = 5;
    for(var vv = 0; vv < n; vv++) for(var jj = 0; jj < 2; jj++){
      var x = der - jj, sube = ((der + 1) & 2) === 0, y = sube ? n - 1 - vv : vv;
      if(!fijo[y][x] && bi < final.length*8){ m[y][x] = ((final[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++; }
    }
  }

  /* Máscaras: se prueba cada una y se queda la de menor penalización. */
  function aplica(mask){
    for(var y = 0; y < n; y++) for(var x = 0; x < n; x++){
      if(fijo[y][x]) continue;
      var inv;
      switch(mask){
        case 0: inv = (x + y) % 2 === 0; break;
        case 1: inv = y % 2 === 0; break;
        case 2: inv = x % 3 === 0; break;
        case 3: inv = (x + y) % 3 === 0; break;
        case 4: inv = (Math.floor(x/3) + Math.floor(y/2)) % 2 === 0; break;
        case 5: inv = x*y % 2 + x*y % 3 === 0; break;
        case 6: inv = (x*y % 2 + x*y % 3) % 2 === 0; break;
        default: inv = ((x + y) % 2 + x*y % 3) % 2 === 0;
      }
      if(inv) m[y][x] = !m[y][x];
    }
  }
  function penaliza(){
    var p = 0, oscuros = 0;
    for(var y = 0; y < n; y++){
      var cf = 1, cc = 1;
      for(var x = 0; x < n; x++){
        if(m[y][x]) oscuros++;
        if(x > 0){
          if(m[y][x] === m[y][x-1]) cf++; else { if(cf >= 5) p += cf - 2; cf = 1; }
          if(m[x][y] === m[x-1][y]) cc++; else { if(cc >= 5) p += cc - 2; cc = 1; }
        }
        if(x > 0 && y > 0 && m[y][x] === m[y][x-1] && m[y][x] === m[y-1][x] && m[y][x] === m[y-1][x-1]) p += 3;
      }
      if(cf >= 5) p += cf - 2;
      if(cc >= 5) p += cc - 2;
    }
    p += Math.floor(Math.abs(oscuros*20 - n*n*10) / (n*n)) * 10;
    return p;
  }
  var mejor = mascaraForzada, minimo = Infinity;
  if(mejor === undefined){
    for(var k = 0; k < 8; k++){
      aplica(k); formato(k);
      var pp = penaliza();
      if(pp < minimo){ minimo = pp; mejor = k; }
      aplica(k);
    }
  }
  aplica(mejor); formato(mejor);
  return {version: ver, mascara: mejor, matriz: m};
}
function qrSvg(texto, px){
  var q = qrMatriz(texto), n = q.matriz.length, borde = 4, t = n + borde*2, d = '';
  q.matriz.forEach(function(fila, y){ fila.forEach(function(on, x){
    if(on) d += 'M' + (x + borde) + ' ' + (y + borde) + 'h1v1h-1z';
  }); });
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px + '" viewBox="0 0 ' + t + ' ' + t +
    '" shape-rendering="crispEdges" role="img" aria-label="Código QR"><rect width="' + t + '" height="' + t +
    '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
}
  window.icc = window.icc || {};
  window.icc.qr = { svg: qrSvg, matriz: qrMatriz };
})();
