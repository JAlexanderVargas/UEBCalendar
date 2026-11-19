  const SUPABASE_URL = 'https://zsgavixppceijbpevgoc.supabase.co'; 
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzZ2F2aXhwcGNlaWpicGV2Z29jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyNTU4NjEsImV4cCI6MjEwOTgzMTg2MX0.YKJAQVRwtm1qofYtQYku2BhO0V_2A5gbaAPniA8aIM8'; 

  let dbClient = null;
  let D = null;
  let DB_READY = false;
  let USUARIO_ACTUAL = null;
  let NOVEDADES = [];
  let inactividadTimer = null;

  try {
    if (!window.supabase) throw new Error("El SDK de Supabase no se cargó.");
    dbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    DB_READY = true;
  } catch (e) {
    console.error("Error inicializando Supabase:", e);
    document.getElementById('error-msg').textContent = "Error de conexión: " + e.message;
    document.getElementById('error-box').hidden = false;
    document.getElementById('loader').classList.add('hidden');
  }

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const MESES_C = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const DIAS_C = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const DIAS_L = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const diaSem = e => { const a = parse(e.inicio), f = finDe(e); return e.inicio === f ? DIAS_L[a.getDay()] : DIAS_C[a.getDay()] + ' – ' + DIAS_C[parse(f).getDay()]; };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const hoy = () => iso(new Date());
  const diffDias = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const sumaDias = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const finDe = e => e.fin || e.inicio;
  
  const fmtFecha = (s, conAnio = true) => { const d = parse(s); return `${d.getDate()} ${MESES_C[d.getMonth()]}` + (conAnio ? ' ' + d.getFullYear() : ''); };
  const fmtRango = e => { 
    const f = finDe(e); 
    let rango = parse(e.inicio).getFullYear() === parse(f).getFullYear() ? `${fmtFecha(e.inicio, false)} – ${fmtFecha(f)}` : `${fmtFecha(e.inicio)} – ${fmtFecha(f)}`; 
    if (e.inicio === f) rango = fmtFecha(e.inicio);
    if (e.horaInicio && e.horaFin) rango += ` (${e.horaInicio} - ${e.horaFin})`;
    else if (e.horaInicio) rango += ` (${e.horaInicio})`;
    return rango;
  };
  
  const periodoDe = s => { const d = parse(s); return `${d.getFullYear()}-${d.getMonth() < 6 ? 1 : 2}`; };
  const periodoAuto = (D, fecha) => { const p = D.periodos.find(p => p.inicio <= fecha && fecha <= p.fin); return p ? p.id : periodoDe(fecha); };
  const nombrePeriodo = id => { if(!id) return ''; const [a, s] = id.split('-'); return `${a} · Semestre ${s}`; };
  const periodoActivo = id => { const p = ((typeof D !== 'undefined' && D && D.periodos) || []).find(x => x.id === id); return !p || p.activo !== false; };
  const eventoVisiblePublico = e => (periodoActivo(e.periodo) || (!!e.periodo2 && periodoActivo(e.periodo2))) && catEvActiva(e) && entidadesActivas(e);
  const catEvActiva = e => esAct(D.categorias.find(x => x.id === e.categoria));
  const entidadesActivas = e => { const fs = e.facultad || [], as = e.area || []; if (fs.length && !fs.some(id => esAct(D.facultades.find(x => x.id === id)))) return false; if (as.length && !as.some(id => esAct(D.areas.find(x => x.id === id)))) return false; return true; };
  const catDe = (D, id) => D.categorias.find(c => c.id === id) || { id, nombre: id, color: '#6b7280' };
  const slug = s => norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'x';
  const nuevoId = (s, lista) => { const b = slug(s); let i = b, n = 2; while (lista.some(x => x.id === i)) i = b + '_' + n++; return i; };
  const opt = (v, t, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(t)}</option>`;
  const marcaPrueba = () => (USUARIO_ACTUAL && USUARIO_ACTUAL.tipo_usuario === 'prueba') ? { es_prueba: true, prueba_de: String(USUARIO_ACTUAL.id) } : {};
  async function limpiarPrueba(ids, borrarUsuarios) { for (const t of ['eventos', 'novedades', 'tickets']) { try { await enLotes(ids, c => dbClient.from(t).delete().in('prueba_de', c)); } catch (_) {} } if (borrarUsuarios) await enLotes(ids, c => dbClient.from('usuarios_admin').delete().in('id', c)); }
  async function autoLimpiezaPrueba() { if (window._apr) return; window._apr = true; try { const r = await dbClient.from('usuarios_admin').select('id,vence,tipo_usuario').eq('tipo_usuario', 'prueba'); const v = (r.data || []).filter(u => u.vence && String(u.vence).slice(0, 10) < hoy()).map(u => String(u.id)); if (v.length) await limpiarPrueba(v, true); } catch (_) {} }
  const barrasG = (arr, g) => { const mx = Math.max(1, ...arr.map(x => x[1])); return arr.map(x => `<div style="margin:.5rem 0;"><div style="display:flex;justify-content:space-between;font-size:.88rem;gap:.5rem;"><span>${x[0]}</span><b>${x[1]}</b></div><div class="barra-g"><i style="width:${x[1] / mx * 100}%;${g ? 'background:' + g : ''}"></i></div></div>`).join('') || '<p style="color:var(--suave)">Sin datos.</p>'; };
  const donaG = items => { const tot = items.reduce((a, x) => a + x.n, 0), tt = tot || 1; let ac = 0; const cono = items.filter(x => x.n).map(x => { const i = ac / tt * 100; ac += x.n; return `${x.c} ${i}% ${ac / tt * 100}%`; }).join(',') || '#e5ece8 0 100%'; return `<div style="display:flex;gap:1.2rem;align-items:center;flex-wrap:wrap;"><div class="dona" style="background:conic-gradient(${cono})"><span>${tot}</span></div><div style="flex:1;min-width:150px;font-size:.88rem;">${items.map(x => `<div style="display:flex;gap:.4rem;align-items:center;margin:.2rem 0;"><i style="width:11px;height:11px;border-radius:50%;background:${x.c}"></i>${x.l} <b style="margin-left:auto">${x.n}</b></div>`).join('')}</div></div>`; };
  const cuenta = (arr, f) => { const m = {}; arr.forEach(x => { const k = f(x); m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  async function enLotes(ids, fn, n = 40) { for (let i = 0; i < ids.length; i += n) { const r = await fn(ids.slice(i, i + n)); if (r && r.error) return r; } return { error: null }; }
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) { var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); });

  /* ========== FRASES ACADÉMICAS PREDETERMINADAS ========== */
  const FRASES_ACADEMICAS = [
    'Inicio de clases',
    'Finalización de clases',
    'Inicio de prematrícula',
    'Cierre de prematrícula',
    'Matrícula ordinaria',
    'Matrícula extraordinaria',
    'Cambios de grupo',
    'Adición y cancelación de asignaturas',
    'Cancelación de semestre',
    'Inscripción de asignaturas',
    'Entrega de notas primer corte',
    'Entrega de notas segundo corte',
    'Entrega de notas finales',
    'Exámenes finales',
    'Habilitaciones y supletorios',
    'Solicitud de grados',
    'Ceremonia de grados solemnes',
    'Grados por ventanilla (no ceremoniales)',
    'Inducción a estudiantes nuevos',
    'Semana de receso académico'
  ];

  /* ========== GENERADOR INTELIGENTE DE TÍTULO CON NIVEL (PREGRADO / POSGRADO) ========== */
  function obtenerSufijoNivel(e) {
    if (!D || !e || e.esFestivo) return '';
    const progs = e.programa || [];
    const facs = e.facultad || [];
    const cat = catDe(D, e.categoria);
    const catNom = norm(cat ? cat.nombre : '');
    const niveles = new Set();

    // 0. Nivel marcado explícitamente (check Pregrado / Posgrado) tiene prioridad
    if (Array.isArray(e.nivel) && e.nivel.length) {
      e.nivel.forEach(n => niveles.add(n === 'posgrado' ? 'posgrado' : 'pregrado'));
      return niveles.has('pregrado') && niveles.has('posgrado') ? 'pregrado y posgrado' : (niveles.has('posgrado') ? 'posgrado' : 'pregrado');
    }

    // 1. Revisar programas explícitamente seleccionados
    if (progs.length) {
      progs.forEach(pid => {
        for (const f of D.facultades) {
          const p = f.programas.find(x => String(x.id) === String(pid));
          if (p) niveles.add(p.nivel === 'posgrado' ? 'posgrado' : 'pregrado');
        }
      });
    } else if (facs.length) {
      // 2. Si seleccionó facultades sin programas específicos, revisar los niveles que ofrece esa facultad
      facs.forEach(fid => {
        const f = D.facultades.find(x => String(x.id) === String(fid));
        if (f && f.programas && f.programas.length) {
          f.programas.forEach(p => niveles.add(p.nivel === 'posgrado' ? 'posgrado' : 'pregrado'));
        }
      });
    }

    // 3. Revisar si la categoría ya indica pregrado o posgrado
    if (!niveles.size) {
      if (catNom.includes('pregrado') && catNom.includes('posgrado')) {
        niveles.add('pregrado'); niveles.add('posgrado');
      } else if (catNom.includes('pregrado')) {
        niveles.add('pregrado');
      } else if (catNom.includes('posgrado')) {
        niveles.add('posgrado');
      }
    }

    if (niveles.has('pregrado') && niveles.has('posgrado')) return 'pregrado y posgrado';
    if (niveles.has('pregrado')) return 'pregrado';
    if (niveles.has('posgrado')) return 'posgrado';
    return '';
  }

  function tituloInteligente(e) {
    const base = String((e && (e.titulo || e.nombre)) || '').trim();
    if (!base || (e && e.esFestivo)) return base;
    const sufijo = obtenerSufijoNivel(e);
    if (!sufijo) return base;

    const baseNorm = norm(base);
    // Si el usuario ya escribió "pregrado" o "posgrado" en el título, respetarlo sin duplicar
    if (baseNorm.includes('pregrado') || baseNorm.includes('posgrado')) return base;

    // Construir enlace gramatical natural según la frase
    const terminaConDe = /\b(de|del|para|en)\s*$/i.test(base);
    if (terminaConDe) return `${base} ${sufijo}`;
    return `${base} · ${sufijo.charAt(0).toUpperCase() + sufijo.slice(1)}`;
  }

  function generarTitas() {
    const cont = document.getElementById('tita-container');
    const numTitas = 15;
    for (let i = 0; i < numTitas; i++) {
      const img = document.createElement('img');
      img.src = 'cara_tita.png';
      img.className = 'tita-img';
      const size = Math.floor(Math.random() * 40) + 60;
      img.style.width = size + 'px';
      img.style.left = Math.random() * 90 + 'vw';
      img.style.top = Math.random() * 90 + 'vh';
      img.style.animationDelay = (Math.random() * 2) + 's';
      cont.appendChild(img);
      animarTita(img);
    }
  }
  function animarTita(el) {
    let x = parseFloat(el.style.left) * window.innerWidth / 100;
    let y = parseFloat(el.style.top) * window.innerHeight / 100;
    let vx = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 1.5 + 1);
    let vy = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 1.5 + 1);
    function mover() {
      if (document.body.classList.contains('en-admin')) { requestAnimationFrame(mover); return; }
      x += vx; y += vy;
      const w = window.innerWidth, h = window.innerHeight;
      const rect = el.getBoundingClientRect();
      if (x <= 0 || x + rect.width >= w) vx *= -1;
      if (y <= 0 || y + rect.height >= h) vy *= -1;
      x = Math.max(0, Math.min(x, w - rect.width));
      y = Math.max(0, Math.min(y, h - rect.height));
      el.style.left = x + 'px'; el.style.top = y + 'px';
      requestAnimationFrame(mover);
    }
    requestAnimationFrame(mover);
  }
  generarTitas();

  const FLATICONS = {
    calendario: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    documento: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    libro: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    birrete: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
    trofeo: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
    personas: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    estrella: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    chart: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>',
    pin: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
    email: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
    basura: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
    editar: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    check: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    guardar: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
    salir: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    llave: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
    link: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    reloj: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    ciencias: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 2v7.31"/><path d="M14 9.3V2"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><path d="M5.58 16.5h12.85"/></svg>',
    enfermeria: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></svg>',
    economia: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    derecho: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18"/><path d="M5 6h14"/><path d="M5 18h14"/><path d="M5 6l-3 6h6z"/><path d="M19 6l-3 6h6z"/><path d="M5 18l-3-6h6z"/><path d="M19 18l-3-6h6z"/></svg>',
    creacion: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>',
    educacion: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
    ingenieria: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    medicina: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20"/><path d="M2 12h20"/><path d="M7 7l10 10"/><path d="M7 17L17 7"/></svg>',
    odontologia: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C8.5 2 6 4.5 6 7c0 2.5 1.5 4 2 6s1 7 4 9c3-2 3.5-7 4-9s2-3.5 2-6c0-2.5-2.5-5-6-5z"/></svg>',
    psicologia: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>',
    bioetica: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a5 5 0 0 0-5 5v2a5 5 0 0 0 5 5 5 5 0 0 0 5-5V7a5 5 0 0 0-5-5z"/><path d="M12 14v8"/><path d="M8 18h8"/></svg>',
    humanidades: '<svg class="flaticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'
  };

  const ICON_COLOR = { calendario:'#007A78', documento:'#2563EB', libro:'#7C3AED', birrete:'#F59E0B', trofeo:'#EAB308', personas:'#0EA5E9', estrella:'#F59E0B', chart:'#10B981', pin:'#EF4444', email:'#6366F1', basura:'#EF4444', editar:'#F97316', check:'#16A34A', guardar:'#0284C7', salir:'#64748B', llave:'#CA8A04', link:'#2563EB', reloj:'#7C3AED', ciencias:'#14B8A6', enfermeria:'#EC4899', economia:'#16A34A', derecho:'#92400E', creacion:'#D946EF', educacion:'#F59E0B', ingenieria:'#475569', medicina:'#DC2626', odontologia:'#06B6D4', psicologia:'#A855F7', bioetica:'#65A30D', humanidades:'#B45309' };
  Object.keys(FLATICONS).forEach(k => { const c = ICON_COLOR[k] || '#007A78'; FLATICONS[k] = FLATICONS[k].replace('fill="none" stroke="currentColor" stroke-width="2"', `fill="${c}" fill-opacity="0.2" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`); });

  const MAPA_ICONOS = { 'ciencias': 'ciencias', 'enfermeria': 'enfermeria', 'economicas': 'economia', 'administrativas': 'economia', 'juridicas': 'derecho', 'politicas': 'derecho', 'creacion': 'creacion', 'comunicacion': 'creacion', 'educacion': 'educacion', 'ingenieria': 'ingenieria', 'medicina': 'medicina', 'odontologia': 'odontologia', 'psicologia': 'psicologia', 'bioetica': 'bioetica', 'humanidades': 'humanidades' };
  const getIconoFac = nombre => { const n = norm(nombre); for (const key in MAPA_ICONOS) { if (n.includes(key)) return FLATICONS[MAPA_ICONOS[key]]; } return FLATICONS.birrete; };

  const EMOJI_FAC = [['medicina','🩺'],['odontolog','🦷'],['enfermer','💉'],['psicolog','🧠'],['ingenier','⚙️'],['juridic','⚖️'],['derecho','⚖️'],['politic','🏛️'],['economic','📈'],['administrativ','📊'],['creaci','🎨'],['comunicaci','🎬'],['bioetic','🧬'],['human','📚'],['educaci','🎓'],['salud','🏥'],['ciencias','🔬']];
  const EMOJI_POOL = ['🧪','🌱','🔭','📐','🧭','🎭','🌍','💡','🏫','🧩','🎯','🛠️'];
  const EMOJI_AREA = [['tesorer','💰'],['financ','💰'],['contab','🧾'],['cartera','💳'],['admision','📝'],['matricul','📝'],['registro','🗂️'],['bienestar','💛'],['biblioteca','📖'],['talento','🤝'],['humano','🤝'],['sistema','💻'],['tecnolog','💻'],['egresad','🎖️'],['investig','🔬'],['internacional','🌎'],['comunicac','📣'],['mercadeo','📣'],['jurid','⚖️'],['calidad','✅'],['planeaci','🧭'],['academ','🎓'],['admin','🏢']];
  const buscarEmoji = (lista, nombre, def) => { const n = norm(nombre); const m = lista.find(x => n.includes(x[0])); return m ? m[1] : def; };
  const emojiFac = f => (f && f.emoji) || buscarEmoji(EMOJI_FAC, f && f.nombre, '🏛️');
  const emojiArea = a => (a && a.emoji) || buscarEmoji(EMOJI_AREA, a && a.nombre, '🏢');
  const EMOJI_PUB = { 'Comunidad universitaria': '🏫', 'Estudiantes': '🎓', 'Administrativos': '🗂️', 'Docentes': '👩‍🏫', 'Egresados': '🎖️', 'Facultades': '🏛️', 'Programas': '📚', 'Áreas administrativas': '🏢' };
  const emojiPub = p => EMOJI_PUB[p] || '👥';
  const em = x => `<span class="emoji">${x}</span>`;

  // Lista fija de roles/públicos para el filtro "Dirigido a"
  const PUBLICOS_ROLES = ['Comunidad universitaria', 'Estudiantes', 'Administrativos', 'Docentes', 'Egresados', 'Facultades', 'Programas', 'Áreas administrativas'];
  const PUB_BASE = [...PUBLICOS_ROLES], MOD_BASE = ['presencial', 'virtual', 'híbrida'];
  let OPCS = [];
  const opcionesLista = (lista, base) => { const rows = OPCS.filter(o => o.lista === lista); if (!rows.length || lista === 'tipo_novedad') return [...base, ...rows.filter(o => o.activo !== false).map(o => o.valor).filter(v => !base.includes(v))]; return rows.filter(o => o.activo !== false).map(o => o.valor); };
  const chipsLista = (l, base) => { const rows = OPCS.filter(o => o.lista === l); if (l === 'tipo_novedad' || !rows.length) return base.map(v => `<span class="chip-cfg bloq">${esc(v)}</span>`).join('') + rows.map(o => `<span class="chip-cfg">${esc(o.valor)} <button data-a="delOpc" data-i="${o.id}" title="Eliminar">×</button></span>`).join(''); return rows.map(o => `<span class="chip-cfg ${o.activo === false ? 'off' : ''}">${esc(o.valor)}<button data-a="renOpc" data-i="${o.id}" title="Renombrar">✎</button><button data-a="togOpc" data-i="${o.id}" title="${o.activo === false ? 'Habilitar' : 'Suspender'}">${o.activo === false ? '▶' : '⏸'}</button><button data-a="delOpc" data-i="${o.id}" title="Eliminar">×</button></span>`).join(''); };
  function aplicarOpciones() { const l = opcionesLista('publico', PUB_BASE); PUBLICOS_ROLES.length = 0; PUBLICOS_ROLES.push(...l); }
  const esAct = x => !x || x.activo !== false;

  /* ========== GESTIÓN DE EXTENSIONES DE FACULTADES (NUBE + RESPALDO LOCAL) ========== */
  const EXT_LS_KEY = 'ubosque_fac_extensiones_v1';
  function leerExtensionesLocal() {
    try { return JSON.parse(localStorage.getItem(EXT_LS_KEY) || '{}'); } catch (_) { return {}; }
  }
  function guardarExtensionesLocal(mapa) {
    try { localStorage.setItem(EXT_LS_KEY, JSON.stringify(mapa || {})); } catch (_) {}
  }

  /* ========== LÓGICA DE MULTI-PERMISOS ========== */
  const ROLES = { admin: '👑 Administrador', creador: 'Creador', editor: 'Editor', docente: 'Docente', administrativo: 'Administrativo' };
  const PERM_TXT = { crear: 'Crear', editar: 'Editar', eliminar: 'Eliminar' };
  
  const ALIAS_ADMIN = ['admin', 'administrador', 'superadmin', 'superadministrador', 'super admin', 'super administrador', 'super_admin', 'root'];
  const tieneRol = (u, r) => { const rs = String((u && u.rol) || '').split(',').map(x => x.trim().toLowerCase()); return r === 'admin' ? rs.some(x => ALIAS_ADMIN.includes(x)) : rs.includes(r); };
  
  const puede = a => {
    if (!USUARIO_ACTUAL) return false;
    if (tieneRol(USUARIO_ACTUAL, 'admin')) return true;
    if ((USUARIO_ACTUAL.permisos || []).includes(a)) return true;
    if (a === 'crear' && tieneRol(USUARIO_ACTUAL, 'creador')) return true;
    if (a === 'editar' && tieneRol(USUARIO_ACTUAL, 'editor')) return true;
    return false;
  };
  
  const esDocenteOAdmin = () => USUARIO_ACTUAL && (tieneRol(USUARIO_ACTUAL, 'docente') || tieneRol(USUARIO_ACTUAL, 'administrativo'));
  const esAdminAct = () => USUARIO_ACTUAL && tieneRol(USUARIO_ACTUAL, 'admin');
  const tienePermisoCalendario = () => USUARIO_ACTUAL && (puede('crear') || puede('editar') || puede('eliminar'));
  
  const sinPermiso = () => toast('Tu perfil no tiene permiso para esta acción', true);
  const sinArea = () => toast('Solo puedes gestionar eventos de tus facultades o áreas asignadas', true);
  
  const misAreas = () => (USUARIO_ACTUAL && USUARIO_ACTUAL.areas) || [];
  const verFac = f => esAdminAct() || misAreas().includes('f:' + f.id) || f.programas.some(p => misAreas().includes('p:' + p.id));
  const verProg = (f, p) => esAdminAct() || misAreas().includes('f:' + f.id) || misAreas().includes('p:' + p.id);
  const verArea = a => esAdminAct() || misAreas().includes('a:' + a.id);
  
  const puedeEnEvento = e => {
    if (esAdminAct()) return true;
    if (!e || !e.facultad) return true;
    if (!tienePermisoCalendario()) return false;
    
    const M = misAreas(), facs = e.facultad || [], progs = e.programa || [], areas = e.area || [];
    if (!facs.length && !areas.length && !progs.length) return true;
    
    const facDe = pid => D.facultades.find(f => f.programas.some(p => p.id === pid));
    const progsDe = fid => progs.filter(pid => { const f = facDe(pid); return f && f.id === fid; });
    
    const facOk = fid => M.includes('f:' + fid) || (progsDe(fid).length > 0 && progsDe(fid).every(pid => M.includes('p:' + pid)));
    const progOk = pid => M.includes('p:' + pid) || (facDe(pid) && M.includes('f:' + facDe(pid).id));
    const areaOk = aid => M.includes('a:' + aid);

    return facs.every(facOk) && progs.every(progOk) && areas.every(areaOk);
  };

  const porNombre = (a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
  async function leerNube() {
    if (!dbClient) return null;
    try {
      const lim = q => Promise.race([Promise.resolve(q), new Promise((_, rej) => setTimeout(() => rej(new Error('Tiempo agotado')), 12000))]);
      // Supabase devuelve máximo 1000 filas por consulta: se piden por páginas hasta traer todos los eventos
      const traerEventos = async () => {
        let todos = [], desde = 0;
        for (let g = 0; g < 40; g++) {
          const r = await lim(dbClient.from('eventos').select(`*, evento_facultades(facultad_id), evento_programas(programa_id), evento_areas(area_id), evento_publicos(publico)`).order('fecha_inicio', { ascending: true }).order('id', { ascending: true }).range(desde, desde + 999));
          if (r.error || !r.data) return todos.length ? { data: todos } : { data: null, error: r.error };
          todos = todos.concat(r.data);
          if (r.data.length < 1000) break;
          desde += 1000;
        }
        return { data: todos };
      };
      const [{ data: cats }, { data: facs }, { data: areas }, { data: pers }, { data: evs }, { data: novs }] = await Promise.all([
        lim(dbClient.from('categorias').select('*')),
        lim(dbClient.from('facultades').select('*, programas(*)')),
        lim(dbClient.from('areas').select('*')),
        lim(dbClient.from('periodos').select('*')),
        traerEventos(),
        lim(dbClient.from('novedades').select('*').order('fecha', { ascending: false }).limit(200))
      ]);
      NOVEDADES = novs || [];
      try { const ro = await dbClient.from('listas_opciones').select('*').order('orden', { ascending: true }); OPCS = ro.error ? [] : (ro.data || []); if (!ro.error) { for (const [l, b] of [['publico', PUB_BASE], ['modalidad', MOD_BASE]]) { if (!OPCS.some(o => o.lista === l)) await dbClient.from('listas_opciones').insert(b.map((v, i) => ({ lista: l, valor: v, activo: true, orden: i }))); } const r2 = await dbClient.from('listas_opciones').select('*').order('orden', { ascending: true }); if (!r2.error) OPCS = r2.data || OPCS; } aplicarOpciones(); } catch (_) {}
      const extLocal = leerExtensionesLocal();

      return {
        institucion: 'Universidad El Bosque',
        actualizado: new Date().toISOString(),
        categorias: cats || [],
        facultades: facs ? facs.map(f => ({
          ...f,
          id: f.id,
          extensiones: Array.isArray(f.extensiones) && f.extensiones.length ? f.extensiones : (extLocal[String(f.id)] || extLocal[norm(f.nombre)] || []),
          programas: [...(f.programas || [])].sort(porNombre)
        })).sort(porNombre) : [],
        areas: [...(areas || [])].sort(porNombre),
        periodos: pers || [],
        eventos: evs ? evs.map(e => ({
          id: e.id, titulo: e.titulo, descripcion: e.descripcion || '', categoria: e.categoria_id, subcategoria: e.subcategoria || '',
          periodo: e.periodo_id, periodo2: e.periodo2_id, inicio: e.fecha_inicio, fin: e.fecha_fin || e.fecha_inicio,
          horaInicio: e.hora_inicio || '', horaFin: e.hora_fin || '',
          lugar: e.lugar || '', lugarEsp: e.lugar_especifico || '', piso: e.piso || '', enlace: e.enlace || '',
          estado: e.estado || 'publicado',
          facultad: e.evento_facultades ? e.evento_facultades.map(x => x.facultad_id) : [],
          programa: e.evento_programas ? e.evento_programas.map(x => x.programa_id) : [],
          area: e.evento_areas ? e.evento_areas.map(x => x.area_id) : [],
          publico: e.evento_publicos ? e.evento_publicos.map(x => x.publico) : []
        })) : []
      };
    } catch (e) { console.error("Error al leer de Supabase:", e); return null; }
  }

  async function registrarLog(accion, detalle) {
    if (!dbClient || !USUARIO_ACTUAL) return;
    try {
      const { error } = await dbClient.from('logs').insert([{ usuario_nombre: USUARIO_ACTUAL.nombre, accion, detalle: detalle || '' }]);
      if (error) console.error('Error guardando log:', error.message);
    } catch (e) { console.error('Error guardando log:', e); }
  }

  async function verificarPin(pin) {
    if (!dbClient) return null;
    const { data, error } = await dbClient.from('usuarios_admin').select('*').eq('pin', pin);
    if (error) { toast("Error de conexión al verificar PIN", true); return null; }
    return (data && data.length > 0) ? data[0] : null;
  }
  async function crearUsuario(payload) {
    if (!dbClient) return null;
    const { data, error } = await dbClient.from('usuarios_admin').insert([payload]).select().single();
    if (error) throw error;
    return data;
  }
  async function verificarSiHayUsuarios() {
    if (!dbClient) return false;
    const { count, error } = await dbClient.from('usuarios_admin').select('*', { count: 'exact', head: true });
    if (error) return false;
    return count > 0;
  }
  function toast(m, err) { const t = $('#toast'); t.innerHTML = m; t.className = 'on' + (err ? ' err' : ''); clearTimeout(t._x); t._x = setTimeout(() => t.className = '', 3400); }

  const S = { anio: 0, sem: '', cat: '', grupo: '', prog: '', inst: true, festivos: true, dir: '', q: '', ref: new Date(), publico: [] };
  let listaFiltradaCompleta = [];

  function getColores(D, e) {
    const facs = e.facultad || [];
    const cat = catDe(D, e.categoria);
    let facColor = cat.color, icono = '';
    if (facs.length === 1) {
      const f = D.facultades.find(x => x.id === facs[0]);
      if (f) { facColor = f.color || cat.color; icono = em(emojiFac(f)); }
    }
    if (!icono && !facs.length && (e.area || []).length === 1) { const ar = D.areas.find(x => x.id === e.area[0]); if (ar) icono = em(emojiArea(ar)); }
    return { facColor, catColor: cat.color, icono };
  }

  function ambito(D, e) {
    const facs = e.facultad || [], areas = e.area || [], progs = e.programa || [];
    let nombres = [];
    facs.forEach(fid => { const f = D.facultades.find(x => x.id === fid); if (f) nombres.push(f.nombre); });
    if (progs.length) progs.forEach(pid => { const f = D.facultades.find(x => x.programas.some(p => p.id === pid)); const p = f && f.programas.find(x => x.id === pid); if (p) nombres.push(p.nombre); });
    areas.forEach(aid => { const a = D.areas.find(x => x.id === aid); if (a) nombres.push(a.nombre); });
    if (!nombres.length) return 'Toda la institución';
    if (facs.length > 3) return `${facs.length} facultades`;
    return nombres.join(', ');
  }

  const esInstitucional = e => !(e.facultad || []).length && !(e.area || []).length;

  function calcularFestivos(anio) {
    const festivos = [];
    const add = (m, d, n) => festivos.push({ fecha: `${anio}-${pad(m)}-${pad(d)}`, nombre: n, esFestivo: true });
    add(1, 1, 'Año Nuevo'); add(5, 1, 'Día del Trabajo'); add(7, 20, 'Día de la Independencia');
    add(8, 7, 'Batalla de Boyacá'); add(12, 8, 'Inmaculada Concepción'); add(12, 25, 'Navidad');
    const emiliani = (m, d, n) => { let date = new Date(anio, m - 1, d); if (date.getDay() !== 1) date.setDate(date.getDate() + ((8 - date.getDay()) % 7)); add(date.getMonth() + 1, date.getDate(), n); };
    emiliani(1, 6, 'Reyes Magos'); emiliani(3, 19, 'San José'); emiliani(6, 29, 'San Pedro y San Pablo');
    emiliani(8, 15, 'Asunción de la Virgen'); emiliani(10, 12, 'Día de la Raza');
    emiliani(11, 1, 'Todos los Santos'); emiliani(11, 11, 'Independencia de Cartagena');
    const getPascua = (y) => { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1; return new Date(y, month - 1, day); };
    const pascua = getPascua(anio);
    const restarDias = (date, n) => { const d = new Date(date); d.setDate(d.getDate() - n); return d; };
    const jv = restarDias(pascua, 3); add(jv.getMonth() + 1, jv.getDate(), 'Jueves Santo');
    const vv = restarDias(pascua, 2); add(vv.getMonth() + 1, vv.getDate(), 'Viernes Santo');
    const addEmiliani = (dateObj, n) => { let date = new Date(dateObj); if (date.getDay() !== 1) date.setDate(date.getDate() + ((8 - date.getDay()) % 7)); add(date.getMonth() + 1, date.getDate(), n); };
    addEmiliani(new Date(pascua.getFullYear(), pascua.getMonth(), pascua.getDate() + 43), 'Ascensión del Señor');
    addEmiliani(new Date(pascua.getFullYear(), pascua.getMonth(), pascua.getDate() + 64), 'Corpus Christi');
    addEmiliani(new Date(pascua.getFullYear(), pascua.getMonth(), pascua.getDate() + 71), 'Sagrado Corazón');
    return festivos;
  }

  const FEST = {};
  function festivosAnio(y) { return FEST[y] || (FEST[y] = calcularFestivos(y).map(f => ({ ...f, id: 'festivo-' + f.fecha, titulo: f.nombre, inicio: f.fecha, fin: f.fecha }))); }
  const festivosDia = s => festivosAnio(+s.slice(0, 4)).filter(f => f.fecha === s);
  const amb = e => e.esFestivo ? 'Festivo nacional' : ambito(D, e);
  let IO; function revelar() { if (IO) IO.disconnect(); if (!window.IntersectionObserver) return $$('.rev').forEach(x => x.classList.add('vis')); IO = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add('vis'); IO.unobserve(x.target); } }), { threshold: .05 }); $$('.rev').forEach((el, i) => { el.style.transitionDelay = (i % 8) * 40 + 'ms'; IO.observe(el); }); }
  function irMes() { const el = $('#m-' + S.ref.getFullYear() + '-' + S.ref.getMonth()), L = $('#vistaLista'); if (el && L) L.scrollTo({ top: el.offsetTop - 4, behavior: 'smooth' }); }
  const ORD = [['general','calendario'],['matricul','documento'],['pregrado','libro'],['posgrado','birrete'],['ceremon','trofeo'],['no ceremon','documento'],['talento','personas'],['otro','estrella']];

  function aniosDisponibles() { const set = new Set(D.periodos.filter(p => p.activo !== false).map(p => +p.id.split('-')[0])); D.eventos.filter(eventoVisiblePublico).forEach(e => { set.add(+e.periodo.split('-')[0]); if (e.periodo2) set.add(+e.periodo2.split('-')[0]); }); return [...set].sort(); }

  const GRP = {};
  function agruparRepetidos(L) {
    const mapa = new Map(), out = [];
    const fid = S.grupo && S.grupo.startsWith('f:') ? S.grupo.slice(2) : '';
    const kf = e => [norm(e.titulo), e.inicio, finDe(e), e.categoria, e.subcategoria || '', e.horaInicio, e.horaFin, e.lugar, e.lugarEsp, e.enlace, (e.area || []).join(','), (e.publico || []).slice().sort().join(',')].join('|');
    const gen = new Set(), esp = new Set(); L.forEach(e => ((e.facultad || []).length ? esp : gen).add(kf(e)));
    // Sin filtro de facultad: se muestra el general y se ocultan sus copias por facultad; con filtro: se muestra el de la facultad y se oculta el general
    L = L.filter(e => (e.facultad || []).length ? !(!fid && gen.has(kf(e))) : !(fid && esp.has(kf(e))));
    L.forEach(e => {
      if (!(e.facultad || []).length) { out.push(e); return; }
      const k = [norm(e.titulo), e.inicio, finDe(e), e.categoria, e.subcategoria || '', e.horaInicio, e.horaFin, e.lugar, e.lugarEsp, e.enlace, (e.area || []).join(','), (e.publico || []).slice().sort().join(',')].join('|');
      const g = mapa.get(k);
      if (!g) { const c = { ...e, facultad: fid && e.facultad.includes(fid) ? [fid] : [...e.facultad], programa: [...(e.programa || [])], _ids: [e.id] }; mapa.set(k, c); out.push(c); GRP[e.id] = c; }
      else { e.facultad.forEach(f => { if (!g.facultad.includes(f) && !fid) g.facultad.push(f); }); (e.programa || []).forEach(x => { if (!g.programa.includes(x)) g.programa.push(x); }); g._ids.push(e.id); }
    });
    return out;
  }
  function filtrar(opts) { return agruparRepetidos(filtrarBase(opts)); }

  function filtrarBase({ sinCat = false, sinPeriodo = false } = {}) {
    const q = norm(S.q);
    return D.eventos.filter(e => {
      if (e.estado === 'borrador') return false;
      if (!eventoVisiblePublico(e)) return false;
      const p1 = e.periodo && e.periodo.startsWith(S.anio + '-');
      const p2 = e.periodo2 ? e.periodo2.startsWith(S.anio + '-') : false;
      const fe = finDe(e) || e.inicio;
      const enAnio = e.inicio <= S.anio + '-12-31' && fe >= S.anio + '-01-01';
      if (!p1 && !p2 && !enAnio) return false;
      if (!sinPeriodo && S.sem) {
        const sm = String(S.sem);
        const desde = S.anio + (sm === '2' ? '-07-01' : '-01-01'), hasta = S.anio + (sm === '2' ? '-12-31' : '-06-30');
        const porFecha = e.inicio <= hasta && fe >= desde;
        const porEtiqueta = (e.periodo === S.anio + '-' + sm) || (e.periodo2 === S.anio + '-' + sm);
        if (!porFecha && !porEtiqueta) return false;
      }
      if (!sinCat && S.cat && e.categoria !== S.cat) return false;
      if (S.publico.length) {
        const pubs = (e.publico && e.publico.length) ? e.publico : ['Comunidad universitaria'];
        if (!pubs.some(p => S.publico.includes(p))) return false;
      }
      const facs = e.facultad || [], areas = e.area || [], progs = e.programa || [];
      if (S.grupo) { const [t, id] = S.grupo.split(':'); const coincide = t === 'f' ? facs.includes(id) && (!S.prog || !progs.length || progs.includes(S.prog)) : areas.includes(id); if (!coincide && !(S.inst && esInstitucional(e))) return false; }
      if (q && !norm(`${tituloInteligente(e)} ${e.titulo} ${e.descripcion} ${ambito(D, e)} ${catDe(D, e.categoria).nombre}`).includes(q)) return false;
      return true;
    }).sort((a, b) => a.inicio.localeCompare(b.inicio) || a.titulo.localeCompare(b.titulo));
  }
  
  function estadoDe(e) {
    if (e.esFestivo) return { t: 'Festivo', c: 'e-fin' };
    const h = hoy(), f = finDe(e);
    if (f < h) return { t: 'Finalizado', c: 'e-fin', pasado: true };
    if (e.inicio <= h) return { t: 'En curso', c: 'e-curso' };
    const d = diffDias(h, e.inicio);
    if (d <= 14) return { t: d === 1 ? 'Mañana' : `En ${d} días`, c: 'e-pronto' };
    return { t: '', c: '' };
  }
  
  function esInminente(e) {
    if (e.esFestivo) return false;
    const h = hoy(), f = finDe(e);
    if (f < h) return false;
    if (e.inicio <= h) return true;
    return diffDias(h, e.inicio) <= 3;
  }

  function pintarEncabezado() {
    $('#inst').textContent = D.institucion;
    document.title = 'Calendario Académico · ' + D.institucion;
    const h = new Date();
    $('#hoyTxt').textContent = `Hoy, ${DIAS_C[h.getDay()]} ${h.getDate()} de ${MESES[h.getMonth()].toLowerCase()} de ${h.getFullYear()}`;
    $('#heroTit').textContent = S.sem ? `${S.anio} · Semestre ${S.sem}` : `Año académico ${S.anio}`;
    $('#fAnio').innerHTML = aniosDisponibles().map(a => `<option ${a === S.anio ? 'selected' : ''}>${a}</option>`).join('');
    $$('#fSem button').forEach(b => b.classList.toggle('on', b.dataset.v === String(S.sem)));
    let g = '<option value="">Toda la institución</option><optgroup label="Facultades">' + D.facultades.filter(esAct).map(f => `<option value="f:${f.id}" ${S.grupo === 'f:' + f.id ? 'selected' : ''}>${emojiFac(f)} ${esc(f.nombre)}</option>`).join('') + '</optgroup><optgroup label="Áreas administrativas">' + D.areas.map(a => `<option value="a:${a.id}" ${S.grupo === 'a:' + a.id ? 'selected' : ''}>${emojiArea(a)} ${esc(a.nombre)}</option>`).join('') + '</optgroup>';
    $('#fGrupo').innerHTML = g;
    const f = S.grupo.startsWith('f:') ? D.facultades.find(x => x.id === S.grupo.slice(2)) : null;
    const fp = $('#fProg'); fp.hidden = !f;
    if (f) fp.innerHTML = '<option value="">Todos los programas</option>' + f.programas.map(p => `<option value="${p.id}" ${S.prog === p.id ? 'selected' : ''}>${esc(p.nombre)}${p.nivel === 'posgrado' ? ' (posgrado)' : ''}</option>`).join('');
    $('#fInst').checked = S.inst;
    $('#fInst').parentElement.style.display = S.grupo ? '' : 'none';

    const pubList = $('#fPubList');
    if (pubList) {
      const todosMarcado = S.publico.length === 0;
      pubList.innerHTML =
        `<label class="pub-todos"><input type="checkbox" id="fPubTodos" ${todosMarcado ? 'checked' : ''}> <b>👥 Todos los roles</b></label>` +
        PUBLICOS_ROLES.map(p => `<label><input type="checkbox" value="${esc(p)}" ${S.publico.includes(p) ? 'checked' : ''}> ${em(emojiPub(p))} ${esc(p)}</label>`).join('');
    }
    const wrap = $('#fPubWrap');
    if (wrap) wrap.classList.toggle('activo', S.publico.length > 0);
    const summ = $('#fPubSummary');
    if (summ) {
      if (S.publico.length === 0) summ.innerHTML = '👥 Dirigido a: Todos';
      else if (S.publico.length === 1) summ.innerHTML = '👥 ' + esc(S.publico[0]);
      else summ.innerHTML = `👥 Dirigido a: ${S.publico.length} roles`;
    }
  }
  
  function pintarProgreso() {
    const el = $('#heroProg'); if (!el) return;
    const h = hoy();
    const activos = D.periodos.filter(x => x.activo !== false);
    const act = activos.find(x => x.inicio <= h && h <= x.fin);
    let tarjeta = '';
    if (act) {
      const total = diffDias(act.inicio, act.fin) + 1, trans = diffDias(act.inicio, h) + 1;
      const pct = Math.max(0, Math.min(100, Math.round(trans / total * 100)));
      const sem = Math.ceil(trans / 7), semTot = Math.ceil(total / 7), faltan = diffDias(h, act.fin);
      tarjeta = `<div class="prog"><div class="prog-top"><b>${nombrePeriodo(act.id)}</b><span>Semana ${sem} de ${semTot}</span></div><div class="prog-bar"><i style="width:${pct}%"></i></div><div class="prog-foot">${pct}% del semestre · ${faltan === 0 ? 'termina hoy' : `faltan ${faltan} día${faltan === 1 ? '' : 's'} para terminar`}</div></div>`;
    } else {
      const sig = activos.filter(x => x.inicio > h).sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
      if (sig) { const d = diffDias(h, sig.inicio); tarjeta = `<div class="prog"><div class="prog-top"><b>${nombrePeriodo(sig.id)}</b><span>Próximo semestre</span></div><div class="prog-foot" style="margin-top:.4rem">Inicia en ${d} día${d === 1 ? '' : 's'}</div></div>`; }
    }
    const savedCat = S.cat; S.cat = '';
    const L = filtrar({ sinPeriodo: true }); S.cat = savedCat;
    const enCurso = L.filter(e => e.inicio <= h && h <= finDe(e)).length;
    const prox7 = L.filter(e => e.inicio > h && diffDias(h, e.inicio) <= 7).length;
    el.innerHTML = tarjeta + `<div class="hero-chips"><span><b>${enCurso}</b>en curso hoy</span><span><b>${prox7}</b>en los próximos 7 días</span><span><b>${L.length}</b>fechas publicadas</span></div>`;
  }

  function irHoy() { const h = new Date(); S.anio = h.getFullYear(); S.ref = h; S.q = ''; S.publico = []; const q = $('#q'); if (q) q.value = ''; pintarPublico(); irMes(); }

  function limpiarFiltros() {
    S.cat = ''; S.grupo = ''; S.prog = ''; S.q = ''; S.publico = []; S.inst = true; S.festivos = true;
    const q = $('#q'); if (q) q.value = '';
    pintarPublico();
  }

  function pintarProximos() {
    const h = hoy();
    const ya = +h.slice(0, 4);
    const savedCat = S.cat; S.cat = '';
    const propios = filtrar({ sinPeriodo: true }).filter(e => finDe(e) >= h);
    const fest = S.festivos ? [...festivosAnio(ya), ...festivosAnio(ya + 1)].filter(f => f.fecha >= h) : [];
    const lista = [...propios, ...fest].sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(0, 4);
    S.cat = savedCat;
    $('#proximos').innerHTML = lista.length ? lista.map(e => {
      const en = e.inicio <= h ? 0 : diffDias(h, e.inicio);
      const inminente = esInminente(e);
      const tit = e.esFestivo ? e.titulo : tituloInteligente(e);
      return `<div class="px ${inminente ? 'destacado' : ''}" data-id="${e.id}"><div class="px-dias" style="${e.esFestivo ? 'background:var(--rojo);color:white;' : ''}"><b>${en === 0 ? 'Hoy' : en}</b><span>${en === 0 ? 'en curso' : en === 1 ? 'día' : 'días'}</span></div><div><div class="px-t">${esc(tit)}</div><div class="px-m">${fmtRango(e)} · ${esc(amb(e))}</div></div></div>`;
    }).join('') : '<p style="opacity:0.8; font-size:0.9rem; padding:0.4rem 0; color:#fff;">No hay fechas próximas.</p>';
  }

  function pintarModulos() {
    const base = filtrar({ sinCat: true }); let i = 0;
    const rk = c => { const n = norm(c.nombre); if (n.includes('no ceremon')) return 5; const k = ORD.findIndex(o => o[0] !== 'no ceremon' && n.includes(o[0])); return k < 0 ? 6.5 : k; };
    const card = (id, col, ic, nom, n, cls) => `<button class="mod-card ${cls}" style="--c:${col};--i:${i++}" data-cat="${id}"><span class="ic">${ic}</span><span class="txt"><b>${esc(nom)}</b><span class="n">${n} ${n === 1 ? 'fecha' : 'fechas'}</span></span></button>`;
    $('#modulos').innerHTML = card('', 'var(--petroleo)', FLATICONS.calendario, 'Todo el calendario', base.length, 'todos ' + (S.cat === '' ? 'on' : '')) +
      D.categorias.filter(esAct).map(c => ({ c, r: rk(c) })).sort((a, b) => a.r - b.r).map(({ c, r }) => { const n = base.filter(e => e.categoria === c.id).length; return card(c.id, c.color, FLATICONS[Number.isInteger(r) ? ORD[r][1] : 'estrella'], c.nombre, n, (S.cat === c.id ? 'on ' : '') + (n ? '' : 'cero')); }).join('');
  }

  /* ========== COLUMNA IZQUIERDA DE FACULTADES Y MODAL DE EXTENSIONES ========== */
  function contarEventosFac(f) {
    return D.eventos.filter(e => e.estado !== 'borrador' && eventoVisiblePublico(e) && (e.facultad || []).map(String).includes(String(f.id)) && (String(e.inicio).slice(0, 4) === String(S.anio) || String(finDe(e)).slice(0, 4) === String(S.anio))).length;
  }

  function pintarFacultadesIzquierda() {
    const cont = $('#vistaFacultadesIzq');
    if (!cont) return;
    if (!D.facultades.length) {
      cont.innerHTML = '<p style="color:var(--suave); font-size:.82rem;">Sin facultades registradas.</p>';
      return;
    }
    cont.innerHTML = D.facultades.filter(esAct).map(f => {
      const exts = Array.isArray(f.extensiones) ? f.extensiones : [];
      const active = S.grupo === 'f:' + f.id;
      const nEv = contarEventosFac(f);
      const extLabel = `📅 ${nEv} ${nEv === 1 ? 'evento' : 'eventos'}`;
      return `<button type="button" class="fac-side-btn ${active ? 'active' : ''}" style="--fc:${f.color || 'var(--verde)'}" data-fac-info="${esc(String(f.id))}" title="Ver extensiones y datos de ${esc(f.nombre)}">
        <span class="f-ic">${em(emojiFac(f))}</span>
        <span class="f-info">
          <span class="f-nom">${esc(f.nombre)}</span>
          <span class="f-ext">${extLabel}</span>
        </span>
        <span class="f-badge">Ver</span>
      </button>`;
    }).join('');
  }

  function abrirInfoFacultad(facId) {
    const f = D.facultades.find(x => String(x.id) === String(facId));
    if (!f) return;
    const exts = Array.isArray(f.extensiones) ? f.extensiones : [];
    const progsPre = f.programas.filter(p => p.nivel !== 'posgrado');
    const progsPos = f.programas.filter(p => p.nivel === 'posgrado');

    const extsHtml = exts.length
      ? exts.map(it => `<div class="ext-item" style="--fc:${f.color || 'var(--verde)'}">
          <div class="ext-item-info">
            <b>${esc(it.dependencia || it.cargo || f.nombre)}</b>
            ${it.contacto ? `<span>👤 ${esc(it.contacto)}</span>` : ''}
            ${it.correo ? `<span>✉️ ${esc(it.correo)}</span>` : ''}
            ${it.ubicacion ? `<span>📍 ${esc(it.ubicacion)}</span>` : ''}
          </div>
          ${it.extension ? `<span class="ext-num-badge">📞 Ext. ${esc(it.extension)}</span>` : ''}
        </div>`).join('')
      : `<div style="padding:1rem; background:var(--fondo); border-radius:10px; color:var(--suave); font-size:.88rem; text-align:center;">
          Aún no se han cargado extensiones telefónicas para esta facultad desde el archivo Excel.
        </div>`;

    const mod = $('#fac-modal');
    mod.innerHTML = `<div class="fac-mod-card">
      <div class="fac-mod-head" style="--fc:${f.color || 'var(--verde)'}">
        <button type="button" class="fac-mod-close" data-cerrar-fac>×</button>
        <h3>${em(emojiFac(f))} ${esc(f.nombre)}</h3>
        <p>📅 ${contarEventosFac(f)} ${contarEventosFac(f) === 1 ? 'evento' : 'eventos'} en ${S.anio} · Información y extensiones</p>
      </div>
      <div class="fac-mod-body">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:.7rem; flex-wrap:wrap; gap:.5rem;">
          <h4 style="font-size:.82rem; text-transform:uppercase; letter-spacing:.05em; color:var(--suave);">📞 Extensiones y contacto</h4>
          <button type="button" class="btn sm pri" data-filtrar-fac="${esc(String(f.id))}">📅 Ver fechas de esta facultad</button>
        </div>
        ${extsHtml}
      </div>
    </div>`;
    mod.classList.add('on');
  }

  function cerrarModalFac() {
    const mod = $('#fac-modal');
    if (mod) { mod.classList.remove('on'); mod.innerHTML = ''; }
  }

  const NOV_COLOR = { cambio_salon: '#007A78', cancelacion: '#B3261E', modalidad: '#8A5A00', otro: '#5B6F6B' };
  const NOV_TAG = { cambio_salon: 'Cambio de salón', cancelacion: 'Cancelación', modalidad: 'Cambio de modalidad', otro: 'Aviso' };
  window.abrirNovedad = function(id) {
    const n = NOVEDADES.find(x => String(x.id) === String(id)); if (!n) return;
    const c = NOV_COLOR[n.tipo] || NOV_COLOR.otro, d = parse(n.fecha);
    const facs = (n.facultad_ids || []).map(x => D.facultades.find(f => String(f.id) === String(x))).filter(Boolean);
    const progs = []; (n.programa_ids || []).forEach(x => { for (const f of D.facultades) { const p = f.programas.find(y => String(y.id) === String(x)); if (p) progs.push(p.nombre); } });
    const hora = n.hora_inicio ? `${String(n.hora_inicio).slice(0, 5)}${n.hora_fin ? ' – ' + String(n.hora_fin).slice(0, 5) : ''}` : '';
    const L = infoEnlace(n.enlace), LI = infoEnlace(n.inscripcion_enlace);
    const fila = (ic, k, v) => v ? `<div style="display:flex;gap:.7rem;padding:.65rem 0;border-top:1px solid var(--linea);"><span style="font-size:1.2rem">${ic}</span><div><div style="font-size:.76rem;color:var(--suave);font-weight:700;text-transform:uppercase;letter-spacing:.04em;">${k}</div><div>${v}</div></div></div>` : '';
    const pr = n.prioridad === 'urgente' ? '🚨 Urgente' : n.prioridad === 'importante' ? '⭐ Importante' : '';
    $('#cajon').innerHTML = `<button class="cerrar" data-cerrar>×</button>
      <div style="background:linear-gradient(135deg,${c},color-mix(in srgb,${c} 55%,#000));color:#fff;border-radius:16px;padding:1.2rem;margin:.6rem 0 1rem;">
        <div style="font-size:.8rem;font-weight:700;opacity:.9;">${NOV_TAG[n.tipo] || n.tipo || 'Aviso'}${pr ? ' · ' + pr : ''}</div>
        <h2 style="font-family:var(--display);margin:.3rem 0;line-height:1.15;">${esc(n.titulo)}</h2>
        <div style="opacity:.95;">📅 ${d.getDate()} ${MESES_C[d.getMonth()]} ${d.getFullYear()}${n.fecha_fin && n.fecha_fin !== n.fecha ? ' → vigente hasta ' + esc(n.fecha_fin) : ''}</div></div>
      ${n.detalle ? `<p style="font-weight:600;">${esc(n.detalle)}</p>` : ''}
      ${n.info_completa ? `<p style="white-space:pre-wrap;color:var(--tinta);">${esc(n.info_completa)}</p>` : ''}
      ${fila('📚', 'Materia', esc(n.materia || ''))}${fila('👩‍🏫', 'Docente', esc(n.docente || ''))}${fila('🕒', 'Horario', hora)}${fila('💻', 'Modalidad', esc(n.modalidad || ''))}
      ${fila('📍', 'Lugar', esc([n.sede, n.salon, n.ubicacion, n.piso].filter(Boolean).join(' · ')))}${fila('👥', 'Cupo', esc(n.cupo || ''))}${fila('💲', 'Costo', esc(n.costo || ''))}${fila('✅', 'Requisitos', esc(n.requisitos || ''))}
      ${fila('🎓', 'Facultades', facs.map(f => `${emojiFac(f)} ${esc(f.nombre)}`).join('<br>'))}${fila('📘', 'Programas', progs.map(esc).join('<br>'))}
      ${fila('🙋', 'Contacto', [n.contacto_nombre, n.contacto_correo ? `<a href="mailto:${esc(n.contacto_correo)}">${esc(n.contacto_correo)}</a>` : '', esc(n.contacto_telefono || '')].filter(Boolean).join(' · '))}
      <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem;">${L ? pillEnlace(L) : ''}${LI ? pillEnlace(LI) : ''}</div>`;
    $('#velo').classList.add('on'); $('#cajon').classList.add('on');
  };
  document.addEventListener('change', async ev => { const t = ev.target; if (!t.dataset || !t.dataset.emoT) return; const v = t.value.trim(); const r = await dbClient.from(t.dataset.emoT).update({ emoji: v || null }).eq('id', t.dataset.emoI); if (r.error) return toast('Falta la columna "emoji". Ejecuta el SQL actualizado.', true); const nd = await leerNube(); if (nd) D = nd; toast('Emoji actualizado ' + v); });
  document.addEventListener('click', ev => { const t = ev.target.closest('[data-nov]'); if (t && !ev.target.closest('a')) abrirNovedad(t.dataset.nov); });

  function pintarNovedades() {
    const cont = $('#novGrid'); if (!cont) return;
    const hoyIso = hoy();
    // Cuando una novedad vence (fecha < hoy), se oculta de la vista pública
    const lista = NOVEDADES.filter(n => (n.fecha_fin || n.fecha) >= hoyIso).slice(0, 8);
    $('#novCount').textContent = lista.length;
    cont.innerHTML = lista.length
      ? lista.map(n => {
          const c = NOV_COLOR[n.tipo] || NOV_COLOR.otro;
          const d = parse(n.fecha);
          const hora = n.hora_inicio ? `${String(n.hora_inicio).slice(0,5)}${n.hora_fin ? '–' + String(n.hora_fin).slice(0,5) : ''}` : '';
          const facs = (n.facultad_ids || []).map(id => D.facultades.find(f => String(f.id) === String(id))).filter(Boolean);
          const progs = [];
          (n.programa_ids || []).forEach(id => { for (const f of D.facultades) { const p = f.programas.find(x => String(x.id) === String(id)); if (p) progs.push(p.nombre); } });
          const L = infoEnlace(n.enlace);
          return `<article class="nov-card" data-nov="${n.id}" tabindex="0" style="--c:${c};cursor:pointer;">
            <div class="nov-top"><span class="nov-tag">${NOV_TAG[n.tipo] || n.tipo || 'Aviso'}</span><span>${d.getDate()} ${MESES_C[d.getMonth()]}</span></div>
            <h3>${esc(n.titulo)}</h3>
            ${n.detalle ? `<p>${esc(n.detalle)}</p>` : ''}
            <div class="nov-meta">
              ${n.materia ? `<span>📚 ${esc(n.materia)}</span>` : ''}
              ${hora ? `<span>🕒 ${hora}</span>` : ''}
              ${n.modalidad ? `<span>💻 ${esc(n.modalidad)}</span>` : ''}
              ${(n.salon || n.piso) ? `<span>📍 ${esc([n.salon, n.ubicacion, n.piso].filter(Boolean).join(' · '))}</span>` : ''}
              ${L ? pillEnlace(L) : ''}
            </div>
            ${(facs.length || progs.length) ? `<div class="nov-chips">${facs.map(f => `<span class="nov-chip">${emojiFac(f)} ${esc(f.nombre)}</span>`).join('')}${progs.map(p => `<span class="nov-chip">📚 ${esc(p)}</span>`).join('')}</div>` : ''}
          </article>`;
        }).join('')
      : '<p class="nov-empty">No hay novedades vigentes.</p>';
  }

  function normalizarEnlace(u) { u = String(u || '').trim(); if (!u) return ''; if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, ''); try { const x = new URL(u); return /^https?:$/.test(x.protocol) && x.hostname.includes('.') ? x.href : ''; } catch (_) { return ''; } }
  function enlaceOutlook(e) {
    const dd = s => s.replace(/-/g, '');
    let start, end;
    if (e.horaInicio) {
      start = `${dd(e.inicio)}T${e.horaInicio.replace(':', '')}00`;
      end = `${dd(finDe(e))}T${(e.horaFin || e.horaInicio).replace(':', '')}00`;
    } else {
      start = `${dd(e.inicio)}T080000`;
      end = `${dd(sumaDias(finDe(e), 1))}T080000`;
    }
    const q = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: tituloInteligente(e) || '', startdt: start, enddt: end, body: [e.descripcion, ambito(D, e)].filter(Boolean).join(' · '), location: [e.lugar, e.lugarEsp, e.piso].filter(Boolean).join(' - ') });
    return 'https://outlook.office.com/calendar/0/deeplink/compose?' + q.toString();
  }
  
  const PLATAFORMAS = [
    [/^meet\.google\.com$/i, 'Google Meet', '#00832D', 'meet.google.com', '🎥', 'Meet'],
    [/^teams\.microsoft\.com$|^(teams\.)?live\.com$/i, 'Microsoft Teams', '#5B5FC7', 'teams.microsoft.com', '👥', 'Teams'],
    [/(^|\.)zoom\.(us|com)$/i, 'Zoom', '#2D8CFF', 'zoom.us', '📹', 'Zoom'],
    [/(^|\.)webex\.com$/i, 'Webex', '#00A0D1', 'webex.com', '🌐', 'Webex'],
    [/(^|\.)youtube\.com$|^youtu\.be$/i, 'YouTube', '#D32F2F', 'youtube.com', '▶️', 'YouTube']
  ];

  function infoEnlace(raw) {
    const url = normalizarEnlace(raw); if (!url) return null;
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    const p = PLATAFORMAS.find(x => x[0].test(host));
    if (p) return { url, nombre: p[1], color: p[2], fav: p[3], emoji: p[4], corto: p[5], generico: false };
    return { url, nombre: 'Enlace web', color: '#64748B', fav: '', emoji: '🔗', corto: 'Enlace', generico: true };
  }

  function iconoPlat(L) {
    if (!L.fav) return `<span class="plat-emo">${L.emoji}</span>`;
    return `<img class="plat-ico" src="https://www.google.com/s2/favicons?domain=${L.fav}&sz=64" alt="" onerror="this.replaceWith(document.createTextNode('${L.emoji}'))">`;
  }
  function pillEnlace(L, extra = '') {
    return `<a href="${esc(L.url)}" target="_blank" rel="noopener" class="link-pill" style="background:${L.color}1F; color:${L.color}; border:1px solid ${L.color}66;" title="${esc(L.nombre)}"${extra}>${iconoPlat(L)} ${L.generico ? 'Abrir enlace' : 'Unirse · ' + esc(L.corto)}</a>`;
  }

  document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-copy]'); if (!b) return;
    (navigator.clipboard ? navigator.clipboard.writeText(b.dataset.copy) : Promise.reject()).then(() => toast('Enlace copiado'), () => toast('No se pudo copiar el enlace', true));
  });

  function filaEvento(e, mostrarAmbito = true) {
    const st = estadoDe(e);
    const { facColor, catColor, icono } = e.esFestivo ? { facColor: 'var(--rojo)', catColor: 'var(--rojo)', icono: '' } : getColores(D, e);
    const c = e.esFestivo ? { nombre: 'Festivo Nacional' } : catDe(D, e.categoria);
    const d = parse(e.inicio);
    const inminente = esInminente(e);
    const titMostrado = e.esFestivo ? e.titulo : tituloInteligente(e);
    const ambitoHtml = mostrarAmbito && !e.esFestivo ? `<span class="info-pill">${icono ? icono : FLATICONS.birrete} ${esc(ambito(D, e))}</span>` : '';
    const lugarTxt = e.lugar ? (e.lugarEsp ? `${e.lugarEsp}` : e.lugar) : '';
    const pisoTxt = e.piso ? ` - ${e.piso}` : '';
    const lugarHtml = lugarTxt ? `<span class="info-pill">${FLATICONS.pin} ${esc(lugarTxt + pisoTxt)}</span>` : '';
    let horaHtml = '';
    if (e.horaInicio) horaHtml = `<span class="info-pill">${FLATICONS.reloj} ${e.horaInicio}${e.horaFin ? ' - ' + e.horaFin : ''}</span>`;
    
    const L = infoEnlace(e.enlace);
    const linkHtml = L ? pillEnlace(L, ' onclick="event.stopPropagation()"') : '';
    
    const msHtml = !e.esFestivo ? `<a href="${enlaceOutlook(e)}" target="_blank" rel="noopener" class="link-pill ms" title="Agregar a Outlook Calendar" onclick="event.stopPropagation()">📅 Outlook</a>` : '';
    const dirigidoA = e.publico && e.publico.length ? e.publico[0] : 'Comunidad universitaria';
    const infoExtraHtml = `<span class="info-pill">${em(emojiPub(dirigidoA))} ${esc(dirigidoA)}${e.publico && e.publico.length > 1 ? ` +${e.publico.length - 1}` : ''}</span> <span class="info-pill">${FLATICONS.calendario} ${nombrePeriodo(e.periodo)}</span>`;

    return `<article class="ev rev ${st.pasado ? 'pasado' : ''} ${e.esFestivo ? 'festivo' : ''} ${inminente ? 'destacado' : ''}" style="--c-fac:${facColor};--c-cat:${catColor}" data-id="${e.id}" tabindex="0">
      <div class="fecha-block"><b>${d.getDate()}</b><span class="mes">${MESES_C[d.getMonth()]}</span><span class="dia-sem">${diaSem(e)}</span></div>
      <div class="ev-content"><div class="ev-top"><h3>${esc(titMostrado)}</h3><span class="cat-pill">${c.emoji ? esc(c.emoji) + ' ' : ''}${esc(c.nombre)}${e.subcategoria ? ' · ' + esc(e.subcategoria) : ''}</span></div><div class="ev-bottom">${horaHtml}${ambitoHtml}${lugarHtml}${infoExtraHtml}${linkHtml}${msHtml}</div></div>
      <div class="estado-block"><span class="estado ${st.c}">${st.t}</span></div>
    </article>`;
  }

  function vistaCalendario(L) {
    const y = S.ref.getFullYear(), m = S.ref.getMonth();
    const imgMes = `${MESES_C[m]}.png`;
    const primero = new Date(y, m, 1), offset = (primero.getDay() + 6) % 7;
    const inicio = new Date(y, m, 1 - offset);
    const finMes = new Date(y, m + 1, 0);
    const iniIso = iso(inicio), finIso = iso(finMes);
    const Lvis = L.filter(e => e.inicio <= finIso && finDe(e) >= iniIso);
    let h = `<div style="display:flex; align-items:center; gap:0.6rem; margin-bottom:0.8rem; flex-wrap:wrap;"><h2 style="font-family:var(--display); font-size:1.5rem; flex:1; color:var(--petroleo);">${MESES[m]} ${y}</h2><button class="btn" data-mes="-1">←</button><button class="btn" data-mes="0">Hoy</button><button class="btn" data-mes="1">→</button></div><div class="cal ${S.dir}" style="--mes-img:url('${imgMes}')">`;
    ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].forEach(n => h += `<div class="dh">${n}</div>`);
    const h0 = hoy(), MAXL = 3;
    const rango = e => { const a = parse(e.inicio), b = parse(finDe(e)); return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MESES_C[b.getMonth()]}` : `${a.getDate()} ${MESES_C[a.getMonth()]} – ${b.getDate()} ${MESES_C[b.getMonth()]}`; };
    for (let w = 0; w < 6; w++) {
      const dias = [];
      for (let c = 0; c < 7; c++) { const d = new Date(inicio); d.setDate(inicio.getDate() + w * 7 + c); dias.push(d); }
      const ss = dias.map(iso);
      const items = [];
      ss.forEach((s, c) => festivosDia(s).forEach(f => items.push({ e: f, a: c, b: c, antes: false, despues: false })));
      Lvis.forEach(e => {
        const fe = finDe(e);
        if (e.inicio > ss[6] || fe < ss[0]) return;
        items.push({ e, a: e.inicio < ss[0] ? 0 : ss.indexOf(e.inicio), b: fe > ss[6] ? 6 : ss.indexOf(fe), antes: e.inicio < ss[0], despues: fe > ss[6] });
      });
      items.sort((x, y) => x.a - y.a || (y.e.esFestivo ? 1 : 0) - (x.e.esFestivo ? 1 : 0) || (y.b - y.a) - (x.b - x.a));
      const ult = [];
      items.forEach(it => { let l = ult.findIndex(x => x < it.a); if (l < 0) { l = ult.length; ult.push(-1); } ult[l] = it.b; it.l = l; });
      const nl = Math.min(MAXL, ult.length);
      const ocultos = [0, 0, 0, 0, 0, 0, 0];
      items.filter(it => it.l >= MAXL).forEach(it => { for (let c = it.a; c <= it.b; c++) ocultos[c]++; });
      h += `<div class="sem" style="grid-template-rows:30px ${'var(--lh) '.repeat(nl)}minmax(8px,auto)">`;
      dias.forEach((dia, c) => {
        const s = ss[c];
        h += `<div class="dia c${c} ${dia.getMonth() !== m ? 'fuera' : ''} ${s === h0 ? 'hoy' : ''} ${festivosDia(s).length ? 'festivo' : ''}" style="grid-column:${c + 1};grid-row:1 / ${nl + 3}"><span class="n">${dia.getDate()}</span></div>`;
      });
      items.filter(it => it.l < MAXL).forEach(it => {
        const e = it.e;
        const { facColor, catColor, icono } = e.esFestivo ? { facColor: 'var(--rojo)', catColor: 'var(--rojo)', icono: '' } : getColores(D, e);
        const titulo = e.esFestivo ? (e.titulo || e.nombre || '') : tituloInteligente(e);
        const eid = e.id || ('festivo-' + e.fecha);
        const span = it.b - it.a + 1;
        const rg = !e.esFestivo && e.inicio !== finDe(e) ? rango(e) : '';
        h += `<button class="pill ${e.esFestivo ? 'festivo' : ''} ${esInminente(e) ? 'destacado' : ''} ${it.antes ? 'sigue-ant' : ''} ${it.despues ? 'sigue-sig' : ''}" style="--c-fac:${facColor};--c-cat:${catColor};grid-column:${it.a + 1} / span ${span};grid-row:${it.l + 2}" data-id="${eid}" title="${esc(titulo + (rg ? ' · ' + rg : ''))}">${it.antes ? '◂ ' : ''}${icono ? icono + ' ' : ''}${esc(titulo)}${rg && span >= 3 ? `<span class="rg">${rg}</span>` : ''}${it.despues ? ' ▸' : ''}</button>`;
      });
      ocultos.forEach((n, c) => { if (n) h += `<button class="mas-dia" style="grid-column:${c + 1};grid-row:${nl + 2}" data-dia="${ss[c]}">+${n} más</button>`; });
      h += '</div>';
    }
    return h + '</div><p class="leyenda"><i></i>Festivo nacional de Colombia</p>';
  }

  function vistaLista(L) {
    let out = '', mes = '';
    L.forEach(e => { const d = parse(e.inicio), k = `${d.getFullYear()}-${d.getMonth()}`; if (k !== mes) { mes = k; out += `<h2 class="mes-t rev" id="m-${d.getFullYear()}-${d.getMonth()}">${MESES[d.getMonth()]} ${d.getFullYear()}</h2>`; } out += filaEvento(e); });
    return out || `<div style="text-align:center; padding:3rem 1rem; color:var(--suave);"><b style="display:block; font-family:var(--display); font-size:1.3rem; color:var(--tinta); margin-bottom:0.3rem;">No encontramos fechas</b>Prueba con otro semestre, facultad, rol o categoría.</div>`;
  }

  function pintarPublico() {
    if (!D) return;
    pintarEncabezado(); pintarProximos(); pintarProgreso(); pintarModulos(); pintarNovedades(); pintarFacultadesIzquierda();
    const L = filtrar(); let fest = [];
    if (S.festivos && !S.cat) {
      const m0 = S.sem == 2 ? 6 : 0;
      const m1 = S.sem == 1 ? 5 : 11;
      fest = festivosAnio(S.anio).filter(f => { const m = +f.fecha.slice(5, 7) - 1; return m >= m0 && m <= m1; });
      if (S.q) fest = fest.filter(f => norm(f.nombre).includes(norm(S.q)));
    }
    const todos = [...L, ...fest].sort((a, b) => a.inicio.localeCompare(b.inicio) || (a.titulo || '').localeCompare(b.titulo || ''));
    listaFiltradaCompleta = todos;
    $('#vistaCalendario').innerHTML = vistaCalendario(L);
    $('#vistaLista').innerHTML = vistaLista(todos);
    $('#cuentaLista').innerHTML = `${FLATICONS.calendario} ${todos.length} fechas`;
    $('#origen').innerHTML = `Fuente: <b>Jhon Vargas</b>`;
    $('#actual').textContent = D.actualizado ? 'Actualizado: ' + new Date(D.actualizado).toLocaleDateString('es-CO') : '';
    S.dir = ''; revelar();
  }

  function abrirDetalle(id) {
    if (String(id).startsWith('festivo-')) {
      const f = festivosAnio(+id.slice(8, 12)).find(x => x.id === id);
      if (!f) return;
      $('#cajon').innerHTML = `<button class="cerrar" data-cerrar>×</button><h2 style="font-family:var(--display); font-size:1.6rem; line-height:1.15; margin:.5rem 0 1rem; padding-right:2rem; color:var(--petroleo);">${FLATICONS.estrella} ${esc(f.nombre)}</h2><dl><dt>Fecha</dt><dd>${fmtFecha(f.fecha)}</dd><dt>Nota</dt><dd>Este es un día festivo oficial en Colombia.</dd></dl>`;
      $('#velo').classList.add('on'); $('#cajon').classList.add('on');
      return;
    }
    const e = GRP[id] || D.eventos.find(x => x.id === id); if (!e) return;
    const st = estadoDe(e);
    const { facColor, catColor, icono } = getColores(D, e);
    const titMostrado = tituloInteligente(e);
    const gc = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(titMostrado)}&dates=${e.inicio.replace(/-/g, '')}/${sumaDias(finDe(e), 1).replace(/-/g, '')}&details=${encodeURIComponent(e.descripcion || '')}&location=${encodeURIComponent(e.lugar || '')}`;
    const d0 = parse(e.inicio), d1 = parse(finDe(e)), multi = e.inicio !== finDe(e), nDias = diffDias(e.inicio, finDe(e)) + 1;
    const cat = catDe(D, e.categoria);
    const tile = d => `<div class="dt-tile"><b>${d.getDate()}</b><span>${MESES_C[d.getMonth()]} ${d.getFullYear()}</span><em>${DIAS_L[d.getDay()]}</em></div>`;
    const sec = (ic, t, body) => body ? `<section class="dt-sec"><h4>${ic} ${t}</h4>${body}</section>` : '';
    const facs = (e.facultad || []).map(fid => D.facultades.find(f => f.id === fid)).filter(Boolean);
    const progs = (e.programa || []).map(pid => { for (const f of D.facultades) { const p = f.programas.find(x => x.id === pid); if (p) return p.nombre; } return ''; }).filter(Boolean);
    const areas = (e.area || []).map(aid => D.areas.find(x => x.id === aid)).filter(Boolean);
    const hora = e.horaInicio ? `${e.horaInicio}${e.horaFin ? ' - ' + e.horaFin : ''}` : '';
    
    const L = infoEnlace(e.enlace);
    let linkBody = '';
    if (L) {
        linkBody = `<div class="dt-link" style="--pc:${L.color}">
          <div class="dt-link-top">
            <span class="dt-plat">${iconoPlat(L)} ${esc(L.nombre)}</span>
            <span class="dt-host" title="${esc(L.url)}">${esc(L.url.replace(/^https?:\/\//, ''))}</span>
          </div>
          <div class="dt-link-btns">
            <a class="btn pri" href="${esc(L.url)}" target="_blank" rel="noopener" style="background:${L.color}; border-color:${L.color}; color:white;">${FLATICONS.link} ${L.generico ? 'Abrir enlace' : 'Unirse a ' + esc(L.corto)}</a>
            <button class="btn" data-copy="${esc(L.url)}">${FLATICONS.documento} Copiar enlace</button>
          </div>
        </div>`;
    }
    
    const lugarBody = e.lugar ? `<div class="dt-lugar"><b>${esc(e.lugar)}</b>${e.lugarEsp ? `<span>${esc(e.lugarEsp)}</span>` : ''}${e.piso ? `<span>${esc(e.piso)}</span>` : ''}</div>` : '';
    const periodos = [e.periodo, e.periodo2].filter(Boolean).map(nombrePeriodo);

    const facsHtml = facs.map(f => `<div class="dt-fac-card" style="--fc:${f.color || 'var(--verde)'}">${em(emojiFac(f))} ${esc(f.nombre)}</div>`).join('');

    $('#cajon').innerHTML = `<div class="dt-head" style="--fc:${facColor}">
        <button class="cerrar" data-cerrar>×</button>
        <div class="dt-tags"><span class="dt-cat">${esc(cat.nombre)}</span>${st.t ? `<span class="estado ${st.c}">${st.t}</span>` : ''}${e.estado === 'borrador' ? '<span class="dt-cat">Borrador</span>' : ''}</div>
        <h2>${esc(titMostrado)}</h2>
        <p class="dt-sub">${icono ? icono : FLATICONS.birrete} ${esc(ambito(D, e))}</p>
      </div>
      <div class="dt-fechas" style="--fc:${facColor}">${tile(d0)}${multi ? `<div class="dt-arrow">→</div>${tile(d1)}` : ''}<div class="dt-meta"><b>${multi ? nDias + ' días' : 'Un solo día'}</b><span>${FLATICONS.reloj} ${hora || 'Todo el día'}</span></div></div>
      ${sec(FLATICONS.personas, 'Dirigido a', e.publico && e.publico.length ? `<div class="dt-chips">${e.publico.map(x => `<span class="dt-chip">${em(emojiPub(x))}${esc(x)}</span>`).join('')}</div>` : '')}
      
      ${sec(FLATICONS.birrete, 'Facultades', facs.length ? `<div class="dt-facs-grid">${facsHtml}</div>` : '')}
      
      ${sec(FLATICONS.libro, 'Programas', progs.length ? `<div class="dt-chips">${progs.map(p => `<span class="dt-chip">${FLATICONS.libro} ${esc(p)}</span>`).join('')}</div>` : '')}
      ${sec(FLATICONS.personas, 'Áreas administrativas', areas.length ? `<div class="dt-chips">${areas.map(a => `<span class="dt-chip">${em(emojiArea(a))}${esc(a.nombre)}</span>`).join('')}</div>` : '')}
      ${sec(FLATICONS.pin, 'Lugar', lugarBody)}
      ${sec(FLATICONS.link, 'Enlace', linkBody)}
      ${sec(FLATICONS.calendario, 'Semestre', periodos.length ? `<div class="dt-chips">${periodos.map(nombrePeriodo).map(p => `<span class="dt-chip">${esc(p)}</span>`).join('')}</div>` : '')}
      ${sec(FLATICONS.documento, 'Detalles', e.descripcion ? `<div class="dt-desc">${esc(e.descripcion).replace(/\n/g, '<br>')}</div>` : '')}
      <div class="dt-acc">
        <a class="btn" href="${gc}" target="_blank" rel="noopener">${FLATICONS.calendario} Google Calendar</a>
        <a class="btn" href="${enlaceOutlook(e)}" target="_blank" rel="noopener" style="border-color:#0f6cbd;color:#0f6cbd;">📅 Outlook Calendar</a>
        <button class="btn" data-ics="${e.id}">${FLATICONS.documento} Descargar (.ics)</button>
      </div>`;
    $('#velo').classList.add('on'); $('#cajon').classList.add('on');
  }
  
  function abrirDia(s) {
    const anio = +s.slice(0, 4);
    const L = D.eventos.filter(e => e.estado !== 'borrador' && eventoVisiblePublico(e) && e.inicio <= s && s <= finDe(e) && (e.periodo.startsWith(anio + '-') || (e.periodo2 && e.periodo2.startsWith(anio + '-'))));
    const fDelDia = festivosDia(s);
    const todos = [...fDelDia, ...L];
    $('#cajon').innerHTML = `<button class="cerrar" data-cerrar>×</button><h2 style="font-family:var(--display); font-size:1.6rem; margin-bottom:1rem; color:var(--petroleo);">${FLATICONS.calendario} ${fmtFecha(s)}</h2>` + (todos.length ? todos.map(e => {
       if (e.esFestivo) return `<div class="ev festivo" style="--c-fac:var(--rojo);--c-cat:var(--rojo); cursor:default;" data-id="festivo-${e.fecha}"><div class="fecha-block"><b>${parse(e.fecha).getDate()}</b><span class="mes">Festivo</span></div><div><h3>${esc(e.nombre)}</h3></div></div>`;
       return filaEvento(e);
    }).join('') : '<p style="color:var(--suave); text-align:center; padding:2rem;">No hay eventos este día.</p>');
    $('#velo').classList.add('on'); $('#cajon').classList.add('on');
  }
  function cerrar() { $('#velo').classList.remove('on'); $('#cajon').classList.remove('on'); }

  function descargarIcs(evs, nombre) {
    const t = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Calendario Academico//ES', 'CALSCALE:GREGORIAN'];
    evs.forEach(e => {
      let dtStart = `DTSTART;VALUE=DATE:${e.inicio.replace(/-/g, '')}`;
      let dtEnd = `DTEND;VALUE=DATE:${sumaDias(finDe(e), 1).replace(/-/g, '')}`;
      if (e.horaInicio) {
        const hIni = e.horaInicio.replace(':', '') + '00';
        const hFin = e.horaFin ? e.horaFin.replace(':', '') + '00' : hIni;
        dtStart = `DTSTART:${e.inicio.replace(/-/g, '')}T${hIni}`;
        dtEnd = `DTEND:${finDe(e).replace(/-/g, '')}T${hFin}`;
      }
      const tit = e.esFestivo ? e.titulo : tituloInteligente(e);
      L.push('BEGIN:VEVENT', `UID:${e.id || uid()}@calendario`, `DTSTAMP:${stamp}`, dtStart, dtEnd, `SUMMARY:${t(tit)}`, `DESCRIPTION:${t((e.descripcion ? e.descripcion + ' · ' : '') + ambito(D, e))}`, ...(e.lugar ? [`LOCATION:${t(e.lugar)}`] : []), ...(e.enlace ? [`URL:${t(e.enlace)}`] : []), 'END:VEVENT');
    });
    L.push('END:VCALENDAR');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([L.join('\r\n')], { type: 'text/calendar' }));
    a.download = nombre + '.ics'; a.click();
  }

  document.addEventListener('click', ev => {
    const t = ev.target;
    const pubWrap = $('#fPubWrap');
    if (pubWrap && pubWrap.open && !pubWrap.contains(t)) pubWrap.open = false;

    const facBtn = t.closest('[data-fac-info]');
    if (facBtn) return abrirInfoFacultad(facBtn.dataset.facInfo);
    if (t.closest('[data-cerrar-fac]') || t.id === 'fac-modal') return cerrarModalFac();
    const filFac = t.closest('[data-filtrar-fac]');
    if (filFac) {
      S.grupo = 'f:' + filFac.dataset.filtrarFac;
      S.prog = '';
      cerrarModalFac();
      pintarPublico();
      return;
    }

    const mod = t.closest('[data-cat]'); if (mod) { S.cat = mod.dataset.cat; return pintarPublico(); }
    if (t.closest('[data-cerrar]') || t.id === 'velo') return cerrar();
    const ics = t.closest('[data-ics]'); if (ics) return descargarIcs([D.eventos.find(e => e.id === ics.dataset.ics)], 'evento');
    const mas = t.closest('[data-dia]'); if (mas) return abrirDia(mas.dataset.dia);
    const nav = t.closest('[data-mes]');
    if (nav) { const v = +nav.dataset.mes; S.dir = v < 0 ? 'izq' : v > 0 ? 'der' : ''; S.ref = v === 0 ? new Date() : new Date(S.ref.getFullYear(), S.ref.getMonth() + v, 1); const y = S.ref.getFullYear(), m = S.ref.getMonth(); if (y !== S.anio) { S.anio = y; S.sem = ''; } else if (S.sem && (m < 6 ? 1 : 2) != S.sem) S.sem = ''; pintarPublico(); return irMes(); }
    const sm = t.closest('#fSem button'); if (sm) { S.sem = sm.dataset.v; if (S.sem) S.ref = new Date(S.anio, S.sem == 2 ? 6 : 0, 1); pintarPublico(); return irMes(); }
    const row = t.closest('[data-id]'); if (row) { abrirDetalle(row.dataset.id); }
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { cerrar(); cerrarModalFac(); const pw = $('#fPubWrap'); if (pw) pw.open = false; }
    if (ev.key === 'Enter' && ev.target.classList.contains('ev')) abrirDetalle(ev.target.dataset.id);
  });
  $('#fAnio').onchange = e => { S.anio = +e.target.value; S.ref = new Date(S.anio, S.ref.getMonth(), 1); pintarPublico(); };
  $('#fFest').onchange = e => { S.festivos = e.target.checked; pintarPublico(); };
  $('#fGrupo').onchange = e => { S.grupo = e.target.value; S.prog = ''; pintarPublico(); };
  $('#fProg').onchange = e => { S.prog = e.target.value; pintarPublico(); };
  $('#fInst').onchange = e => { S.inst = e.target.checked; pintarPublico(); };
  $('#q').oninput = e => { S.q = e.target.value; pintarPublico(); };
  $('#bIcs').onclick = () => { if (!listaFiltradaCompleta.length) return alert('No hay fechas para añadir con estos filtros.'); descargarIcs(listaFiltradaCompleta, `calendario-${S.anio}${S.sem ? '-s' + S.sem : ''}`); };

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'fPubTodos') {
      S.publico = [];
      pintarPublico();
      return;
    }
    if (t.closest('#fPubList') && t.matches('input[type=checkbox]') && t.value) {
      const v = t.value;
      if (t.checked) { if (!S.publico.includes(v)) S.publico.push(v); }
      else S.publico = S.publico.filter(x => x !== v);
      pintarPublico();
      return;
    }
  });

  window.onscroll = () => { $('#btnTop').classList.toggle('show', window.scrollY > 300); };
  $('#btnTop').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  
  let P = 'resumen';
  const DESC_ROL = { 
    admin: 'Administras todo el sistema: eventos, estructura, usuarios y registros.', 
    creador: 'Tu perfil permite crear eventos nuevos.', 
    editor: 'Tu perfil permite editar los eventos existentes.', 
    docente: 'Tu perfil permite gestionar las novedades de clases (crear, editar, eliminar).',
    administrativo: 'Tu perfil permite gestionar las novedades de clases (crear, editar, eliminar).'
  };
  const F = { q: '', per: '', cat: '', est: '', grupo: '', desde: '', hasta: '', niv: '', ord: '', creador: '' };
  const NF = { q: '', estado: '' };
  const SEL = new Set();

  function irAdmin() {
    if (!DB_READY) { document.getElementById('error-msg').textContent = "No hay conexión con la base de datos."; document.getElementById('error-box').hidden = false; return; }
    document.body.classList.add('en-admin');
    $('#public-panel').style.display = 'none';
    $('#admin-panel').classList.add('on');
    if (USUARIO_ACTUAL) { mostrarAppAdmin(); } else {
      $('#gate').style.display = 'grid';
      $('#admin-app').hidden = true;
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('reset') && urlParams.has('u')) {
        $('#gateTitle').textContent = "Crea tu nueva contraseña";
        $('#gateDesc').textContent = "Escribe el PIN temporal que te llegó al correo y elige tu propio PIN (6 a 15 dígitos).";
        $('#gateLoginFields').hidden = true; $('#gateNewPassFields').hidden = false; $('#resetActualWrap').hidden = false;
        window._reset_verificado = false; window._reset_user_id = urlParams.get('u');
      } else {
        $('#gateTitle').textContent = "Administrar calendario";
        $('#gateDesc').textContent = "Ingresa tu PIN de 6 a 15 dígitos.";
        $('#gateLoginFields').hidden = false; $('#gateNewPassFields').hidden = true; $('#gateOlvidoFields').hidden = true;
        verificarSiHayUsuarios().then(hay => { $('#btnCrearAdmin').style.display = hay ? 'none' : 'block'; $('#pinAyuda').textContent = hay ? 'Ingresa tu PIN de administrador.' : 'No hay usuarios. Crea el PIN de administrador.'; });
      }
    }
  }

  function mostrarAppAdmin() {
    $('#gate').style.display = 'none';
    $('#admin-app').hidden = false;
    $('#userNameDisplay').textContent = USUARIO_ACTUAL.nombre;
    let rolesArray = String(USUARIO_ACTUAL.rol).split(',').map(r => ROLES[r.trim()] || r.trim());
    if (tieneRol(USUARIO_ACTUAL, 'admin')) rolesArray = ['👑 Administrador'];
    const rolTxt = rolesArray.join(' + ');
    $('#userRoleDisplay').innerHTML = rolTxt;
    $('#saludoNombre').textContent = USUARIO_ACTUAL.nombre;
    $('#saludoRol').innerHTML = rolTxt;
    const esAdmin = tieneRol(USUARIO_ACTUAL, 'admin');
    $$('.admin-only').forEach(el => { el.style.display = esAdmin ? (el.classList.contains('sep') ? 'block' : 'flex') : 'none'; });
    
    reiniciarTemporizador();
    window.onmousemove = reiniciarTemporizador;
    window.onkeydown = reiniciarTemporizador;
    window.onclick = reiniciarTemporizador;

    ir('resumen');
  }

  function reiniciarTemporizador() {
    if (!USUARIO_ACTUAL) return;
    clearTimeout(inactividadTimer);
    inactividadTimer = setTimeout(() => {
      toast('Sesión cerrada por inactividad (5 minutos)', true);
      cerrarSesion();
    }, 300000);
  }

  function cerrarSesion() {
    if (USUARIO_ACTUAL) registrarLog('Cierre de sesión', 'Salió del sistema');
    localStorage.removeItem('ubosque_admin_session');
    clearTimeout(inactividadTimer);
    USUARIO_ACTUAL = null; SEL.clear(); cerrarModal();
    $('#admin-panel-inner').innerHTML = '';
    $('#pin').value = '';
    $('#admin-app').hidden = true;
    $('#admin-panel').classList.remove('on');
    $('#public-panel').style.display = 'block';
    document.body.classList.remove('en-admin');
    if (window.location.search.includes('reset')) window.history.replaceState({}, document.title, window.location.pathname);
    pintarPublico(); scrollTo(0, 0);
  }

  function irPublico(e) { if(e) e.preventDefault(); $('#admin-panel').classList.remove('on'); $('#public-panel').style.display = 'block'; document.body.classList.remove('en-admin'); pintarPublico(); }

  function mostrarOlvido() { $('#gateLoginFields').hidden = true; $('#gateOlvidoFields').hidden = false; $('#gateTitle').textContent = 'Recuperar mi PIN'; $('#gateDesc').textContent = 'Escribe tu correo registrado y te enviamos un PIN temporal. Con él entras y creas uno nuevo.'; $('#olvido_correo').focus(); }
  function volverLogin() { $('#gateOlvidoFields').hidden = true; $('#gateLoginFields').hidden = false; $('#gateTitle').textContent = 'Administrar calendario'; $('#gateDesc').textContent = 'Ingresa tu PIN de 6 a 15 dígitos.'; }
  async function registrarLogAnon(accion, detalle) { try { await dbClient.from('logs').insert([{ usuario_nombre: 'Sistema', accion, detalle }]); } catch (_) {} }
  async function olvideMiPin() {
    const correo = $('#olvido_correo').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return toast('Escribe un correo válido', true);
    const b = $('#btnOlvido'); b.disabled = true;
    try {
      if (!emailjsListo()) throw new Error('EmailJS sin configurar');
      const { data: us } = await dbClient.from('usuarios_admin').select('id,nombre,correo').ilike('correo', correo.replace(/[%_]/g, '\\$&'));
      const u = (us || []).find(x => String(x.correo).toLowerCase() === correo.toLowerCase());
      if (u) { const r = await enviarPinPorCorreo(u); if (!r.ok && !r.espera) throw new Error(r.error); if (r.ok) registrarLogAnon('Restableció PIN', `${u.nombre} (autogestión)`); }
      toast('📧 Si el correo está registrado, te enviamos un PIN temporal. Revisa tu bandeja y el correo no deseado.');
      $('#olvido_correo').value = ''; volverLogin(); $('#gateDesc').textContent = 'Ingresa el PIN temporal que te llegó al correo.';
    } catch (e) { console.error(e); toast('No se pudo enviar el correo. Pídele al administrador que te restablezca el PIN.', true); }
    finally { b.disabled = false; }
  }

  async function crearAdminInicial() {
    const pin = prompt('Crea un PIN de 6 a 15 dígitos para el administrador:');
    if (!pin || !/^\d{6,15}$/.test(pin.trim())) return toast('El PIN debe tener entre 6 y 15 dígitos (solo números)', true);
    const correoAdm = (prompt('Correo del administrador (sirve para recuperar el PIN si lo olvidas). Puedes dejarlo vacío:') || '').trim();
    if (correoAdm && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correoAdm)) return toast('Correo inválido', true);
    try {
      await crearUsuario({ nombre: 'Administrador Principal', pin, rol: 'admin', correo: correoAdm || null, permisos: ['crear','editar','eliminar'], areas_asignadas: [] });
      toast('Usuario administrador creado. Ahora inicia sesión.');
      verificarSiHayUsuarios();
    } catch (e) { toast('Error al crear usuario: ' + e.message, true); }
  }

  $('#gateForm').onsubmit = async e => {
    e.preventDefault();
    if (!$('#gateNewPassFields').hidden) return guardarNuevaPassForzada();
    if (!$('#gateOlvidoFields').hidden) return olvideMiPin();
    const pin = $('#pin').value;
    if (pin.length < 6 || pin.length > 15) return toast('El PIN debe tener entre 6 y 15 dígitos', true);
    const bloqueo = +localStorage.getItem('ubosque_bloqueo') || 0;
    if (Date.now() < bloqueo) return toast(`Demasiados intentos. Espera ${Math.ceil((bloqueo - Date.now()) / 60000)} min.`, true);
    const user = await verificarPin(pin);
    if (user && (user.activo === false || (user.vence && String(user.vence).slice(0, 10) < hoy()))) return toast('Este usuario está suspendido o su acceso temporal venció. Contacta al administrador.', true);
    if (user) {
      USUARIO_ACTUAL = { id: user.id, nombre: user.nombre, rol: user.rol, permisos: user.permisos || [], areas: user.areas_asignadas || [], tipo_usuario: user.tipo_usuario || 'real' };
      $('#pin').value = '';
      if (user.pin_temporal) {
        USUARIO_ACTUAL = null; window._reset_user_id = user.id; window._reset_verificado = true; window._reset_pin_actual = pin;
        $('#resetActualWrap').hidden = true; $('#gateTitle').textContent = 'Crea tu nuevo PIN';
        $('#gateDesc').textContent = `Hola ${user.nombre}, entraste con un PIN temporal. Elige tu propio PIN para continuar.`;
        $('#gateLoginFields').hidden = true; $('#gateNewPassFields').hidden = false; $('#new_pin').focus();
        return;
      }
      
      USUARIO_ACTUAL.ts = Date.now(); localStorage.setItem('ubosque_admin_session', JSON.stringify(USUARIO_ACTUAL));
      
      registrarLog('Inicio de sesión', 'Ingresó al sistema'); mostrarAppAdmin();
      localStorage.removeItem('ubosque_intentos'); localStorage.removeItem('ubosque_bloqueo');
    } else {
      $('#pin').value = '';
      const n = (+localStorage.getItem('ubosque_intentos') || 0) + 1;
      localStorage.setItem('ubosque_intentos', n);
      if (n >= 5) { localStorage.setItem('ubosque_bloqueo', Date.now() + 5 * 60000); localStorage.removeItem('ubosque_intentos'); toast('Demasiados intentos. Espera 5 minutos.', true); }
      else toast('PIN incorrecto', true);
    }
  };

  async function actualizarPin(id, pin) {
    let r = await dbClient.from('usuarios_admin').update({ pin, pin_temporal: false }).eq('id', id);
    if (r.error && /pin_temporal/i.test(r.error.message || '')) r = await dbClient.from('usuarios_admin').update({ pin }).eq('id', id);
    return r;
  }
  async function guardarNuevaPassForzada() {
    const p1 = $('#new_pin').value.trim(), p2 = $('#new_pin_confirm').value.trim();
    if (!/^\d{6,15}$/.test(p1)) return toast('El PIN debe tener entre 6 y 15 dígitos', true);
    if (p1 !== p2) return toast('Los PIN no coinciden', true);
    const p0 = (($('#reset_pin_actual') || {}).value || '').trim();
    if (!window._reset_verificado) {
      if (!p0) return toast('Escribe el PIN temporal que te llegó al correo', true);
      const { data: fila } = await dbClient.from('usuarios_admin').select('*').eq('id', window._reset_user_id).eq('pin', p0).maybeSingle();
      if (!fila) return toast('El PIN temporal no es correcto', true);
      if (fila.pin_temporal === false) return toast('Este enlace ya fue usado. Entra con tu PIN normal.', true);
      window._reset_pin_actual = p0;
    }
    if (p1 === window._reset_pin_actual) return toast('Elige un PIN diferente al temporal', true);
    try {
      const { data: dup } = await dbClient.from('usuarios_admin').select('id').eq('pin', p1);
      if ((dup || []).some(x => String(x.id) !== String(window._reset_user_id))) return toast('Ese PIN ya está en uso, elige otro', true);
      const { error } = await actualizarPin(window._reset_user_id, p1);
      if (error) throw error;
      toast('✅ PIN actualizado. Inicia sesión con tu nuevo PIN.');
      window._reset_verificado = false; window._reset_pin_actual = null;
      window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) { toast('Error al actualizar: ' + e.message, true); }
  }

  async function ir(p, conservar) {
    if (!USUARIO_ACTUAL) return;
    const PANELES = { resumen: pResumen, eventos: pEventos, novedades: pNovedades, periodos: pPeriodos, facultades: pFacultades, areas: pAreas, categorias: pCategorias, usuarios: pUsuarios, logs: pLogs, publicar: pPublicar, config: pConfig, estructura: pEstructura, soporte: pSoporte };
    const isDocenteOAdmin = esDocenteOAdmin();
    const tieneCalendario = tienePermisoCalendario();
    
    if (!PANELES[p] || (p !== 'resumen' && p !== 'soporte' && p !== 'novedades' && isDocenteOAdmin && !tieneCalendario && p !== 'eventos') || (p !== 'resumen' && p !== 'soporte' && p !== 'eventos' && p !== 'novedades' && !tieneRol(USUARIO_ACTUAL, 'admin') && !isDocenteOAdmin)) p = (isDocenteOAdmin && !tieneCalendario) ? 'novedades' : 'resumen';
    
    P = p; SEL.clear();
    $$('.admin-nav .it').forEach(b => b.classList.toggle('on', b.dataset.p === p));
    let html; try { html = await PANELES[p](); } catch (e) { console.error(e); html = encabezado('Error', esc(e.message || String(e))); }
    if (P !== p || !USUARIO_ACTUAL) return;
    $('#admin-panel-inner').innerHTML = html;
    if (p === 'eventos') pintarTabla();
    if (p === 'logs') pintarLogs();
    if (!conservar) scrollTo(0, 0);
  }
  const refrescar = async () => { const y = scrollY; await ir(P, true); scrollTo(0, y); };
  const encabezado = (t, s) => `<h1 class="pt">${t}</h1><p class="ps">${s}</p>`;
  const chipCatAdmin = id => { const c = catDe(D, id); return `<span class="chip"><i style="background:${c.color}"></i>${esc(c.nombre)}</span>`; };
  const usadosPeriodo = id => D.eventos.filter(e => e.periodo === id).length;

  function resumenExtra() {
    const h = hoy(), pub = D.eventos.filter(e => e.estado !== 'borrador'), y = new Date().getFullYear();
    const d7 = new Date(); d7.setDate(d7.getDate() + 7); const s7 = d7.toISOString().slice(0, 10);
    const hoyN = pub.filter(e => e.inicio <= h && finDe(e) >= h).length, sem = pub.filter(e => e.inicio >= h && e.inicio <= s7).length;
    const novV = NOVEDADES.filter(n => (n.fecha_fin || n.fecha) >= h).length, sus = [...D.categorias, ...D.facultades, ...D.areas].filter(x => x.activo === false).length;
    const meses = Array.from({ length: 12 }, (_, m) => pub.filter(e => e.inicio.slice(0, 4) == y && +e.inicio.slice(5, 7) === m + 1).length), mx = Math.max(1, ...meses);
    const porCat = D.categorias.map(c => ({ c, n: pub.filter(e => e.categoria === c.id).length })).filter(x => x.n).sort((a, b) => b.n - a.n), tot = porCat.reduce((a, x) => a + x.n, 0) || 1;
    let acc = 0; const cono = porCat.map(x => { const ini = acc / tot * 100; acc += x.n; return `${x.c.color} ${ini}% ${acc / tot * 100}%`; }).join(',') || '#e5ece8 0 100%';
    const porFac = D.facultades.map(f => ({ f, n: pub.filter(e => (e.facultad || []).includes(f.id)).length })).sort((a, b) => b.n - a.n).slice(0, 8), mf = Math.max(1, ...porFac.map(x => x.n));
    const prox = pub.filter(e => finDe(e) >= h).sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(0, 8);
    const porArea = D.areas.map(a => ({ a, n: pub.filter(e => (e.area || []).includes(a.id)).length })).filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 6);
    const tipoN = {}; NOVEDADES.forEach(n => { const k = NOV_TAG[n.tipo] || n.tipo || 'Aviso'; tipoN[k] = (tipoN[k] || 0) + 1; }); const tn = Object.entries(tipoN).sort((a, b) => b[1] - a[1]), mt = Math.max(1, ...tn.map(x => x[1]));
    const sub = cuenta(pub.filter(e => e.subcategoria), e => e.subcategoria);
    const tabla = `<div class="caja" style="grid-column:1/-1"><h2>🗓️ Próximos eventos</h2><div class="tw"><table><thead><tr><th>Fecha</th><th>Evento</th><th>Categoría</th><th>Alcance</th></tr></thead><tbody>${prox.map(e => { const c = catDe(D, e.categoria); return `<tr><td>${esc(e.inicio)}</td><td><b>${esc(e.titulo)}</b></td><td>${c.emoji ? esc(c.emoji) + ' ' : ''}${esc(c.nombre)}</td><td>${esc(ambito(D, e))}</td></tr>`; }).join('') || '<tr><td colspan="4">Sin eventos próximos</td></tr>'}</tbody></table></div></div>`;
    const barrasX = (arr, f) => arr.map(x => `<div style="margin:.5rem 0;"><div style="display:flex;justify-content:space-between;font-size:.88rem;"><span>${f(x)}</span><b>${x.n ?? x[1]}</b></div><div style="height:8px;background:#e8efeb;border-radius:9px;overflow:hidden;"><i style="display:block;height:100%;width:${(x.n ?? x[1]) / Math.max(1, ...arr.map(y => y.n ?? y[1])) * 100}%;background:linear-gradient(90deg,#6a1b9a,#ec407a);border-radius:9px;"></i></div></div>`).join('') || '<p style="color:var(--suave)">Sin datos.</p>';
    const kp = (ic, n, t, g) => `<div class="stat kpi" style="--g:${g}"><b>${n}</b><span>${ic} ${t}</span></div>`;
    return `<div class="cards" style="margin-top:1.2rem;">${kp('🔥', hoyN, 'eventos activos hoy', '#e65100')}${kp('⏳', sem, 'inician en 7 días', '#007A78')}${kp('📢', novV, 'novedades vigentes', '#6a1b9a')}${kp('⏸️', sus, 'elementos suspendidos', '#b3261e')}${kp('🧩', sub.length, 'subcategorías en uso', '#AD1457')}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:1.2rem;margin-top:1.2rem;">
      <div class="caja"><h2>📈 Eventos por mes ${y}</h2><div class="barras-mes">${meses.map((n, m) => `<div title="${n} eventos"><i style="height:${n / mx * 100}%"></i><small>${MESES_C[m]}</small><b>${n || ''}</b></div>`).join('')}</div></div>
      <div class="caja"><h2>🍩 Por categoría</h2><div style="display:flex;gap:1.2rem;align-items:center;flex-wrap:wrap;"><div class="dona" style="background:conic-gradient(${cono})"><span>${tot === 1 && !porCat.length ? 0 : tot}</span></div><div style="flex:1;min-width:150px;font-size:.88rem;">${porCat.slice(0, 7).map(x => `<div style="display:flex;gap:.4rem;align-items:center;margin:.2rem 0;"><i style="width:11px;height:11px;border-radius:50%;background:${x.c.color}"></i>${esc(x.c.nombre)} <b style="margin-left:auto">${x.n}</b></div>`).join('')}</div></div></div>
      <div class="caja"><h2>🎓 Top facultades</h2>${porFac.map(x => `<div style="margin:.5rem 0;"><div style="display:flex;justify-content:space-between;font-size:.88rem;"><span>${esc(x.f.nombre)}</span><b>${x.n}</b></div><div style="height:8px;background:#e8efeb;border-radius:9px;overflow:hidden;"><i style="display:block;height:100%;width:${x.n / mf * 100}%;background:linear-gradient(90deg,var(--verde),var(--lima));border-radius:9px;"></i></div></div>`).join('')}</div>
      <div class="caja"><h2>🏢 Eventos por área</h2>${barrasX(porArea, x => emojiArea(x.a) + ' ' + esc(x.a.nombre))}</div>
      <div class="caja"><h2>🧩 Eventos por subcategoría</h2>${barrasX(sub, x => esc(x[0]))}</div>
      <div class="caja"><h2>📢 Novedades por tipo</h2>${barrasX(tn, x => esc(x[0]))}</div>
      ${tabla}
    </div>`;
  }

  function pResumen() {
    autoLimpiezaPrueba();
    const pub = D.eventos.filter(e => e.estado !== 'borrador'), bor = D.eventos.length - pub.length;
    const progs = D.facultades.reduce((n, f) => n + f.programas.length, 0);
    const h = hoy();
    const prox = pub.filter(e => finDe(e) >= h).sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(0, 5);
    const per = [...D.periodos].sort((a, b) => a.id.localeCompare(b.id));
    const barras = per.map(p => {
      const L = D.eventos.filter(e => e.periodo === p.id), tot = L.length || 1;
      const segs = D.categorias.map(c => { const n = L.filter(e => e.categoria === c.id).length; return n ? `<i style="display:block; height:100%; width:${n / tot * 100}%; background:${c.color}" title="${esc(c.nombre)}: ${n}"></i>` : ''; }).join('');
      return `<div style="margin-bottom:1rem;"><div style="display:flex; justify-content:space-between; font-weight:600; font-size:.92rem; margin-bottom:.3rem; color:var(--tinta);"><span>${nombrePeriodo(p.id)}</span><span>${L.length} eventos</span></div><div style="display:flex; height:14px; border-radius:999px; overflow:hidden; background:var(--fondo);">${segs}</div></div>`;
    }).join('');
    return encabezado(`${FLATICONS.chart} Resumen`, DESC_ROL[USUARIO_ACTUAL.rol] || 'Una mirada rápida a cómo está el calendario hoy.') + `
    <div class="cards">
      <div class="stat verde"><b>${pub.length}</b><span>${FLATICONS.check} eventos publicados</span></div>
      <div class="stat"><b>${bor}</b><span>${FLATICONS.documento} borradores</span></div>
      <div class="stat"><b>${D.periodos.length}</b><span>${FLATICONS.calendario} semestres creados</span></div>
      <div class="stat"><b>${D.facultades.length}</b><span>${FLATICONS.birrete} facultades · ${progs} programas</span></div>
    </div>
    <div style="display:grid; grid-template-columns:1.2fr 1fr; gap:1.2rem;">
      <div class="caja"><h2>${FLATICONS.chart} Eventos por semestre</h2>${barras || '<p style="text-align:center; color:var(--suave);">Aún no hay semestres.</p>'}</div>
      <div><div class="caja"><h2>${FLATICONS.calendario} Próximas fechas</h2>${prox.map(e => `<div style="display:flex; gap:.8rem; padding:.55rem 0; border-top:1px solid var(--linea); font-size:.9rem; color:var(--tinta);"><b style="min-width:84px; color:var(--verde);">${fmtRango(e)}</b><span>${esc(tituloInteligente(e))}</span></div>`).join('') || '<p style="text-align:center; color:var(--suave);">Sin fechas próximas.</p>'}</div></div>
    </div>
    ${resumenExtra()}
    ${puede('crear') && !esDocenteOAdmin() ? `<button class="btn pri" data-a="nuevo" style="margin-top:1rem;">${FLATICONS.documento} Agregar evento</button>` : ''}`;
  }

  function pEventos() {
    const pers = [...new Set(D.eventos.map(e => e.periodo))].sort().reverse();
    let g = '<option value="">Todas las facultades y áreas</option><option value="inst">Toda la institución</option><optgroup label="Facultades">' + D.facultades.map(f => opt('f:' + f.id, emojiFac(f) + ' ' + f.nombre)).join('') + '</optgroup><optgroup label="Áreas">' + D.areas.map(a => opt('a:' + a.id, emojiArea(a) + ' ' + a.nombre)).join('') + '</optgroup>';
    return encabezado(`${FLATICONS.calendario} Eventos`, { admin: 'Aquí agregas, editas y organizas todas las fechas.', creador: 'Aquí puedes crear eventos nuevos.', editor: 'Aquí puedes editar los eventos existentes.' }[USUARIO_ACTUAL.rol] || 'Eventos del calendario.') + `
    <div class="tools">
      <input type="search" id="x_q" placeholder="🔍 Buscar evento…">
      <select id="x_per"><option value="">Todos los semestres</option>${pers.map(p => opt(p, nombrePeriodo(p))).join('')}</select>
      <select id="x_cat"><option value="">Todas las categorías</option>${D.categorias.map(c => opt(c.id, c.nombre)).join('')}</select>
      <select id="x_grupo">${g}</select>
      <select id="x_est"><option value="">Todos los estados</option><option value="publicado">✅ Publicados</option><option value="borrador">📝 Borradores</option></select>
      <select id="x_niv"><option value="">Pregrado y posgrado</option><option value="pregrado">📘 Pregrado</option><option value="posgrado">🎓 Posgrado</option></select>
      <label class="fl-fecha">Desde <input type="date" id="x_desde"></label><label class="fl-fecha">Hasta <input type="date" id="x_hasta"></label>
      <select id="x_ord"><option value="">⬆ Más próximos primero</option><option value="desc">⬇ Más lejanos primero</option></select>
      <button class="btn sm" data-a="limpiarF">🧹 Limpiar filtros</button>
      ${puede('crear') && !esDocenteOAdmin() ? `<button class="btn pri" data-a="nuevo">${FLATICONS.documento} Nuevo evento</button>` : ''}
    </div>
    <div id="masiva"></div><div class="tw" id="tabla"></div>`;
  }
  
  function eventosFiltrados() {
    const q = norm(F.q);
    return D.eventos.filter(e => {
      if (!esAdminAct()) {
        const susAreas = USUARIO_ACTUAL.areas || [];
        if (susAreas.length > 0) {
          const misFacs = susAreas.filter(x => x.startsWith('f:')).map(x => x.slice(2));
          const misAreasL = susAreas.filter(x => x.startsWith('a:')).map(x => x.slice(2));
          const coincide = (e.facultad || []).some(f => misFacs.includes(f)) || (e.programa || []).some(pp => susAreas.includes('p:' + pp)) || (e.area || []).some(a => misAreasL.includes(a));
          if (!coincide) return false;
        }
      }
      if (F.per && e.periodo !== F.per && !(e.periodo2 && e.periodo2 === F.per)) return false;
      if (F.cat && e.categoria !== F.cat) return false;
      if (F.desde && finDe(e) < F.desde) return false;
      if (F.hasta && e.inicio > F.hasta) return false;
      if (F.niv && !String(obtenerSufijoNivel(e) || '').includes(F.niv)) return false;
      if (F.est && (e.estado || 'publicado') !== F.est) return false;
      if (F.grupo === 'inst' && !esInstitucional(e)) return false;
      const facs = e.facultad || [], areas = e.area || [];
      if (F.grupo.startsWith('f:') && !facs.includes(F.grupo.slice(2))) return false;
      if (F.grupo.startsWith('a:') && !areas.includes(F.grupo.slice(2))) return false;
      if (q && !norm(tituloInteligente(e) + ' ' + e.titulo + ' ' + e.descripcion + ' ' + ambito(D, e)).includes(q)) return false;
      return true;
    }).sort((a, b) => F.ord === 'desc' ? b.inicio.localeCompare(a.inicio) : a.inicio.localeCompare(b.inicio));
  }
  
  window.abrirEdicionMasiva = function() {
    const ids = [...SEL].map(id => D.eventos.find(x => x.id === id)).filter(e => e && puedeEnEvento(e)).map(e => e.id);
    if (!ids.length) return toast('Selecciona al menos un evento', true);
    const fila = (k, t, campo) => `<div style="display:grid;grid-template-columns:auto 1fr;gap:.6rem;align-items:start;margin-bottom:.8rem;"><label style="font-weight:700;display:flex;gap:.4rem;align-items:center;white-space:nowrap;"><input type="checkbox" id="me_c_${k}"> ${t}</label>${campo}</div>`;
    const css = 'width:100%;padding:.45rem .6rem;border:1px solid var(--linea);border-radius:8px;';
    const ov = document.createElement('div'); ov.id = 'me_ov';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,40,36,.55);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;';
    ov.innerHTML = `<div style="background:#fff;border-radius:20px;max-width:560px;width:100%;max-height:90vh;overflow:auto;padding:1.5rem;box-shadow:0 30px 60px -20px rgba(0,0,0,.5);animation:panelIn .3s ease-out;">
      <h2 style="font-family:var(--display);margin:0 0 .3rem;">✏️ Editar ${ids.length} evento${ids.length > 1 ? 's' : ''}</h2>
      <p style="color:var(--suave);margin:0 0 1rem;font-size:.9rem;">Marca solo lo que quieres cambiar; se aplicará a todos los seleccionados.</p>
      ${fila('tit', 'Nombre', `<input id="me_tit" placeholder="Nuevo nombre para todos" style="${css}">`)}
      ${fila('pre', 'Agregar al nombre', `<div style="display:flex;gap:.5rem;"><input id="me_pre" placeholder="Prefijo" style="${css}"><input id="me_suf" placeholder="Sufijo (ej. pregrado)" style="${css}"></div>`)}
      ${fila('des', 'Descripción', `<textarea id="me_des" rows="2" style="${css}"></textarea>`)}
      ${fila('fec', 'Fechas', `<div style="display:flex;gap:.5rem;"><input type="date" id="me_fi" style="${css}"><input type="date" id="me_ff" style="${css}"></div>`)}
      ${fila('pis', 'Piso / Salón', `<input id="me_pis" style="${css}">`)}
      ${fila('cat', 'Categoría', `<select id="me_cat" style="${css}">${D.categorias.map(c => opt(c.id, c.nombre, false)).join('')}</select>`)}
      ${fila('sub', 'Subcategoría', `<input id="me_sub" placeholder="Ej: Directivo (vacío = quitar)" style="${css}">`)}
      ${fila('est', 'Estado', `<select id="me_est" style="${css}">${opt('publicado', 'Publicado', true)}${opt('borrador', 'Borrador', false)}</select>`)}
      ${fila('fac', 'Facultades', `<select id="me_fac" multiple size="6" style="${css}">${D.facultades.map(f => opt(f.id, f.nombre, false)).join('')}</select>`)}
      ${fila('hor', 'Horario', `<div style="display:flex;gap:.5rem;"><input type="time" id="me_hi" style="${css}"><input type="time" id="me_hf" style="${css}"></div>`)}
      ${fila('lug', 'Lugar', `<input id="me_lug" style="${css}">`)}
      ${fila('enl', 'Enlace', `<input id="me_enl" placeholder="https://..." style="${css}">`)}
      <div style="display:flex;gap:.6rem;justify-content:flex-end;margin-top:1rem;"><button class="btn" id="me_cancel">Cancelar</button><button class="btn pri" id="me_ok">Aplicar a ${ids.length}</button></div></div>`;
    document.body.appendChild(ov);
    $('#me_cancel').onclick = () => ov.remove();
    $('#me_ok').onclick = async () => {
      const on = k => $('#me_c_' + k).checked, row = {};
      if (on('cat')) row.categoria_id = $('#me_cat').value;
      if (on('sub')) row.subcategoria = $('#me_sub').value.trim() || null;
      if (on('est')) row.estado = $('#me_est').value;
      if (on('hor')) { row.hora_inicio = $('#me_hi').value || null; row.hora_fin = $('#me_hf').value || null; }
      if (on('lug')) row.lugar = $('#me_lug').value.trim();
      if (on('enl')) { const u = normalizarEnlace($('#me_enl').value); if ($('#me_enl').value.trim() && !u) return toast('El enlace no es válido', true); row.enlace = u; }
      if (on('des')) row.descripcion = $('#me_des').value.trim();
      if (on('pis')) row.piso = $('#me_pis').value.trim();
      if (on('tit') && $('#me_tit').value.trim()) row.titulo = $('#me_tit').value.trim();
      const porEvento = on('pre') || on('fec');
      const facs = on('fac') ? [...$('#me_fac').selectedOptions].map(o => o.value) : null;
      if (!Object.keys(row).length && facs === null && !porEvento) return toast('Marca al menos un campo para cambiar', true);
      $('#me_ok').disabled = true;
      try {
        if (porEvento) {
          const pre = on('pre') ? $('#me_pre').value.trim() : '', suf = on('pre') ? $('#me_suf').value.trim() : '';
          for (const eid of ids) {
            const ev = D.eventos.find(x => x.id === eid), r1 = { ...row, updated_at: new Date().toISOString() };
            if (!on('tit')) r1.titulo = ev.titulo;
            if (on('pre')) r1.titulo = [pre, r1.titulo, suf].filter(Boolean).join(' ');
            if (on('fec')) { const fi = $('#me_fi').value || ev.inicio, ff = $('#me_ff').value || (ev.fin && ev.fin >= fi ? ev.fin : fi); r1.fecha_inicio = fi; r1.fecha_fin = ff; const ps = periodosDeRango(fi, ff); r1.periodo_id = ps[0]; r1.periodo2_id = ps.length > 1 ? ps[ps.length - 1] : null; }
            const u = await dbClient.from('eventos').update(r1).eq('id', eid); if (u.error) throw u.error;
          }
        } else if (Object.keys(row).length) { row.updated_at = new Date().toISOString(); const r = await enLotes(ids, c => dbClient.from('eventos').update(row).in('id', c)); if (r.error) throw r.error; }
        if (facs !== null) {
          const d = await enLotes(ids, c => dbClient.from('evento_facultades').delete().in('evento_id', c)); if (d.error) throw d.error;
          if (facs.length) { const i2 = await dbClient.from('evento_facultades').insert(ids.flatMap(eid => facs.map(f => ({ evento_id: eid, facultad_id: f })))); if (i2.error) throw i2.error; }
        }
        registrarLog('Editó eventos masivamente', `${ids.length} eventos`);
        const nd = await leerNube(); if (nd) D = nd; ov.remove(); SEL.clear(); pintarTabla(); toast(`✅ ${ids.length} eventos actualizados`);
      } catch (err) { $('#me_ok').disabled = false; toast('Error: ' + (err.message || err), true); }
    };
  };

  function barraMasiva(L, pEd, pElim) {
    const n = SEL.size, nF = L.filter(puedeEnEvento).length;
    return `<div class="masiva-bar">${n ? `<b class="masiva-n">${n} seleccionado${n > 1 ? 's' : ''}</b>` : `<span class="masiva-n suave">${nF} evento${nF === 1 ? '' : 's'} en la lista</span>`}
      ${pEd && n ? `<button class="btn sm pri" data-a="m_edit">✏️ Editar seleccionados</button><button class="btn sm" data-a="m_pub">${FLATICONS.check} Publicar</button><button class="btn sm" data-a="m_bor">${FLATICONS.documento} Pasar a borrador</button>` : ''}
      ${pElim && n ? `<button class="btn sm warn" data-a="m_del">${FLATICONS.basura} Eliminar seleccionados (${n})</button>` : ''}
      ${pElim && nF ? `<button class="btn sm peligro" data-a="m_delall">${FLATICONS.basura} Eliminar todos (${nF})</button>` : ''}</div>`;
  }

  function pintarTabla() {
    ['q', 'per', 'cat', 'grupo', 'est'].forEach(k => { const el = $('#x_' + k); if (el) el.value = F[k]; });
    const L = eventosFiltrados();
    const pEd = puede('editar'), pEl = puede('eliminar');
    const pElim = puede('eliminar');
    $('#masiva').innerHTML = (pEd && SEL.size) || (pElim && L.length) ? barraMasiva(L, pEd, pElim) : '';
    const _vieja = pEd && SEL.size ? `<div class="masiva" style="margin-bottom:0.8rem; padding:0.6rem; background:#fff; border:1px solid var(--linea); border-radius:10px; display:flex; gap:0.5rem; align-items:center; color:var(--tinta);"><b>${SEL.size} seleccionado${SEL.size > 1 ? 's' : ''}</b><button class="btn sm" data-a="m_pub">${FLATICONS.check} Publicar</button><button class="btn sm" data-a="m_bor">${FLATICONS.documento} Pasar a borrador</button></div>` : '';
    $('#tabla').innerHTML = L.length ? `<table><thead><tr>${pEd ? `<th><input type="checkbox" data-ch="todos" ${L.filter(puedeEnEvento).every(e => SEL.has(e.id)) ? 'checked' : ''}></th>` : ''}<th>Fecha</th><th>Evento</th><th>Dirigido a</th><th>Semestre</th><th>Estado</th><th></th></tr></thead><tbody>` +
      L.map(e => `<tr>${pEd ? `<td>${puedeEnEvento(e) ? `<input type="checkbox" data-ch="sel" data-i="${e.id}" ${SEL.has(e.id) ? 'checked' : ''}>` : ''}</td>` : ''}<td style="white-space:nowrap">${fmtRango(e)}</td><td><div class="tt">${esc(tituloInteligente(e))}</div>${chipCatAdmin(e.categoria)}</td><td>${esc(ambito(D, e))}</td><td style="white-space:nowrap">${nombrePeriodo(e.periodo)}${e.periodo2 ? ' y ' + nombrePeriodo(e.periodo2) : ''}${!eventoVisiblePublico(e) ? ' <span class="chip" title="Semestre suspendido">⏸</span>' : ''}</td><td>${pEd && puedeEnEvento(e) ? `<button class="est ${e.estado === 'borrador' ? 'bor' : 'pub'}" data-a="tog" data-i="${e.id}">${e.estado === 'borrador' ? '📝 Borrador' : '✅ Publicado'}</button>` : `<span class="est ${e.estado === 'borrador' ? 'bor' : 'pub'}" style="cursor:default">${e.estado === 'borrador' ? '📝 Borrador' : '✅ Publicado'}</span>`}</td><td><div class="acc"><button class="btn sm" data-a="hist" data-i="${e.id}" title="Historial de versiones">🕘</button>${pEd && puedeEnEvento(e) ? `<button class="btn sm" data-a="editar" data-i="${e.id}">${FLATICONS.editar} Editar</button>` : ''}${puede('crear') && puedeEnEvento(e) ? `<button class="btn sm" data-a="dup" data-i="${e.id}" title="Crear copia">📄 Duplicar</button>` : ''}${pEl && puedeEnEvento(e) ? `<button class="btn sm pel" data-a="del" data-i="${e.id}">${FLATICONS.basura} Eliminar</button>` : ''}</div></td></tr>`).join('') + '</tbody></table>'
      : '<div style="text-align:center; color:var(--suave); padding:2.5rem 1rem;">No hay eventos con estos filtros.</div>';
  }

  let DUP = null;
  const tomarDup = () => { const d = DUP; DUP = null; return d; };

  function modalEvento(id) {
    if (id) { const o0 = D.eventos.find(x => x.id === id); if (o0 && !puedeEnEvento(o0)) return sinArea(); }
    const e = id ? (tomarRestaurar(id) || D.eventos.find(x => x.id === id)) : DUP ? tomarDup() : {
      titulo: '', descripcion: '', categoria: D.categorias[0]?.id || 'general', inicio: hoy(), fin: '', periodo: 'auto',
      horaInicio: '', horaFin: '',
      facultad: [], programa: [], area: [], publico: [], lugar: '', lugarEsp: '', piso: '', enlace: '', estado: 'publicado'
    };
    const arrFac = Array.isArray(e.facultad) ? e.facultad : (e.facultad ? [e.facultad] : []);
    const arrProg = Array.isArray(e.programa) ? e.programa : (e.programa ? [e.programa] : []);
    const arrArea = Array.isArray(e.area) ? e.area : (e.area ? [e.area] : []);
    const arrPub = Array.isArray(e.publico) ? e.publico : (e.publico ? [e.publico] : ['Comunidad universitaria']);
    const pers = D.periodos.map(p => p.id);
    if (e.periodo !== 'auto' && !pers.includes(e.periodo)) pers.push(e.periodo);
    const lugaresConExtra = ['Sede Chía', 'Otro', 'Sistema Académico en Línea (SALA)', 'SAUCE'];
    const esLugarEspecial = lugaresConExtra.includes(e.lugar);

    $('#modal').innerHTML = `<div class="mod">
      <h2>${id ? `${FLATICONS.editar} Editar evento` : `${FLATICONS.documento} Nuevo evento`}</h2>
      
      <div class="fr">
        <label>¿Qué pasa? * <span style="font-weight:400; color:var(--suave);">(Escribe o elige una frase académica predeterminada)</span></label>
        <input id="f_titulo" list="frases_acad_list" value="${esc(e.titulo)}" placeholder="Ej: Inicio de prematrícula, Inicio de clases, Cambios de grupo...">
        <datalist id="frases_acad_list">
          ${FRASES_ACADEMICAS.map(f => `<option value="${esc(f)}">`).join('')}
        </datalist>
        <div class="frases-sugeridas">
          ${['Inicio de clases', 'Inicio de prematrícula', 'Cambios de grupo', 'Matrícula ordinaria', 'Matrícula extraordinaria', 'Adición y cancelación de asignaturas', 'Entrega de notas finales', 'Grados solemnes'].map(f => `<button type="button" class="frase-chip" data-frase="${esc(f)}">${esc(f)}</button>`).join('')}
        </div>
        <div class="preview-titulo-box" id="f_titulo_preview_box">
          <span>✨ Vista previa del título público: <b id="f_titulo_preview">${esc(tituloInteligente(e) || '—')}</b></span>
          <button type="button" class="btn sm" id="btn_aplicar_sufijo" title="Integrar nivel directamente al texto">Aplicar nivel al texto</button>
        </div>
      </div>
      
      <div class="fr">
        <label>Nivel / modalidad del evento <span style="font-weight:400; color:var(--suave);">(se agrega al título: «Inicio de prematrícula pregrado»; marca ambos para «pregrado y posgrado»; sin marcar, se detecta por facultad o programa)</span></label>
        <div style="display:flex; gap:1.2rem; flex-wrap:wrap;">
          <label style="font-weight:600;"><input type="checkbox" id="f_niv_pre" onchange="actualizarPreviewTituloModal()" ${/pregrado/.test(norm(e.titulo || '')) ? 'checked' : ''}> 📘 Pregrado</label>
          <label style="font-weight:600;"><input type="checkbox" id="f_niv_pos" onchange="actualizarPreviewTituloModal()" ${/posgrado/.test(norm(e.titulo || '')) ? 'checked' : ''}> 🎓 Posgrado</label>
        </div>
      </div>

      <div class="fr"><label>Detalles</label><textarea id="f_desc" rows="3">${esc(e.descripcion)}</textarea></div>
      
      <div class="fr2">
        <div class="fr"><label>Categoría</label><select id="f_cat" onchange="actualizarPreviewTituloModal(); pintarSubcats()">${D.categorias.map(c => opt(c.id, c.nombre, c.id === e.categoria)).join('')}</select></div>
        <div class="fr"><label>Subcategoría <span style="font-weight:400; color:var(--suave);">(opcional)</span></label><select id="f_subcat" data-sel="${esc(e.subcategoria || '')}"></select></div>
        <div class="fr"><label>Semestre</label><select id="f_per">${opt('auto', 'Detectar por la fecha', e.periodo === 'auto')}${pers.sort().map(p => opt(p, nombrePeriodo(p) + (periodoActivo(p) ? '' : ' (suspendido)'), p === e.periodo)).join('')}</select><div id="f_per_hint" style="font-size:.82rem;margin-top:.4rem;color:var(--tinta);"></div></div>
      </div>
      
      <div class="fr2">
        <div class="fr"><label>Desde *</label><input type="date" id="f_ini" value="${e.inicio}"></div>
        <div class="fr"><label>Hasta</label><input type="date" id="f_fin" value="${e.fin && e.fin !== e.inicio ? e.fin : ''}"></div>
      </div>
      <div id="f_fechas_hint" style="font-size:.8rem;color:var(--suave);margin:-.4rem 0 .6rem;"></div>
      
      <div class="fr2">
        <div class="fr"><label>Hora inicio (Opcional)</label><input type="time" id="f_hora_ini" value="${e.horaInicio || ''}"></div>
        <div class="fr"><label>Hora fin (Opcional)</label><input type="time" id="f_hora_fin" value="${e.horaFin || ''}"></div>
      </div>
      
      <div class="fr">
        <label>Dirigido a (Selección múltiple)</label>
        <select id="f_pub" multiple class="multi-select" size="5">
          ${[...PUBLICOS_ROLES, ...arrPub.filter(x => !PUBLICOS_ROLES.includes(x))].map(p => `<option value="${esc(p)}" ${arrPub.includes(p) ? 'selected' : ''}>${emojiPub(p)} ${esc(p)}</option>`).join('')}
        </select>
      </div>
      
      <div class="fr">
        <label>Facultades (Selección múltiple)</label>
        <select id="f_fac" multiple class="multi-select" size="5" onchange="actualizarProgsModal(); actualizarPreviewTituloModal();">
          ${D.facultades.filter(verFac).map(f => `<option value="${f.id}" ${arrFac.includes(f.id) ? 'selected' : ''}>${emojiFac(f)} ${esc(f.nombre)}</option>`).join('')}
        </select>
      </div>
      
      <div class="fr">
        <label>Programas (Selección múltiple — detecta automáticamente pregrado / posgrado)</label>
        <select id="f_prog" multiple class="multi-select" size="5" onchange="actualizarPreviewTituloModal()"></select>
      </div>
      
      <div class="fr">
        <label>Áreas (Selección múltiple)</label>
        <select id="f_area" multiple class="multi-select" size="5">
          ${D.areas.filter(verArea).map(a => `<option value="${a.id}" ${arrArea.includes(a.id) ? 'selected' : ''}>${emojiArea(a)} ${esc(a.nombre)}</option>`).join('')}
        </select>
      </div>
      
      <div class="fr2">
        <div class="fr">
          <label>Bloque / Ubicación</label>
          <select id="f_lugar" onchange="toggleLugarEsp()">
            <option value="">-- Seleccionar --</option>
            <optgroup label="Bloques">
              ${['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'].map(l => `<option value="Bloque ${l}" ${e.lugar === 'Bloque ' + l ? 'selected' : ''}>Bloque ${l}</option>`).join('')}
            </optgroup>
            <optgroup label="Especiales">
              <option value="Auditorio Principal o Central" ${e.lugar === 'Auditorio Principal o Central' ? 'selected' : ''}>Auditorio Principal o Central</option>
              <option value="Auditorio Fundadores" ${e.lugar === 'Auditorio Fundadores' ? 'selected' : ''}>Auditorio Fundadores</option>
              <option value="Clínicas Odontológicas" ${e.lugar === 'Clínicas Odontológicas' ? 'selected' : ''}>Clínicas Odontológicas</option>
              <option value="Sistema Académico en Línea (SALA)" ${e.lugar === 'Sistema Académico en Línea (SALA)' ? 'selected' : ''}>Sistema Académico en Línea (SALA)</option>
              <option value="SAUCE" ${e.lugar === 'SAUCE' ? 'selected' : ''}>SAUCE</option>
              <option value="Sede Chía" ${e.lugar === 'Sede Chía' ? 'selected' : ''}>Sede Chía</option>
              <option value="Otro" ${e.lugar === 'Otro' ? 'selected' : ''}>Otro</option>
            </optgroup>
          </select>
        </div>
        <div class="fr" id="f_lugar_esp_wrap" ${esLugarEspecial ? '' : 'hidden'}>
          <label>Especifique ubicación</label>
          <input id="f_lugar_esp" value="${esc(e.lugarEsp || '')}" placeholder="Escriba el lugar...">
        </div>
      </div>
      
      <div class="fr2">
        <div class="fr"><label>Piso (Opcional)</label><input id="f_piso" value="${esc(e.piso || '')}" placeholder="Ej: Piso 2"></div>
        <div class="fr"><label>Enlace de reunión o página (Opcional)</label><input id="f_link" value="${esc(e.enlace)}" placeholder="https://..."></div>
      </div>
      
      <div class="fr">
        <label>Estado</label>
        <select id="f_estado">${opt('publicado', 'Publicado', e.estado !== 'borrador')}${opt('borrador', 'Borrador', e.estado === 'borrador')}</select>
      </div>
      
      <div style="display:flex; justify-content:flex-end; gap:.8rem; margin-top:1.5rem;">
        <button class="btn" data-a="cerrar">Cancelar</button>
        <button class="btn pri" data-a="guardarEv" data-i="${id || ''}">${FLATICONS.guardar} Guardar evento</button>
      </div>
    </div>`;

    $('#modal').classList.add('on');
    actualizarProgsModal(arrProg);
    actualizarPreviewTituloModal();
    ['f_titulo', 'f_desc'].forEach(i => $('#' + i).addEventListener('input', () => { aplicarModoFechas(); actualizarPreviewTituloModal(); }));
    $$('.frase-chip', $('#modal')).forEach(btn => {
      btn.addEventListener('click', () => {
        $('#f_titulo').value = btn.dataset.frase;
        aplicarModoFechas();
        actualizarPreviewTituloModal();
        $('#f_titulo').focus();
      });
    });
    const btnApl = $('#btn_aplicar_sufijo');
    if (btnApl) {
      btnApl.addEventListener('click', () => {
        const prev = $('#f_titulo_preview').textContent;
        if (prev && prev !== '—') {
          $('#f_titulo').value = prev;
          actualizarPreviewTituloModal();
        }
      });
    }
    aplicarModoFechas();
    setTimeout(() => $('#f_titulo').focus(), 50);
  }

  function periodosDeRango(ini, fin) {
    if (!ini) return [];
    fin = fin && fin >= ini ? fin : ini;
    const a = periodoAuto(D, ini), b = periodoAuto(D, fin);
    const [ya, sa] = a.split('-').map(Number), [yb, sb] = b.split('-').map(Number);
    const out = []; let y = ya, h = sa, guard = 0;
    while ((y < yb || (y === yb && h <= sb)) && guard++ < 12) { out.push(y + '-' + h); if (h === 1) h = 2; else { h = 1; y++; } }
    return out.length ? out : [a];
  }
  window.actualizarHintPeriodo = function() {
    const hint = $('#f_per_hint'); if (!hint) return;
    const ini = $('#f_ini').value, fin = $('#f_fin').value;
    if (!ini && !fin) { hint.innerHTML = ''; return; }
    const ps = periodosDeRango(ini || fin, fin || ini), sel = $('#f_per').value;
    const manual = sel !== 'auto' && !ps.includes(sel);
    hint.innerHTML = `<span style="display:inline-flex;gap:.35rem;flex-wrap:wrap;align-items:center;">🎯 Semestre${ps.length > 1 ? 's' : ''} detectado${ps.length > 1 ? 's' : ''}: ${ps.map(p => `<b style="background:var(--verde);color:#fff;padding:.1rem .55rem;border-radius:99px;">${esc(nombrePeriodo(p))}</b>`).join('')}</span>${manual ? `<div style="color:var(--rojo);margin-top:.25rem;">⚠ Elegiste otro semestre manualmente; elige «Detectar por la fecha» para usar el detectado.</div>` : ''}`;
  };
  document.addEventListener('input', ev => { if (ev.target && (ev.target.id === 'f_ini' || ev.target.id === 'f_fin' || ev.target.id === 'f_per')) actualizarHintPeriodo(); });
  document.addEventListener('change', ev => { if (ev.target && ev.target.id === 'f_ini' || ev.target.id === 'f_fin') { const sp = $('#f_per'); if (sp && sp.value !== 'auto' && !periodosDeRango($('#f_ini').value, $('#f_fin').value).includes(sp.value)) sp.value = 'auto'; actualizarHintPeriodo(); } });

  function subcatsDe(id) { const c = D.categorias.find(x => x.id === id); const v = c && c.subcategorias; return Array.isArray(v) ? v : (typeof v === 'string' && v ? v.split(',').map(x => x.trim()).filter(Boolean) : []); }
  window.pintarSubcats = function() {
    const sel = $('#f_subcat'); if (!sel) return;
    const lista = subcatsDe($('#f_cat').value), actual = sel.dataset.sel || sel.value;
    sel.innerHTML = '<option value="">— Sin subcategoría —</option>' + lista.map(x => `<option value="${esc(x)}" ${x === actual ? 'selected' : ''}>${esc(x)}</option>`).join('');
    sel.dataset.sel = ''; sel.closest('.fr').style.display = lista.length ? '' : 'none';
  };
  setTimeout(() => new MutationObserver(() => { const s2 = document.querySelector('#f_subcat'); if (s2 && !s2.dataset.init) { s2.dataset.init = 1; pintarSubcats(); actualizarHintPeriodo(); } }).observe(document.body, { childList: true, subtree: true }), 0);

  function nivelesMarcados() {
    const n = [];
    if ($('#f_niv_pre') && $('#f_niv_pre').checked) n.push('pregrado');
    if ($('#f_niv_pos') && $('#f_niv_pos').checked) n.push('posgrado');
    return n;
  }

  window.actualizarPreviewTituloModal = function() {
    const titEl = $('#f_titulo');
    const prevEl = $('#f_titulo_preview');
    if (!titEl || !prevEl) return;
    const mockEv = {
      titulo: titEl.value.trim(),
      categoria: $('#f_cat') ? $('#f_cat').value : '',
      facultad: $('#f_fac') ? [...$('#f_fac').selectedOptions].map(o => o.value) : [],
      programa: $('#f_prog') ? [...$('#f_prog').selectedOptions].map(o => o.value) : [],
      nivel: nivelesMarcados()
    };
    prevEl.textContent = tituloInteligente(mockEv) || '—';
  };

  window.actualizarProgsModal = function(preseleccionados = []) {
    const selectedFacs = [...$('#f_fac').selectedOptions].map(o => o.value);
    const progsDisponibles = [];
    selectedFacs.forEach(fid => {
      const f = D.facultades.find(x => x.id === fid);
      if (f) f.programas.filter(p => verProg(f, p)).forEach(p => progsDisponibles.push({ id: p.id, nombre: p.nombre, nivel: p.nivel, fac: f.nombre }));
    });
    const renderOpt = (p, sel) => `<option value="${p.id}" ${sel ? 'selected' : ''}>${esc(p.nombre)} (${p.nivel === 'posgrado' ? 'Posgrado' : 'Pregrado'})</option>`;
    if (preseleccionados.length) {
      $('#f_prog').innerHTML = progsDisponibles.map(p => renderOpt(p, preseleccionados.includes(p.id))).join('');
    } else {
      const currentProgs = [...$('#f_prog').selectedOptions].map(o => o.value);
      $('#f_prog').innerHTML = progsDisponibles.map(p => renderOpt(p, currentProgs.includes(p.id))).join('');
    }
  }

  window.toggleLugarEsp = function() {
    const val = $('#f_lugar').value;
    $('#f_lugar_esp_wrap').hidden = !['Sede Chía', 'Otro', 'Sistema Académico en Línea (SALA)', 'SAUCE'].includes(val);
  }

  const cerrarModal = () => { $('#modal').classList.remove('on'); $('#modal').innerHTML = ''; };

  const RX_INICIO = /\b(inici\w*|comienz\w*|empiez\w*|empieza\w*|apertur\w*|abre|abren|arranc\w*)\b/;
  const RX_FIN = /\b(fin|finaliz\w*|termin\w*|cierr\w*|cierre|culmin\w*|venc\w*)\b/;
  function modoFechas(txt) {
    const t = String(txt || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const i = RX_INICIO.test(t), f = RX_FIN.test(t);
    return i && f ? 'ambos' : i ? 'inicio' : f ? 'fin' : 'libre';
  }
  function aplicarModoFechas() {
    const m = modoFechas(($('#f_titulo').value || '') + ' ' + ($('#f_desc').value || ''));
    const cfg = {
      libre:  { ini: [true, true],  fin: [true, false] },
      inicio: { ini: [true, true],  fin: [false, false] },
      fin:    { ini: [false, false], fin: [true, true] },
      ambos:  { ini: [true, true],  fin: [true, true] }
    }[m];
    [['f_ini', 'Desde', cfg.ini], ['f_fin', 'Hasta', cfg.fin]].forEach(([id, nombre, [on, req]]) => {
      const inp = $('#' + id), lab = inp.closest('.fr').querySelector('label');
      if (!on && inp.value) { inp.dataset.prev = inp.value; inp.value = ''; }
      if (on && !inp.value && inp.dataset.prev) { inp.value = inp.dataset.prev; delete inp.dataset.prev; }
      inp.disabled = !on; inp.style.opacity = on ? '' : '.45';
      lab.textContent = nombre + (req ? ' *' : '');
    });
    $('#f_fechas_hint').textContent = {
      libre: '',
      inicio: 'El texto indica inicio: solo se pide la fecha «Desde».',
      fin: 'El texto indica finalización: solo se pide la fecha «Hasta».',
      ambos: 'El texto indica inicio y fin: se piden «Desde» y «Hasta».'
    }[m];
  }

  // ===== Historial de versiones y control de duplicados de eventos =====
  let RESTAURAR = null;
  const tomarRestaurar = id => { if (RESTAURAR && RESTAURAR.id === id) { const x = { ...D.eventos.find(e => e.id === id), ...RESTAURAR.datos }; RESTAURAR = null; return x; } return null; };
  const CAMPOS_EV = [['titulo', 'Título'], ['descripcion', 'Descripción'], ['categoria', 'Categoría'], ['subcategoria', 'Subcategoría'], ['inicio', 'Fecha de inicio'], ['fin', 'Fecha final'], ['horaInicio', 'Hora de inicio'], ['horaFin', 'Hora final'], ['lugar', 'Lugar'], ['lugarEsp', 'Lugar específico'], ['piso', 'Piso / salón'], ['enlace', 'Enlace'], ['estado', 'Estado'], ['facultad', 'Facultades'], ['programa', 'Programas'], ['area', 'Áreas'], ['publico', 'Dirigido a']];
  const snapEv = e => { const o = {}; CAMPOS_EV.forEach(([k]) => { const v = e[k]; o[k] = Array.isArray(v) ? v.map(String).sort() : (v ?? ''); }); if (!o.fin) o.fin = o.inicio; return o; };
  const valTxt = (k, v) => k === 'categoria' ? ((D.categorias.find(c => c.id === v) || {}).nombre || v) : Array.isArray(v) ? (v.map(x => k === 'facultad' ? ((D.facultades.find(f => String(f.id) === x) || {}).nombre || x) : x).join(', ') || '—') : (v === '' ? '—' : String(v));
  const difEv = (a, b) => CAMPOS_EV.filter(([k]) => JSON.stringify(a[k] ?? '') !== JSON.stringify(b[k] ?? '')).map(([k, l]) => ({ k, l, antes: valTxt(k, a[k]), despues: valTxt(k, b[k]) }));
  const claveEv = e => { const x = snapEv(e); return JSON.stringify([norm(x.titulo), norm(x.descripcion), x.categoria, norm(x.subcategoria), x.inicio, x.fin, x.horaInicio, x.horaFin, norm(x.lugar), norm(x.lugarEsp), norm(x.piso), String(x.enlace).trim(), x.facultad, x.programa, x.area, x.publico]); };
  async function registrarVersion(evId, prev, nuevo, accion) {
    try {
      const c = await dbClient.from('evento_historial').select('id', { count: 'exact', head: true }).eq('evento_id', evId);
      if (c.error) return; let n = c.count || 0;
      if (!n && prev) { await dbClient.from('evento_historial').insert([{ evento_id: evId, version: 1, accion: 'original', usuario: 'Antes de los cambios', resumen: 'Estado inicial', datos: snapEv(prev) }]); n = 1; }
      const cambios = prev ? difEv(snapEv(prev), snapEv(nuevo)).map(x => x.l) : [];
      await dbClient.from('evento_historial').insert([{ evento_id: evId, version: n + 1, accion, usuario: USUARIO_ACTUAL ? USUARIO_ACTUAL.nombre : '', resumen: cambios.join(', '), datos: snapEv(nuevo) }]);
    } catch (_) {}
  }
  window.abrirHistorial = async function(id) {
    const ev = D.eventos.find(x => x.id === id); if (!ev) return;
    const r = await dbClient.from('evento_historial').select('*').eq('evento_id', id).order('version', { ascending: true });
    const ov = document.createElement('div'); ov.className = 'ov-modal';
    const rows = r.data || [], act = JSON.stringify(snapEv(ev));
    const ic = { original: '📄 Original', creado: '🆕 Creado', editado: '✏️ Editado', restaurado: '↩️ Restaurado' };
    const items = rows.map((h, i) => { const dif = i ? difEv(rows[i - 1].datos, h.datos) : []; const esAct = JSON.stringify(snapEv(h.datos)) === act;
      return `<div class="ver-it ${esAct ? 'act' : ''}"><div class="ver-top"><b class="ver-n">v${h.version}</b><span>${ic[h.accion] || h.accion}</span><span class="ver-f">${esc(new Date(h.created_at).toLocaleString('es-CO'))}</span><span>👤 ${esc(h.usuario || '—')}</span>${esAct ? '<span class="badge" style="background:#E3F6E8;color:#1B6B34;">✅ Versión actual</span>' : `<button class="btn sm pri" data-rv="${i}" style="margin-left:auto;">↩ Restaurar</button>`}</div>${dif.length ? '<ul>' + dif.map(d => `<li><b>${esc(d.l)}:</b> <s>${esc(d.antes)}</s> → ${esc(d.despues)}</li>`).join('') + '</ul>' : `<div class="ver-s">${h.accion === 'creado' ? 'Evento creado' : esc(h.resumen || 'Sin cambios en los campos')}</div>`}</div>`; }).reverse().join('');
    ov.innerHTML = `<div class="ov-box"><h2 style="font-family:var(--display);margin:0 0 .2rem;">🕘 Historial de versiones</h2><p style="color:var(--suave);margin:0 0 1rem;font-size:.9rem;">${esc(ev.titulo)} · ${esc(ev.inicio)}</p>${r.error ? '<p>Falta crear la tabla del historial. Ejecuta <b>supabase_actualizacion_5.sql</b> en Supabase.</p>' : (items || '<p>Este evento aún no tiene cambios registrados. El historial empieza con la próxima modificación.</p>')}<div style="text-align:right;margin-top:1rem;"><button class="btn" id="hv_close">Cerrar</button></div></div>`;
    document.body.appendChild(ov); $('#hv_close').onclick = () => ov.remove();
    ov.querySelectorAll('[data-rv]').forEach(b => b.onclick = () => { const h = rows[+b.dataset.rv]; RESTAURAR = { id, datos: h.datos }; window._restauradoId = id; ov.remove(); toast('Revisa los datos de la versión v' + h.version + ' y pulsa Guardar para restaurarla'); modalEvento(id); });
  };

  async function guardarEvento(id) {
    if (id ? !puede('editar') : !puede('crear')) return sinPermiso();
    if (id) { const o0 = D.eventos.find(x => x.id === id); if (o0 && !puedeEnEvento(o0)) return sinArea(); }
    const g = i => $('#' + i).value.trim();
    const tituloRaw = g('f_titulo');
    const modo = modoFechas(tituloRaw + ' ' + g('f_desc'));
    let inicio = g('f_ini'), fin = g('f_fin') || inicio;
    if (modo === 'fin') { inicio = fin = g('f_fin'); }
    else if (modo === 'inicio') { fin = inicio; }
    if (!tituloRaw) return toast('Escribe el nombre del evento', true);
    if (modo === 'fin' && !fin) return toast('Falta la fecha «Hasta» (el evento indica finalización)', true);
    if (modo === 'ambos' && !g('f_fin')) return toast('Falta la fecha «Hasta» (el evento indica inicio y fin)', true);
    if (!inicio) return toast('Falta la fecha de inicio', true);
    if (fin < inicio) return toast('La fecha final no puede ser antes', true);
    const publico = [...$('#f_pub').selectedOptions].map(o => o.value);
    const facultad = [...$('#f_fac').selectedOptions].map(o => o.value);
    const programa = [...$('#f_prog').selectedOptions].map(o => o.value);
    const area = [...$('#f_area').selectedOptions].map(o => o.value);
    if (!puedeEnEvento({ facultad, programa, area })) return toast('Asigna el evento solo a tus facultades, programas o áreas asignadas (al menos una)', true);
    let periodo = g('f_per'), periodo2 = null;
    if (periodo === 'auto') { const ps = periodosDeRango(inicio, fin); periodo = ps[0]; if (ps.length > 1) periodo2 = ps[ps.length - 1]; }
    const lugar = g('f_lugar');
    const enlace = normalizarEnlace(g('f_link'));
    if (g('f_link') && !enlace) return toast('El enlace no es válido. Ej: https://meet.google.com/abc-defg-hij', true);
    const lugarEsp = ['Sede Chía', 'Otro', 'Sistema Académico en Línea (SALA)', 'SAUCE'].includes(lugar) ? g('f_lugar_esp') : '';
    const titulo = tituloInteligente({ titulo: tituloRaw, categoria: g('f_cat'), facultad, programa, nivel: nivelesMarcados() });
    const o = { id: id || uid(), titulo, descripcion: g('f_desc'), categoria: g('f_cat'), subcategoria: g('f_subcat'), inicio, fin, periodo, periodo2, horaInicio: g('f_hora_ini'), horaFin: g('f_hora_fin'), facultad, programa, area, publico, lugar, lugarEsp, piso: g('f_piso'), enlace, estado: g('f_estado') };
    const dup = D.eventos.find(x => x.id !== o.id && claveEv(x) === claveEv(o));
    if (dup) return toast(`Ya existe un evento idéntico: «${dup.titulo}» (${dup.inicio}). Cambia algún dato —por ejemplo «Dirigido a»— para poder guardarlo.`, true);
    const prevEv = id ? D.eventos.find(x => x.id === id) : null, accionH = id ? (window._restauradoId === id ? 'restaurado' : 'editado') : 'creado'; window._restauradoId = null;
    let avisoCols = [];
    try {
      if (DB_READY) {
        const payload = { ...marcaPrueba(), titulo: o.titulo, descripcion: o.descripcion, categoria_id: o.categoria, subcategoria: o.subcategoria || null, periodo_id: o.periodo, periodo2_id: o.periodo2, fecha_inicio: o.inicio, fecha_fin: o.fin, hora_inicio: o.horaInicio || null, hora_fin: o.horaFin || null, lugar: o.lugar, lugar_especifico: o.lugarEsp, piso: o.piso, enlace: o.enlace, estado: o.estado, updated_at: new Date().toISOString() };
        if (id) payload.id = id;
        let ev = null;
        for (let intento = 0; intento < 5 && !ev; intento++) {
          const r = await dbClient.from('eventos').upsert([payload]).select().single();
          if (!r.error) { ev = r.data; break; }
          const m = /Could not find the '([^']+)' column of 'eventos'/.exec(r.error.message || '');
          if (!m || !(m[1] in payload)) throw r.error;
          delete payload[m[1]]; avisoCols.push(m[1]);
        }
        if (!ev) throw new Error('No se pudo guardar el evento');
        await dbClient.from('evento_facultades').delete().eq('evento_id', ev.id);
        await dbClient.from('evento_programas').delete().eq('evento_id', ev.id);
        await dbClient.from('evento_areas').delete().eq('evento_id', ev.id);
        await dbClient.from('evento_publicos').delete().eq('evento_id', ev.id);
        if (facultad.length) await dbClient.from('evento_facultades').insert(facultad.map(f => ({ evento_id: ev.id, facultad_id: f })));
        if (programa.length) await dbClient.from('evento_programas').insert(programa.map(p => ({ evento_id: ev.id, programa_id: p })));
        if (area.length) await dbClient.from('evento_areas').insert(area.map(a => ({ evento_id: ev.id, area_id: a })));
        if (publico.length) await dbClient.from('evento_publicos').insert(publico.map(p => ({ evento_id: ev.id, publico: p })));
        await registrarVersion(ev.id, prevEv, o, accionH);
        registrarLog(id ? 'Editó evento' : 'Creó evento', titulo);
        const nuevosDatos = await leerNube(); if (nuevosDatos) D = nuevosDatos;
      }
      toast(avisoCols.length ? `Evento guardado, pero sin: ${avisoCols.join(', ')}. Ejecuta el SQL de actualización en Supabase.` : `${FLATICONS.check} Evento guardado`, !!avisoCols.length); cerrarModal(); refrescar();
    } catch (e) { console.error(e); toast('Error al guardar: ' + (e.message || 'revisa la conexión'), true); }
  }

  async function eliminarEventoAdmin(id) {
    if (!puede('eliminar')) return sinPermiso();
    const ev0 = D.eventos.find(x => x.id === id); if (ev0 && !puedeEnEvento(ev0)) return sinArea();
    if (!confirm('¿Eliminar este evento?')) return;
    const e = D.eventos.find(x => x.id === id);
    if (DB_READY) { const { error } = await dbClient.from('eventos').delete().eq('id', id); if (error) return toast('Error al eliminar', true); registrarLog('Eliminó evento', e ? e.titulo : id); const nuevosDatos = await leerNube(); if (nuevosDatos) D = nuevosDatos; }
    SEL.delete(id); toast(`${FLATICONS.basura} Evento eliminado`); pintarTabla();
  }

  function ambitoNovedad(n) {
    const facs = (n.facultad_ids || []).map(id => D.facultades.find(f => String(f.id) === String(id))).filter(Boolean);
    const progs = [];
    (n.programa_ids || []).forEach(id => {
      for (const f of D.facultades) {
        const p = f.programas.find(x => String(x.id) === String(id));
        if (p) progs.push(p.nombre);
      }
    });
    const areas = (n.area_ids || []).map(id => D.areas.find(a => String(a.id) === String(id))).filter(Boolean);
    return { facs, progs, areas };
  }

  async function pNovedades() {
    const { data } = await dbClient.from('novedades').select('*').order('fecha', { ascending: false }).limit(200);
    NOVEDADES = data || [];
    const hoyIso = hoy();
    const tipos = [['cambio_salon','Cambio de salón'],['cancelacion','Cancelación de clase'],['modalidad','Cambio de modalidad'],['otro','Otro aviso'], ...OPCS.filter(o => o.lista === 'tipo_novedad' && o.activo !== false).map(o => [o.valor, o.valor])];
    const lugares = ['Auditorio Principal o Central','Auditorio Fundadores','Clínicas Odontológicas','Sistema Académico en Línea (SALA)','SAUCE','Sede Chía','Otro',
      ...['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'].map(l => 'Bloque ' + l)];

    const novsFiltradas = NOVEDADES.filter(n => {
      if (NF.estado === 'vigente' && (n.fecha_fin || n.fecha) < hoyIso) return false;
      if (NF.estado === 'vencida' && (n.fecha_fin || n.fecha) >= hoyIso) return false;
      if (NF.q) {
        const { facs, progs, areas } = ambitoNovedad(n);
        const txt = norm(`${n.titulo} ${n.detalle || ''} ${n.materia || ''} ${n.creado_por || ''} ${facs.map(f=>f.nombre).join(' ')} ${progs.join(' ')} ${areas.map(a=>a.nombre).join(' ')}`);
        if (!txt.includes(norm(NF.q))) return false;
      }
      return true;
    });

    const vigentesCount = NOVEDADES.filter(n => (n.fecha_fin || n.fecha) >= hoyIso).length;
    const vencidasCount = NOVEDADES.length - vigentesCount;

    return encabezado('📣 Novedades de clases', 'Publica cambios de salón, cancelaciones, cambios de modalidad u otros avisos. Las novedades vencidas se ocultan automáticamente del portal público, pero permanecen visibles aquí para trazabilidad.') + `
    <div class="caja" id="nov-form">
      <h2>➕ Nueva novedad</h2>
      <div class="fr2">
        <div class="fr"><label>Título *</label><input id="nv_titulo" placeholder="Ej: Cambio de salón Cálculo II"></div>
        <div class="fr"><label>Tipo</label><select id="nv_tipo">${tipos.map(t => `<option value="${t[0]}">${t[1]}</option>`).join('')}</select></div>
      </div>
      <div class="fr2">
        <div class="fr"><label>Fecha (vigencia hasta esta fecha) *</label><input type="date" id="nv_fecha" value="${hoy()}"></div>
        <div class="fr"><label>Materia / Curso</label><input id="nv_materia" placeholder="Ej: Cálculo II - Grupo 3"></div>
      </div>
      <div class="fr2">
        <div class="fr"><label>Docente</label><input id="nv_docente" placeholder="Nombre del docente"></div>
        <div class="fr"><label>Modalidad</label><select id="nv_modal"><option value="">—</option>${opcionesLista('modalidad', MOD_BASE).map(m => `<option>${esc(m)}</option>`).join('')}</select></div>
      </div>
      <div class="fr2">
        <div class="fr"><label>Hora inicio</label><input type="time" id="nv_hi"></div>
        <div class="fr"><label>Hora fin</label><input type="time" id="nv_hf"></div>
      </div>
      <div class="fr">
        <label>Facultades (Selección múltiple)</label>
        <select id="nv_fac" multiple class="multi-select" size="5" onchange="actualizarProgsNov()">
          ${D.facultades.map(f => `<option value="${f.id}">${emojiFac(f)} ${esc(f.nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="fr">
        <label>Programas (Selección múltiple)</label>
        <select id="nv_prog" multiple class="multi-select" size="5"></select>
      </div>
      <div class="fr">
        <label>Áreas administrativas (Selección múltiple)</label>
        <select id="nv_area" multiple class="multi-select" size="4">
          ${D.areas.map(a => `<option value="${a.id}">${emojiArea(a)} ${esc(a.nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="fr2">
        <div class="fr">
          <label>Ubicación</label>
          <select id="nv_ubic" onchange="toggleUbicNov()">
            <option value="">-- Seleccionar --</option>
            ${lugares.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('')}
          </select>
        </div>
        <div class="fr" id="nv_ubic_esp_wrap" hidden>
          <label>Especifique ubicación</label>
          <input id="nv_ubic_esp" placeholder="Escriba el lugar...">
        </div>
      </div>
      <div class="fr2">
        <div class="fr"><label>Piso</label><input id="nv_piso" placeholder="Ej: Piso 2"></div>
        <div class="fr"><label>Enlace (Teams / Meet / Zoom)</label><input id="nv_enlace" placeholder="https://..."></div>
      </div>
      <div class="fr"><label>Resumen (se ve en la tarjeta)</label><input id="nv_detalle" placeholder="Descripción breve del cambio"></div>
      <div class="fr"><label>Información completa (se ve al dar clic)</label><textarea id="nv_info" rows="4" placeholder="Detalles, instrucciones, pasos, observaciones…" style="width:100%;padding:.55rem .8rem;border:1px solid var(--linea);border-radius:10px;"></textarea></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:.8rem;">
        <div class="fr"><label>Vigente hasta</label><input type="date" id="nv_ffin"></div>
        <div class="fr"><label>Prioridad</label><select id="nv_prio"><option value="normal">Normal</option><option value="importante">⭐ Importante</option><option value="urgente">🚨 Urgente</option></select></div>
        <div class="fr"><label>Sede / campus</label><input id="nv_sede" placeholder="Ej: Sede Chía"></div>
        <div class="fr"><label>Cupo</label><input id="nv_cupo" placeholder="Ej: 30 personas"></div>
        <div class="fr"><label>Costo</label><input id="nv_costo" placeholder="Ej: Gratuito"></div>
        <div class="fr"><label>Enlace de inscripción</label><input id="nv_insc" placeholder="https://…"></div>
        <div class="fr"><label>Contacto</label><input id="nv_cnom" placeholder="Nombre de contacto"></div>
        <div class="fr"><label>Correo de contacto</label><input id="nv_cmail" type="email"></div>
        <div class="fr"><label>Teléfono / extensión</label><input id="nv_ctel"></div>
      </div>
      <div class="fr"><label>Requisitos / a tener en cuenta</label><textarea id="nv_req" rows="2" style="width:100%;padding:.55rem .8rem;border:1px solid var(--linea);border-radius:10px;"></textarea></div>
      <div style="display:flex; gap:.6rem; flex-wrap:wrap;">
        <button class="btn pri" data-a="addNov">💾 Publicar novedad</button>
      </div>
    </div>

    <div class="tools">
      <input type="search" id="nv_buscar" placeholder="🔍 Buscar por título, creador, facultad o programa…" value="${esc(NF.q)}">
      <select id="nv_filtro_est">
        <option value="" ${NF.estado === '' ? 'selected' : ''}>Todas (${NOVEDADES.length})</option>
        <option value="vigente" ${NF.estado === 'vigente' ? 'selected' : ''}>✅ Vigentes en público (${vigentesCount})</option>
        <option value="vencida" ${NF.estado === 'vencida' ? 'selected' : ''}>🕒 Vencidas / Ocultas en público (${vencidasCount})</option>
      </select>
    </div>

    <div class="masiva-bar"><span class="masiva-n suave">Selecciona novedades en la tabla</span><button class="btn sm peligro" data-a="nBulk">🗑 Eliminar seleccionadas</button></div><div class="tw">
      <table>
        <thead><tr><th><input type="checkbox" data-a="nSelAll" title="Seleccionar todas"></th><th>Fecha / Estado</th><th>Tipo</th><th>Título</th><th>Facultad / Programa / Área</th><th>Creado por</th><th>Ubicación</th><th>Acciones</th></tr></thead>
        <tbody>
          ${novsFiltradas.map(n => {
            const vencida = (n.fecha_fin || n.fecha) < hoyIso;
            const { facs, progs, areas } = ambitoNovedad(n);
            const destinos = [
              ...facs.map(f => `${emojiFac(f)} ${esc(f.nombre)}`),
              ...progs.map(p => `📚 ${esc(p)}`),
              ...areas.map(a => `${emojiArea(a)} ${esc(a.nombre)}`)
            ];
            return `<tr style="${vencida ? 'background:#FAF8F8;' : ''}"><td><input type="checkbox" class="nsel" data-i="${n.id}"></td>
              <td style="white-space:nowrap">
                <b>${fmtFecha(n.fecha)}</b><br>
                ${vencida
                  ? '<span class="badge" style="background:#FDE8E7; color:#B3261E; margin-top:.2rem;">🕒 Vencida (oculta)</span>'
                  : '<span class="badge" style="background:#E1F2B8; color:#2f4a00; margin-top:.2rem;">✅ Vigente</span>'}
              </td>
              <td><span class="chip">${NOV_TAG[n.tipo] || n.tipo || 'Aviso'}</span></td>
              <td><b>${esc(n.titulo)}</b>${n.detalle ? `<br><span style="font-size:.8rem;color:var(--suave)">${esc(n.detalle)}</span>` : ''}</td>
              <td style="font-size:.82rem;">${destinos.join('<br>') || '<i style="color:var(--suave)">Toda la institución</i>'}</td>
              <td style="font-size:.82rem;"><b>${esc(n.creado_por || 'Sin registro')}</b>${n.created_at ? `<br><span style="color:var(--suave);font-size:.74rem;">${new Date(n.created_at).toLocaleDateString('es-CO')}</span>` : ''}</td>
              <td style="font-size:.82rem;">${esc(n.salon || '')}${n.piso ? '<br><span style="color:var(--suave)">' + esc(n.piso) + '</span>' : ''}</td>
              <td><div class="acc"><button class="btn sm" data-a="editNov" data-i="${n.id}">${FLATICONS.editar} Editar</button><button class="btn sm pel" data-a="delNov" data-i="${n.id}">${FLATICONS.basura}</button></div></td>
            </tr>`;
          }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--suave);padding:1.5rem;">Sin novedades con estos filtros.</td></tr>'}
        </tbody>
      </table>
    </div>`;
  }

  window.actualizarProgsNov = function(preseleccionados = []) {
    const selectedFacs = [...$('#nv_fac').selectedOptions].map(o => o.value);
    const lista = [];
    selectedFacs.forEach(fid => { const f = D.facultades.find(x => String(x.id) === String(fid)); if (f) f.programas.forEach(p => lista.push({ id: p.id, nombre: p.nombre, nivel: p.nivel })); });
    const render = (p, sel) => `<option value="${p.id}" ${sel ? 'selected' : ''}>${esc(p.nombre)} (${p.nivel === 'posgrado' ? 'Posgrado' : 'Pregrado'})</option>`;
    const sel = preseleccionados.length ? preseleccionados.map(String) : [...$('#nv_prog').selectedOptions].map(o => o.value);
    $('#nv_prog').innerHTML = lista.map(p => render(p, sel.includes(String(p.id)))).join('');
  };
  window.toggleUbicNov = function() {
    $('#nv_ubic_esp_wrap').hidden = !['Sede Chía', 'Otro', 'Sistema Académico en Línea (SALA)', 'SAUCE'].includes($('#nv_ubic').value);
  };

  function editNov(id) {
    const n = NOVEDADES.find(x => String(x.id) === String(id)); if (!n) return;
    $('#nv_titulo').value = n.titulo || '';
    $('#nv_tipo').value = n.tipo || 'cambio_salon';
    $('#nv_fecha').value = n.fecha || hoy();
    $('#nv_materia').value = n.materia || '';
    $('#nv_docente').value = n.docente || '';
    $('#nv_modal').value = n.modalidad || '';
    $('#nv_hi').value = n.hora_inicio || '';
    $('#nv_hf').value = n.hora_fin || '';
    $('#nv_piso').value = n.piso || '';
    $('#nv_enlace').value = n.enlace || '';
    $('#nv_detalle').value = n.detalle || '';
    [['nv_info','info_completa'],['nv_ffin','fecha_fin'],['nv_prio','prioridad'],['nv_sede','sede'],['nv_cupo','cupo'],['nv_costo','costo'],['nv_insc','inscripcion_enlace'],['nv_cnom','contacto_nombre'],['nv_cmail','contacto_correo'],['nv_ctel','contacto_telefono'],['nv_req','requisitos']].forEach(([id, k]) => { const el = $('#' + id); if (el) el.value = n[k] || (id === 'nv_prio' ? 'normal' : ''); });
    const facs = (n.facultad_ids || []).map(String);
    [...$('#nv_fac').options].forEach(o => o.selected = facs.includes(o.value));
    actualizarProgsNov(n.programa_ids || []);
    const areas = (n.area_ids || []).map(String);
    [...$('#nv_area').options].forEach(o => o.selected = areas.includes(o.value));
    const ubic = n.salon || '';
    const enLista = [...$('#nv_ubic').options].some(o => o.value === ubic);
    $('#nv_ubic').value = enLista ? ubic : (ubic ? 'Otro' : '');
    toggleUbicNov();
    if (!enLista && ubic) $('#nv_ubic_esp').value = ubic;
    else $('#nv_ubic_esp').value = n.ubicacion || '';
    const btn = $('[data-a="addNov"]');
    btn.dataset.editId = n.id;
    btn.textContent = '💾 Actualizar novedad';
    $('#nov-form h2').textContent = '✏️ Editando novedad';
    $('#nov-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function addNov() {
    const titulo = $('#nv_titulo').value.trim(); if (!titulo) return toast('Escribe un título', true);
    const enlace = normalizarEnlace($('#nv_enlace').value);
    if ($('#nv_enlace').value.trim() && !enlace) return toast('El enlace no es válido. Ej: https://teams.microsoft.com/...', true);
    const ubic = $('#nv_ubic').value;
    const ubicEsp = ['Sede Chía', 'Otro', 'Sistema Académico en Línea (SALA)', 'SAUCE'].includes(ubic) ? $('#nv_ubic_esp').value.trim() : '';
    const btn = $('[data-a="addNov"]');
    const editId = btn && btn.dataset.editId;
    const row = {
      titulo, tipo: $('#nv_tipo').value, fecha: $('#nv_fecha').value || hoy(),
      materia: $('#nv_materia').value.trim() || null, docente: $('#nv_docente').value.trim() || null,
      modalidad: $('#nv_modal').value || null, hora_inicio: $('#nv_hi').value || null, hora_fin: $('#nv_hf').value || null,
      salon: (ubic === 'Otro' && ubicEsp) ? ubicEsp : (ubic || null),
      ubicacion: (ubic && ubic !== 'Otro') ? (ubicEsp || null) : null,
      piso: $('#nv_piso').value.trim() || null, enlace: enlace || null,
      ...marcaPrueba(),
      detalle: $('#nv_detalle').value.trim() || '',
      info_completa: $('#nv_info').value.trim() || null, fecha_fin: $('#nv_ffin').value || null, prioridad: $('#nv_prio').value, sede: $('#nv_sede').value.trim() || null,
      cupo: $('#nv_cupo').value.trim() || null, costo: $('#nv_costo').value.trim() || null, inscripcion_enlace: normalizarEnlace($('#nv_insc').value) || null,
      contacto_nombre: $('#nv_cnom').value.trim() || null, contacto_correo: $('#nv_cmail').value.trim() || null, contacto_telefono: $('#nv_ctel').value.trim() || null, requisitos: $('#nv_req').value.trim() || null,
      facultad_ids: [...$('#nv_fac').selectedOptions].map(o => o.value),
      programa_ids: [...$('#nv_prog').selectedOptions].map(o => o.value),
      area_ids: [...$('#nv_area').selectedOptions].map(o => o.value)
    };
    if (!editId) row.creado_por = USUARIO_ACTUAL ? USUARIO_ACTUAL.nombre : 'Sistema';

    let payload = { ...row };
    let error = null;
    for (let i = 0; i < 6; i++) {
      const q = editId
        ? dbClient.from('novedades').update(payload).eq('id', editId)
        : dbClient.from('novedades').insert([payload]);
      ({ error } = await q);
      if (!error) break;
      const m = /Could not find the '([^']+)' column/.exec(error.message || '');
      if (!m || !(m[1] in payload)) break;
      delete payload[m[1]];
    }
    if (error) return toast('Error: ' + error.message, true);
    registrarLog(editId ? 'Editó novedad' : 'Publicó novedad', titulo);
    toast(editId ? '✅ Novedad actualizada' : '📣 Novedad publicada');
    refrescar();
  }

  async function delNov(id) {
    if (!confirm('¿Eliminar esta novedad?')) return;
    const { error } = await dbClient.from('novedades').delete().eq('id', id);
    if (error) return toast('Error: ' + error.message, true);
    registrarLog('Eliminó novedad', id);
    toast('Novedad eliminada');
    refrescar();
  }

  function pPeriodos() {
    const per = [...D.periodos].sort((a, b) => a.id.localeCompare(b.id));
    return encabezado(`${FLATICONS.calendario} Semestres`, 'Los semestres dividen el calendario. Solo los activos se muestran en la vista pública.') + `
    <div class="caja"><h2>Crear nuevo semestre</h2>
      <div style="display:flex; flex-wrap:wrap; gap:.6rem; align-items:flex-end;">
        <div class="fr" style="margin:0; flex:0 0 110px;"><label>Año</label><input type="number" id="np_a" value="${new Date().getFullYear() + 1}" min="2020" max="2040"></div>
        <div class="fr" style="margin:0; flex:0 0 130px;"><label>Semestre</label><select id="np_s"><option value="1">1er semestre</option><option value="2">2do semestre</option></select></div>
        <div class="fr" style="margin:0; flex:1 1 160px;"><label>Inicia el</label><input type="date" id="np_i"></div>
        <div class="fr" style="margin:0; flex:1 1 160px;"><label>Termina el</label><input type="date" id="np_f"></div>
        <button class="btn pri" data-a="addPer">${FLATICONS.check} Crear semestre</button>
      </div>
    </div>
    <div class="tw"><table><thead><tr><th>Semestre</th><th>Estado</th><th>Inicia</th><th>Termina</th><th>Eventos</th><th></th></tr></thead><tbody>` +
      per.map(p => { const n = usadosPeriodo(p.id), act = p.activo !== false; return `<tr style="${act ? '' : 'opacity:.65'}"><td><b>${nombrePeriodo(p.id)}</b></td><td><button class="est ${act ? 'pub' : 'bor'}" data-a="togPer" data-i="${p.id}" title="Cambiar visibilidad">${act ? '✅ Activo' : '⏸ Suspendido'}</button></td><td><input type="date" value="${p.inicio}" data-per="${p.id}" data-c="inicio"></td><td><input type="date" value="${p.fin}" data-per="${p.id}" data-c="fin"></td><td>${n}</td><td>${n ? `<span style="color:var(--suave);font-size:.82rem;">En uso</span>` : `<button class="btn sm pel" data-a="delPer" data-i="${p.id}">${FLATICONS.basura} Eliminar</button>`}</td></tr>`; }).join('') +
    '</tbody></table></div>';
  }

  function pFacultades() {
    return encabezado(`${FLATICONS.birrete} Facultades y programas`, 'Gestiona facultades, programas y carga el directorio de extensiones telefónicas desde Excel.') + `
    <div class="caja">
      <h2>📊 Cargar extensiones de facultades desde Excel</h2>
      <p style="font-size:.86rem; color:var(--suave); margin-bottom:.8rem;">
        Sube un archivo <b>.xlsx</b>, <b>.xls</b> o <b>.csv</b> con las columnas: <code>Facultad</code>, <code>Dependencia</code> (o <code>Cargo</code>), <code>Extensión</code>, <code>Contacto</code>, <code>Correo</code> y <code>Ubicación</code>. Al hacer clic en una facultad en el portal público, se mostrará esta información adicional.
      </p>
      <div style="display:flex; flex-wrap:wrap; gap:.6rem; align-items:center;">
        <input type="file" id="excel_ext_file" accept=".xlsx,.xls,.csv" style="padding:.45rem; border:1px solid var(--linea); border-radius:10px; background:var(--fondo); font-size:.86rem; flex:1 1 260px;">
        <button type="button" class="btn pri" data-a="cargarExcelExt">📥 Importar extensiones</button>
        <button type="button" class="btn" data-a="descargarPlantillaExt">📄 Descargar plantilla Excel</button>
      </div>
    </div>

    <div class="caja"><h2>Agregar facultad</h2>
      <div style="display:flex; gap:.6rem;"><input id="nf_nom" placeholder="Nombre de la facultad (ej: Facultad de Ciencias)" style="flex:1; padding:.55rem .8rem; border:1px solid var(--linea); border-radius:10px;"><input type="color" id="nf_col" value="#007A78" style="width:48px; height:40px; border:1px solid var(--linea); border-radius:10px; padding:2px; cursor:pointer;"><button class="btn pri" data-a="addFac">${FLATICONS.check} Agregar</button></div>
    </div>` +
    D.facultades.map(f => {
      const exts = Array.isArray(f.extensiones) ? f.extensiones : [];
      return `<div class="caja">
        <div style="display:flex; align-items:center; gap:.6rem; margin-bottom:.7rem; flex-wrap:wrap;">
          <input type="color" value="${f.color || '#007A78'}" data-fac="${f.id}" data-c="color" style="width:36px; height:36px; border:1px solid var(--linea); border-radius:8px; padding:2px; cursor:pointer;">
          <input value="${esc(f.nombre)}" data-fac="${f.id}" data-c="nombre" style="font-weight:700; font-size:1.05rem; border:1px solid var(--linea); border-radius:8px; padding:.35rem .6rem; flex:1; min-width:220px;">
          <span class="badge" style="background:var(--fondo); border:1px solid var(--linea); color:var(--petroleo);">📞 ${exts.length} ext.</span>
          <button class="btn sm" data-a="verExtAdmin" data-i="${f.id}">📞 Ver / Editar extensiones</button>
          <button class="btn sm pel" data-a="delFac" data-i="${f.id}">${FLATICONS.basura} Eliminar facultad</button>
        </div>
        ${f.programas.map(p => `<div style="display:flex; gap:.5rem; align-items:center; padding:.4rem 0; border-top:1px solid var(--linea);"><input value="${esc(p.nombre)}" data-fac="${f.id}" data-prog="${p.id}" data-c="nombre" style="flex:1; border:1px solid var(--linea); border-radius:8px; padding:.35rem .6rem;"><select data-fac="${f.id}" data-prog="${p.id}" data-c="nivel" style="border:1px solid var(--linea); border-radius:8px; padding:.35rem .5rem;">${opt('pregrado', 'Pregrado', p.nivel !== 'posgrado')}${opt('posgrado', 'Posgrado', p.nivel === 'posgrado')}</select><button class="btn sm pel" data-a="delProg" data-fac="${f.id}" data-i="${p.id}">${FLATICONS.basura}</button></div>`).join('')}
        <div style="display:flex; gap:.5rem; margin-top:.7rem; padding-top:.6rem; border-top:1px dashed var(--linea);"><input placeholder="Nuevo programa…" id="np_${f.id}" style="flex:1; padding:.45rem .7rem; border:1px solid var(--linea); border-radius:8px;"><select id="nl_${f.id}" style="padding:.45rem .6rem; border:1px solid var(--linea); border-radius:8px;"><option value="pregrado">Pregrado</option><option value="posgrado">Posgrado</option></select><button class="btn sm pri" data-a="addProg" data-i="${f.id}">+ Programa</button></div>
      </div>`;
    }).join('');
  }

  function descargarPlantillaExtensiones() {
    if (!window.XLSX) return toast('Librería Excel no disponible', true);
    const filas = D.facultades.length
      ? D.facultades.map(f => ({
          Facultad: f.nombre,
          Dependencia: 'Decanatura / Secretaría Académica',
          Extension: '1234',
          Contacto: 'Coordinación Académica',
          Correo: 'facultad@unbosque.edu.co',
          Ubicacion: 'Bloque A · Piso 2'
        }))
      : [{
          Facultad: 'Facultad de Ingeniería',
          Dependencia: 'Decanatura',
          Extension: '1401',
          Contacto: 'Secretaría Académica',
          Correo: 'ingenieria@unbosque.edu.co',
          Ubicacion: 'Bloque M · Piso 3'
        }];
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Extensiones');
    XLSX.writeFile(wb, 'plantilla_extensiones_facultades.xlsx');
    toast('📄 Plantilla descargada');
  }

  async function importarExcelExtensiones() {
    const inp = $('#excel_ext_file');
    if (!inp || !inp.files || !inp.files[0]) return toast('Selecciona un archivo Excel primero', true);
    if (!window.XLSX) return toast('Librería Excel no cargada', true);
    try {
      const buf = await inp.files[0].arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) return toast('El archivo Excel está vacío', true);

      const mapa = leerExtensionesLocal();
      const porFacId = {};
      let procesadas = 0;

      rows.forEach(r => {
        const keys = Object.keys(r);
        const getVal = (...candidatos) => {
          const k = keys.find(key => candidatos.some(c => norm(key).includes(c)));
          return k ? String(r[k] ?? '').trim() : '';
        };
        const facNom = getVal('facultad');
        const ext = getVal('extension', 'ext', 'telefono', 'tel');
        const dep = getVal('dependencia', 'cargo', 'area', 'oficina', 'programa');
        const contacto = getVal('contacto', 'responsable', 'nombre', 'decano', 'secretaria');
        const correo = getVal('correo', 'email', 'mail');
        const ubicacion = getVal('ubicacion', 'bloque', 'piso', 'lugar', 'oficina');

        if (!facNom) return;
        const facObj = D.facultades.find(f => norm(f.nombre) === norm(facNom) || norm(f.nombre).includes(norm(facNom)) || norm(facNom).includes(norm(f.nombre)));
        const item = {
          dependencia: dep || 'Atención Facultad',
          extension: ext,
          contacto,
          correo,
          ubicacion
        };
        if (facObj) {
          if (!porFacId[facObj.id]) porFacId[facObj.id] = [];
          porFacId[facObj.id].push(item);
          procesadas++;
        } else {
          const kNorm = norm(facNom);
          if (!mapa[kNorm]) mapa[kNorm] = [];
          mapa[kNorm].push(item);
        }
      });

      for (const fid of Object.keys(porFacId)) {
        mapa[String(fid)] = porFacId[fid];
        const fObj = D.facultades.find(x => String(x.id) === String(fid));
        if (fObj) {
          fObj.extensiones = porFacId[fid];
          mapa[norm(fObj.nombre)] = porFacId[fid];
        }
        // Intentar persistir también en Supabase si la columna extensiones existe
        if (DB_READY) {
          try {
            await dbClient.from('facultades').update({ extensiones: porFacId[fid] }).eq('id', fid);
          } catch (_) {}
        }
      }

      guardarExtensionesLocal(mapa);
      registrarLog('Importó extensiones Excel', `${procesadas} registros asociados a facultades`);
      toast(`✅ Se importaron ${procesadas} extensiones correctamente`);
      refrescar();
    } catch (e) {
      console.error(e);
      toast('Error al leer el archivo Excel: ' + (e.message || 'formato inválido'), true);
    }
  }

  function abrirModalExtensionesAdmin(facId) {
    const f = D.facultades.find(x => String(x.id) === String(facId));
    if (!f) return;
    const exts = Array.isArray(f.extensiones) ? f.extensiones : [];
    $('#modal').innerHTML = `<div class="mod">
      <h2>📞 Extensiones · ${esc(f.nombre)}</h2>
      <div id="ext_admin_list">
        ${exts.length ? exts.map((it, idx) => `<div class="ext-item" style="--fc:${f.color || 'var(--verde)'}">
          <div class="ext-item-info">
            <b>${esc(it.dependencia || 'Dependencia')}</b>
            <span>📞 Ext: <b>${esc(it.extension || '—')}</b> ${it.contacto ? `· 👤 ${esc(it.contacto)}` : ''} ${it.correo ? `· ✉️ ${esc(it.correo)}` : ''} ${it.ubicacion ? `· 📍 ${esc(it.ubicacion)}` : ''}</span>
          </div>
          <button type="button" class="btn sm pel" data-a="delExtItem" data-fac="${f.id}" data-idx="${idx}">${FLATICONS.basura}</button>
        </div>`).join('') : '<p style="color:var(--suave); margin-bottom:1rem;">No hay extensiones registradas aún.</p>'}
      </div>
      <div class="caja" style="margin-top:1rem; background:var(--fondo);">
        <h2>➕ Agregar extensión manual</h2>
        <div class="fr2">
          <div class="fr"><label>Dependencia / Cargo *</label><input id="ext_dep" placeholder="Ej: Secretaría Académica"></div>
          <div class="fr"><label>Extensión *</label><input id="ext_num" placeholder="Ej: 1450"></div>
        </div>
        <div class="fr2">
          <div class="fr"><label>Contacto</label><input id="ext_con" placeholder="Nombre del responsable"></div>
          <div class="fr"><label>Correo</label><input id="ext_cor" placeholder="correo@unbosque.edu.co"></div>
        </div>
        <div class="fr"><label>Ubicación</label><input id="ext_ubi" placeholder="Ej: Bloque A · Piso 2"></div>
        <button type="button" class="btn pri" data-a="addExtManual" data-fac="${f.id}">💾 Guardar extensión</button>
      </div>
      <div style="display:flex; justify-content:flex-end; margin-top:1rem;">
        <button type="button" class="btn" data-a="cerrar">Cerrar</button>
      </div>
    </div>`;
    $('#modal').classList.add('on');
  }

  function pConfig() {
    const sw = (t, id, on) => `<label class="sw"><input type="checkbox" data-a="toggle" data-t="${t}" data-i="${id}" ${on !== false ? 'checked' : ''}><span></span></label>`;
    const emo = (t, x) => t === 'facultades' ? emojiFac(x) : t === 'areas' ? emojiArea(x) : (x.emoji || (t === 'categorias' ? '🏷️' : '📘'));
    const fila = (t, x) => `<div class="cfg-fila"><label style="display:flex;gap:.5rem;align-items:center;flex:1;min-width:0;"><input type="checkbox" class="csel" data-t="${t}" data-i="${x.id}"><input class="emo-in" value="${esc(emo(t, x))}" maxlength="4" data-emo-t="${t}" data-emo-i="${x.id}" title="Cambiar emoji"><span>${esc(x.nombre)}${x.activo === false ? ' <small style="color:var(--rojo)">⏸ suspendido</small>' : ''}</span></label>${sw(t, x.id, x.activo)}</div>`;
    const bloque = (tit, t, arr) => `<div class="caja"><h2>${tit}</h2><div class="bulk-mini"><label><input type="checkbox" data-a="selAll" data-t="${t}"> Todos</label><button class="btn sm" data-a="cBulk" data-op="on" data-t="${t}">✅ Habilitar</button><button class="btn sm" data-a="cBulk" data-op="off" data-t="${t}">⏸️ Suspender</button><button class="btn sm warn" data-a="cBulk" data-op="del" data-t="${t}">🗑 Eliminar</button></div>${arr.map(x => fila(t, x)).join('') || '<p style="color:var(--suave)">Sin registros.</p>'}</div>`;
    const lista = (l, tit, base) => `<div class="caja"><h2>${tit}</h2><div class="chips-cfg">${chipsLista(l, base)}</div>
      <div style="display:flex;gap:.5rem;margin-top:.8rem;"><input id="op_${l}" placeholder="Nueva opción…" style="flex:1;padding:.5rem .8rem;border:1px solid var(--linea);border-radius:10px;"><button class="btn pri" data-a="addOpc" data-l="${l}">➕ Agregar</button></div></div>`;
    const progs = D.facultades.flatMap(f => f.programas.map(pr => ({ ...pr, nombre: pr.nombre + ' · ' + f.nombre })));
    return encabezado('⚙️ Listas y Estado', 'Crea opciones para las listas desplegables y habilita o suspende facultades, programas, áreas y categorías (lo suspendido se oculta del portal público).') + `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1.2rem;">
      ${lista('publico', '🎯 Opciones de «Dirigido a»', PUB_BASE)}
      ${lista('modalidad', '💻 Modalidades (novedades)', MOD_BASE)}
      ${lista('tipo_novedad', '🏷️ Tipos de novedad', ['Cambio de salón', 'Cancelación de clase', 'Cambio de modalidad', 'Otro aviso'])}
      <div class="caja"><h2>🧪 Usuario de prueba</h2><p style="font-size:.86rem;color:var(--suave);">Acceso temporal con PIN aleatorio: indica la persona asignada y el día en que se suspende.</p>
        <div style="display:grid;gap:.5rem;"><input id="tu_persona" placeholder="Nombre de la persona asignada" style="padding:.5rem .8rem;border:1px solid var(--linea);border-radius:10px;"><div style="display:flex;gap:.5rem;flex-wrap:wrap;"><select id="tu_rol" style="padding:.5rem;border:1px solid var(--linea);border-radius:10px;">${Object.keys(DESC_ROL).map(r => `<option>${r}</option>`).join('')}</select><select id="tu_tipo" style="padding:.5rem;border:1px solid var(--linea);border-radius:10px;"><option value="prueba">🧪 De prueba (sus datos se borran)</option><option value="real">✅ Real temporal (sus cambios quedan)</option></select><label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem;">Se suspende el <input type="date" id="tu_vence" style="padding:.45rem;border:1px solid var(--linea);border-radius:10px;"></label></div><button class="btn pri" data-a="mkTest">🧪 Crear usuario temporal</button></div><div id="tu_res" style="margin-top:.8rem;"></div></div>
      <div class="caja"><h2>🧹 Datos de prueba</h2><p style="font-size:.86rem;color:var(--suave);">Lo que crean los usuarios <b>de prueba</b> (eventos, novedades, tickets) se marca y se borra solo cuando vence su acceso. También puedes limpiarlo ahora.</p><div style="display:flex;gap:.5rem;flex-wrap:wrap;"><button class="btn" data-a="cleanTest" data-u="0">🧹 Borrar datos de prueba</button><button class="btn warn" data-a="cleanTest" data-u="1">🗑 Borrar datos y usuarios de prueba</button></div></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1.2rem;margin-top:1.2rem;">
      ${bloque('🏷️ Categorías', 'categorias', D.categorias)}${bloque('🎓 Facultades', 'facultades', D.facultades)}${bloque('📚 Programas', 'programas', progs)}${bloque('🏢 Áreas', 'areas', D.areas)}
    </div>`;
  }

  // ===== Estructura académica =====
  const actualizarEstN = () => { const e = $('#est_n'); if (e) e.textContent = `${$$('.psel:checked').length} programa(s) · ${$$('.fsel:checked').length} facultad(es) seleccionados`; };
  document.addEventListener('change', ev => { if (ev.target.classList && (ev.target.classList.contains('psel') || ev.target.classList.contains('fsel'))) actualizarEstN(); });
  function pEstructura() {
    const facs = [...D.facultades].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const opts = facs.map(f => `<option value="${esc(f.id)}">${esc(f.nombre)}</option>`).join('');
    const nivB = n => `<span class="badge" style="background:${n === 'posgrado' ? '#EDE7F6;color:#4527A0' : '#E3F2FD;color:#0D47A1'}">${n === 'posgrado' ? '🎓 Posgrado' : '📘 Pregrado'}</span>`;
    return encabezado('🏛️ Estructura académica', 'Facultades en orden alfabético. Marca facultades o programas y aplica acciones en lote: mover de facultad, cambiar nivel, renombrar, suspender o eliminar.') + `
    <div class="masiva-bar sticky-bar">
      <b class="masiva-n" id="est_n">0 programa(s) · 0 facultad(es) seleccionados</b>
      <select id="est_dest"><option value="">Mover programas a…</option>${opts}</select><button class="btn sm pri" data-a="eMover">📦 Mover</button>
      <select id="est_niv"><option value="">Cambiar nivel…</option><option value="pregrado">📘 Pregrado</option><option value="posgrado">🎓 Posgrado</option></select><button class="btn sm" data-a="eNivel">Aplicar</button>
      <button class="btn sm" data-a="eRen">✏️ Renombrar…</button><button class="btn sm" data-a="eEst" data-op="on">✅ Habilitar</button><button class="btn sm" data-a="eEst" data-op="off">⏸️ Suspender</button><button class="btn sm peligro" data-a="eDel">🗑 Eliminar</button>
    </div>
    <div class="est-grid">${facs.map(f => `<details class="caja est-card" open><summary><input type="checkbox" class="fsel" data-i="${esc(f.id)}" title="Seleccionar facultad"> <span style="font-size:1.3rem">${emojiFac(f)}</span> <b>${esc(f.nombre)}</b>${f.activo === false ? ' <span class="badge off">⏸ Suspendida</span>' : ''} <small style="color:var(--suave)">${f.programas.length} programas</small><label class="mini"><input type="checkbox" data-a="eSelFac" data-i="${esc(f.id)}"> todos sus programas</label></summary>
      ${[...f.programas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(pr => `<div class="est-prog"><label><input type="checkbox" class="psel" data-i="${esc(pr.id)}"> ${esc(pr.nombre)}</label>${nivB(pr.nivel)}${pr.activo === false ? '<span class="badge off">⏸ Suspendido</span>' : ''}</div>`).join('') || '<p style="color:var(--suave)">Sin programas.</p>'}</details>`).join('')}</div>`;
  }

  // ===== Soporte / Mesa de servicio =====
  let TK = [], SF = { q: '', estado: '', prio: '', aranda: '' };
  const TK_ESTADOS = [['abierto', '🔵 Abierto'], ['en_proceso', '🟠 En proceso'], ['pendiente', '🟣 Pendiente'], ['resuelto', '🟢 Resuelto'], ['cerrado', '⚫ Cerrado']];
  const TK_PRIO = [['baja', '🟢 Baja'], ['media', '🟡 Media'], ['alta', '🟠 Alta'], ['critica', '🔴 Crítica']];
  const TK_TIPOS = [['incidente', '🛑 Incidente'], ['requerimiento', '📝 Requerimiento'], ['consulta', '❓ Consulta'], ['mejora', '💡 Mejora'], ['error_datos', '🧮 Error de datos']];
  const TK_MODULOS = ['Calendario público', 'Eventos', 'Novedades', 'Usuarios y permisos', 'Facultades y programas', 'Base de datos', 'Reportes', 'Otro'];
  const TK_CANALES = ['Web', 'Correo', 'Teléfono', 'Presencial', 'Aranda'];
  const SLA_DIAS = { baja: 10, media: 5, alta: 2, critica: 1 };
  const lbl = (arr, v) => (arr.find(x => x[0] === v) || [v, v || '—'])[1];
  const tkCerrado = t => ['resuelto', 'cerrado'].includes(t.estado);
  const tkVencido = t => !tkCerrado(t) && t.fecha_limite && String(t.fecha_limite).slice(0, 10) < hoy();
  const fechaMas = d => { const x = new Date(); x.setDate(x.getDate() + d); return iso(x); };

  async function pSoporte() {
    const r = await dbClient.from('tickets').select('*').order('created_at', { ascending: false }).limit(1000);
    const cab = encabezado('🛠️ Soporte · Mesa de servicio', 'Registra y da seguimiento a incidentes, requerimientos y consultas del calendario, con seguimiento del caso en ARANDA.');
    if (r.error) return cab + '<div class="caja"><h2>Falta crear las tablas de soporte</h2><p>Ejecuta <b>supabase_actualizacion_4.sql</b> en el SQL Editor de Supabase y recarga.</p></div>';
    TK = r.data || [];
    const ab = TK.filter(t => !tkCerrado(t)), res = TK.filter(t => t.fecha_resolucion), ar = TK.filter(t => t.aranda_caso);
    const prom = res.length ? Math.round(res.reduce((a, t) => a + (new Date(t.fecha_resolucion) - new Date(t.created_at)), 0) / res.length / 36e5) : 0;
    const kp = (ic, n, t, g) => `<div class="stat kpi" style="--g:${g}"><b>${n}</b><span>${ic} ${t}</span></div>`;
    const meses = []; for (let i = 5; i >= 0; i--) { const d = new Date(); d.setMonth(d.getMonth() - i); meses.push(d.toISOString().slice(0, 7)); }
    const porMes = meses.map(m => [m, TK.filter(t => String(t.created_at).slice(0, 7) === m).length]);
    const cols = ['#1565C0', '#EF6C00', '#6A1B9A', '#2E7D32', '#546E7A'];
    const venc = TK.filter(tkVencido).sort((a, b) => String(a.fecha_limite).localeCompare(String(b.fecha_limite))).slice(0, 8);
    return cab + `
    <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:1rem;"><button class="btn pri" data-a="tkNew">➕ Nuevo ticket</button></div>
    <div class="cards">${kp('🎫', TK.length, 'tickets en total', '#007A78')}${kp('📂', ab.length, 'abiertos', '#1565C0')}${kp('⏰', TK.filter(tkVencido).length, 'vencidos (SLA)', '#B3261E')}${kp('🔴', ab.filter(t => t.prioridad === 'critica').length, 'críticos abiertos', '#C62828')}${kp('✅', res.length, 'resueltos', '#2E7D32')}${kp('⏱️', prom + ' h', 'tiempo prom. resolución', '#EF6C00')}${kp('🔗', ar.length, 'con caso ARANDA', '#6A1B9A')}${kp('📊', (TK.length ? Math.round(ar.length / TK.length * 100) : 0) + '%', 'escalados a ARANDA', '#AD1457')}</div>
    <div class="grid-g">
      <div class="caja"><h2>📌 Por estado</h2>${donaG(TK_ESTADOS.map(([k, l], i) => ({ l, n: TK.filter(t => t.estado === k).length, c: cols[i] })))}</div>
      <div class="caja"><h2>🚦 Por prioridad</h2>${barrasG(TK_PRIO.map(([k, l]) => [l, TK.filter(t => t.prioridad === k).length]), 'linear-gradient(90deg,#EF6C00,#C62828)')}</div>
      <div class="caja"><h2>🗂️ Por tipo</h2>${barrasG(cuenta(TK, t => lbl(TK_TIPOS, t.tipo)))}</div>
      <div class="caja"><h2>🧩 Por módulo afectado</h2>${barrasG(cuenta(TK, t => esc(t.modulo || 'Sin módulo')).slice(0, 8), 'linear-gradient(90deg,#1565C0,#00ACC1)')}</div>
      <div class="caja"><h2>📈 Tickets por mes</h2>${barrasG(porMes, 'linear-gradient(90deg,#6A1B9A,#EC407A)')}</div>
      <div class="caja"><h2>🔗 ARANDA</h2>${donaG([{ l: 'Con caso ARANDA', n: ar.length, c: '#6A1B9A' }, { l: 'Sin caso ARANDA', n: TK.length - ar.length, c: '#CFD8DC' }])}<h3 style="margin:1rem 0 .3rem;font-size:.95rem;">Estado en ARANDA</h3>${barrasG(cuenta(ar, t => esc(t.aranda_estado || 'Sin estado')), 'linear-gradient(90deg,#6A1B9A,#EC407A)')}</div>
      <div class="caja"><h2>🙋 Top solicitantes</h2>${barrasG(cuenta(TK, t => esc(t.solicitante || 'Sin nombre')).slice(0, 6))}</div>
      <div class="caja"><h2>🎓 Por facultad</h2>${barrasG(cuenta(TK.filter(t => t.facultad_id), t => { const f = D.facultades.find(x => x.id === t.facultad_id); return f ? emojiFac(f) + ' ' + esc(f.nombre) : esc(t.facultad_id); }).slice(0, 6), 'linear-gradient(90deg,var(--verde),var(--lima))')}</div>
    </div>
    <div class="caja" style="margin-top:1.2rem;"><h2>⏰ Vencidos / críticos para atender</h2><div class="tw"><table><thead><tr><th>#</th><th>Ticket</th><th>Prioridad</th><th>Venció</th><th>Asignado</th><th>ARANDA</th></tr></thead><tbody>${venc.map(t => `<tr><td>#${t.numero}</td><td><b>${esc(t.titulo)}</b></td><td>${lbl(TK_PRIO, t.prioridad)}</td><td>${esc(String(t.fecha_limite).slice(0, 10))}</td><td>${esc(t.asignado_a || '—')}</td><td>${esc(t.aranda_caso || '—')}</td></tr>`).join('') || '<tr><td colspan="6">🎉 Sin tickets vencidos</td></tr>'}</tbody></table></div></div>
    <div class="caja" style="margin-top:1.2rem;"><h2>🔗 Casos escalados a ARANDA</h2><div class="tw"><table><thead><tr><th>Caso ARANDA</th><th>Estado ARANDA</th><th>Ticket</th><th>Estado</th><th>Enlace</th></tr></thead><tbody>${ar.slice(0, 12).map(t => `<tr><td><b>${esc(t.aranda_caso)}</b></td><td>${esc(t.aranda_estado || '—')}</td><td>#${t.numero} ${esc(t.titulo)}</td><td>${lbl(TK_ESTADOS, t.estado)}</td><td>${t.aranda_url ? `<a href="${esc(t.aranda_url)}" target="_blank" rel="noopener">Abrir ↗</a>` : '—'}</td></tr>`).join('') || '<tr><td colspan="5">Aún no hay casos ARANDA registrados</td></tr>'}</tbody></table></div></div>
    <div class="caja" style="margin-top:1.2rem;"><h2>🎫 Todos los tickets</h2>
      <div class="tools"><input id="s_q" placeholder="🔎 Buscar por título, solicitante o caso ARANDA…"><select id="s_estado"><option value="">Todos los estados</option>${TK_ESTADOS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><select id="s_prio"><option value="">Todas las prioridades</option>${TK_PRIO.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><select id="s_aranda"><option value="">ARANDA: todos</option><option value="si">Con caso ARANDA</option><option value="no">Sin caso ARANDA</option></select></div>
      <div class="masiva-bar"><span class="masiva-n suave">Selecciona tickets en la tabla</span><select id="tk_est_b">${TK_ESTADOS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><button class="btn sm" data-a="tkEstado">Cambiar estado</button><button class="btn sm" data-a="tkAsig">👤 Asignar a…</button><button class="btn sm peligro" data-a="tkDel">🗑 Eliminar seleccionados</button></div>
      <div class="tw" id="tk_tabla">${tablaTickets()}</div></div>`;
  }
  function tkFiltrados() { const q = norm(SF.q); return TK.filter(t => (!SF.estado || t.estado === SF.estado) && (!SF.prio || t.prioridad === SF.prio) && (!SF.aranda || (SF.aranda === 'si') === !!t.aranda_caso) && (!q || norm([t.titulo, t.solicitante, t.aranda_caso, t.descripcion].join(' ')).includes(q))); }
  function tablaTickets() { const L = tkFiltrados(); return `<table><thead><tr><th><input type="checkbox" data-a="tkSelAll"></th><th>#</th><th>Ticket</th><th>Tipo</th><th>Prioridad</th><th>Estado</th><th>Solicitante</th><th>Asignado</th><th>Límite SLA</th><th>ARANDA</th><th></th></tr></thead><tbody>${L.map(t => `<tr style="${tkVencido(t) ? 'background:#fbf3f2;' : ''}"><td><input type="checkbox" class="tsel" data-i="${t.id}"></td><td>#${t.numero}</td><td><b>${esc(t.titulo)}</b><br><small style="color:var(--suave)">${esc(t.modulo || '')}</small></td><td>${lbl(TK_TIPOS, t.tipo)}</td><td>${lbl(TK_PRIO, t.prioridad)}</td><td>${lbl(TK_ESTADOS, t.estado)}</td><td>${esc(t.solicitante || '—')}</td><td>${esc(t.asignado_a || '—')}</td><td>${t.fecha_limite ? esc(String(t.fecha_limite).slice(0, 10)) : '—'}${tkVencido(t) ? ' ⚠️' : ''}</td><td>${t.aranda_caso ? '🔗 ' + esc(t.aranda_caso) : '—'}</td><td><button class="btn sm" data-a="tkEdit" data-i="${t.id}">✏️</button></td></tr>`).join('') || '<tr><td colspan="11">Sin tickets con esos filtros</td></tr>'}</tbody></table>`; }
  document.addEventListener('input', ev => { const id = ev.target.id; if (['s_q', 's_estado', 's_prio', 's_aranda'].includes(id)) { SF[id.slice(2)] = ev.target.value; const t = $('#tk_tabla'); if (t) t.innerHTML = tablaTickets(); } });

  window.abrirTicket = function(id) {
    const t = id ? TK.find(x => String(x.id) === String(id)) : null, v = k => esc((t && t[k]) || '');
    const sel = (idc, arr, cur) => `<select id="${idc}">${arr.map(x => { const k = Array.isArray(x) ? x[0] : x, l = Array.isArray(x) ? x[1] : x; return `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
    const ov = document.createElement('div'); ov.id = 'tk_ov'; ov.className = 'ov-modal';
    ov.innerHTML = `<div class="ov-box"><h2 style="font-family:var(--display);margin:0 0 .8rem;">${t ? '✏️ Ticket #' + t.numero : '➕ Nuevo ticket'}</h2>
      <div class="fr"><label>Título *</label><input id="tk_tit" value="${v('titulo')}"></div>
      <div class="fr"><label>Descripción</label><textarea id="tk_des" rows="3">${v('descripcion')}</textarea></div>
      <div class="g2"><div class="fr"><label>Tipo</label>${sel('tk_tipo', TK_TIPOS, t ? t.tipo : 'incidente')}</div><div class="fr"><label>Módulo afectado</label>${sel('tk_mod', TK_MODULOS, t ? t.modulo : 'Eventos')}</div>
      <div class="fr"><label>Prioridad</label>${sel('tk_pri', TK_PRIO, t ? t.prioridad : 'media')}</div><div class="fr"><label>Estado</label>${sel('tk_est', TK_ESTADOS, t ? t.estado : 'abierto')}</div>
      <div class="fr"><label>Canal</label>${sel('tk_can', TK_CANALES, t ? t.canal : 'Web')}</div><div class="fr"><label>Fecha límite (SLA)</label><input type="date" id="tk_lim" value="${t && t.fecha_limite ? esc(String(t.fecha_limite).slice(0, 10)) : fechaMas(SLA_DIAS.media)}"></div>
      <div class="fr"><label>Solicitante *</label><input id="tk_sol" value="${v('solicitante')}"></div><div class="fr"><label>Correo</label><input id="tk_cor" type="email" value="${v('solicitante_correo')}"></div>
      <div class="fr"><label>Teléfono / ext.</label><input id="tk_tel" value="${v('solicitante_telefono')}"></div><div class="fr"><label>Asignado a</label><input id="tk_asi" value="${v('asignado_a')}"></div>
      <div class="fr"><label>Facultad</label><select id="tk_fac"><option value="">—</option>${[...D.facultades].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(f => `<option value="${esc(f.id)}" ${t && t.facultad_id === f.id ? 'selected' : ''}>${esc(f.nombre)}</option>`).join('')}</select></div>
      <div class="fr"><label>Área</label><select id="tk_are"><option value="">—</option>${D.areas.map(a => `<option value="${esc(a.id)}" ${t && t.area_id === a.id ? 'selected' : ''}>${esc(a.nombre)}</option>`).join('')}</select></div></div>
      <div class="fr"><label>Solución / respuesta</label><textarea id="tk_sol2" rows="2">${v('solucion')}</textarea></div>
      <div class="aranda-box"><b>🔗 Campo ARANDA</b><div class="g2"><div class="fr"><label>N.º de caso ARANDA</label><input id="tk_ac" value="${v('aranda_caso')}" placeholder="Ej: 245871"></div><div class="fr"><label>Estado en ARANDA</label><input id="tk_ae" value="${v('aranda_estado')}" placeholder="Ej: En proceso"></div></div><div class="fr"><label>Enlace al caso en ARANDA</label><input id="tk_au" value="${v('aranda_url')}" placeholder="https://…"></div></div>
      <div style="display:flex;gap:.6rem;justify-content:flex-end;margin-top:1rem;"><button class="btn" id="tk_cancel">Cancelar</button><button class="btn pri" id="tk_ok">💾 Guardar</button></div></div>`;
    document.body.appendChild(ov);
    $('#tk_pri').onchange = () => { if (!t) $('#tk_lim').value = fechaMas(SLA_DIAS[$('#tk_pri').value] || 5); };
    $('#tk_cancel').onclick = () => ov.remove();
    $('#tk_ok').onclick = async () => {
      const titulo = $('#tk_tit').value.trim(), sol = $('#tk_sol').value.trim(); if (!titulo || !sol) return toast('Título y solicitante son obligatorios', true);
      const est = $('#tk_est').value, row = { titulo, descripcion: $('#tk_des').value.trim(), tipo: $('#tk_tipo').value, modulo: $('#tk_mod').value, prioridad: $('#tk_pri').value, estado: est, canal: $('#tk_can').value, fecha_limite: $('#tk_lim').value || null, solicitante: sol, solicitante_correo: $('#tk_cor').value.trim() || null, solicitante_telefono: $('#tk_tel').value.trim() || null, asignado_a: $('#tk_asi').value.trim() || null, facultad_id: $('#tk_fac').value || null, area_id: $('#tk_are').value || null, solucion: $('#tk_sol2').value.trim() || null, aranda_caso: $('#tk_ac').value.trim() || null, aranda_estado: $('#tk_ae').value.trim() || null, aranda_url: normalizarEnlace($('#tk_au').value) || null, updated_at: new Date().toISOString() };
      row.fecha_resolucion = ['resuelto', 'cerrado'].includes(est) ? ((t && t.fecha_resolucion) || new Date().toISOString()) : null;
      const r = t ? await dbClient.from('tickets').update(row).eq('id', t.id) : await dbClient.from('tickets').insert([{ ...row, creado_por: USUARIO_ACTUAL.nombre, ...marcaPrueba() }]);
      if (r.error) return toast('No se pudo guardar: ' + r.error.message, true);
      registrarLog(t ? 'Editó ticket' : 'Creó ticket', titulo); ov.remove(); toast('✅ Ticket guardado'); ir('soporte', true);
    };
  };

  function pAreas() {
    return encabezado(`${FLATICONS.personas} Áreas administrativas`, 'Dependencias de la institución (Tesorería, Bienestar, Registro…).') + `
    <div class="caja"><h2>Agregar área</h2><div style="display:flex; gap:.6rem;"><input id="na_nom" placeholder="Nombre del área" style="flex:1; padding:.55rem .8rem; border:1px solid var(--linea); border-radius:10px;"><button class="btn pri" data-a="addArea">${FLATICONS.check} Agregar</button></div></div>
    <div class="tw"><table><thead><tr><th>Nombre</th><th></th></tr></thead><tbody>` +
      D.areas.map(a => `<tr><td><input value="${esc(a.nombre)}" data-area="${a.id}" style="width:100%; border:1px solid var(--linea); border-radius:8px; padding:.4rem .6rem;"></td><td style="text-align:right"><button class="btn sm pel" data-a="delArea" data-i="${a.id}">${FLATICONS.basura} Eliminar</button></td></tr>`).join('') +
    '</tbody></table></div>';
  }

  function pCategorias() {
    return encabezado(`${FLATICONS.estrella} Categorías`, 'Cada categoría es una tarjeta en el portal público y tiene su propio color.') + `
    <div class="caja"><h2>Agregar categoría</h2>
      <div style="display:flex; gap:.6rem;"><input id="nc_nom" placeholder="Nombre de la categoría" style="flex:1; padding:.55rem .8rem; border:1px solid var(--linea); border-radius:10px;"><input type="color" id="nc_col" value="#2e7d32" style="width:48px; height:40px; border:1px solid var(--linea); border-radius:10px; padding:2px; cursor:pointer;"><button class="btn pri" data-a="addCat">${FLATICONS.check} Agregar</button></div>
    </div>
    <div class="tw"><table><thead><tr><th>Color</th><th>Nombre</th><th>Subcategorías (separadas por coma)</th><th>Eventos</th><th></th></tr></thead><tbody>` +
      D.categorias.map(c => { const n = D.eventos.filter(e => e.categoria === c.id).length; return `<tr><td><input type="color" value="${c.color}" data-cat="${c.id}" data-c="color" style="width:36px; height:36px; border:1px solid var(--linea); border-radius:8px; padding:2px; cursor:pointer;"></td><td><input value="${esc(c.nombre)}" data-cat="${c.id}" data-c="nombre" style="width:100%; border:1px solid var(--linea); border-radius:8px; padding:.4rem .6rem;"></td><td><input value="${esc(subcatsDe(c.id).join(', '))}" placeholder="Ej: Directivo, Académico, Administrativo, Decanos" data-cat="${c.id}" data-c="subcategorias" style="width:100%; border:1px solid var(--linea); border-radius:8px; padding:.4rem .6rem;"></td><td>${n}</td><td style="text-align:right">${n ? `<span style="color:var(--suave);font-size:.82rem;">En uso</span>` : `<button class="btn sm pel" data-a="delCat" data-i="${c.id}">${FLATICONS.basura} Eliminar</button>`}</td></tr>`; }).join('') +
    '</tbody></table></div>';
  }

  async function pUsuarios() {
    const { data: users, error } = await dbClient.from('usuarios_admin').select('*').order('created_at', { ascending: false });
    if (error) return encabezado('Error', error.message);

    const resumenAreas = areas => {
      if (!areas || !areas.length) return '<span style="color:var(--suave)">Todas</span>';
      const tags = areas.map(a => {
        if (a.startsWith('f:')) { const f = D.facultades.find(x => x.id === a.slice(2)); return `<span class="badge" style="background:#E6F2F1; color:#007A78;">${f ? emojiFac(f) + ' ' + esc(f.nombre) : esc(a)}</span>`; }
        if (a.startsWith('p:')) { for (const f of D.facultades) { const p = f.programas.find(x => x.id === a.slice(2)); if (p) return `<span class="badge" style="background:#EEF2FF; color:#3730A3;">📚 ${esc(p.nombre)}</span>`; } return `<span class="badge">${esc(a)}</span>`; }
        const ar = D.areas.find(x => x.id === a.slice(2)); return `<span class="badge" style="background:#FFF8E6; color:#8A5A00;">${ar ? emojiArea(ar) + ' ' + esc(ar.nombre) : esc(a)}</span>`;
      });
      return `<details class="acc-perm"><summary></summary><div class="drop">${tags.join('')}</div></details>`;
    };

    const chkAreas = (pref, sel = []) => {
      const m = new Set(sel);
      const item = (val, lbl, cls = '') => `<label${cls ? ` class="${cls}"` : ''}><input type="checkbox" name="${pref}_areas" value="${esc(val)}" ${m.has(val) ? 'checked' : ''}><span>${lbl}</span></label>`;
      const grp = (tit, inner) => `<div class="chk-grp"><div class="chk-tit">${tit}</div><div class="chk-items">${inner}</div></div>`;
      return `<div class="chk-lista" data-chk-areas>` +
        grp('Alcance general', item('__TODAS__', '<b>Todas las facultades y áreas</b>', 'chk-todos')) +
        D.facultades.map(f => grp(emojiFac(f) + ' ' + esc(f.nombre),
          item('f:' + f.id, '<b>Toda la facultad</b>', 'chk-todos') +
          f.programas.map(p => item('p:' + p.id, esc(p.nombre) + (p.nivel === 'posgrado' ? ' <small style="color:var(--suave)">(posgrado)</small>' : ''))).join('')
        )).join('') +
        (D.areas.length ? grp('🏢 Áreas administrativas', D.areas.map(a => item('a:' + a.id, emojiArea(a) + ' ' + esc(a.nombre))).join('')) : '') +
      `</div>`;
    };

    window._chkAreas = chkAreas;

    return encabezado(`${FLATICONS.personas} Usuarios y Accesos`, 'Gestiona usuarios, roles múltiples, permisos granulares y áreas asignadas.') + `
    <div class="caja"><h2>✨ Crear nuevo usuario</h2>
      <div class="fr2">
        <div class="fr"><label>Nombre *</label><input id="nu_nombre" placeholder="Ej: María Gómez"></div>
        <div class="fr"><label>Correo electrónico *</label><input type="email" id="nu_correo" placeholder="maria@unbosque.edu.co"></div>
      </div>
      
      <div class="fr">
        <label>Roles (Selecciona uno o varios)</label>
        <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-top:.3rem;">
          <label style="display:flex; align-items:center; gap:.4rem; font-weight:normal;"><input type="checkbox" name="nu_roles" value="admin"> 👑 Administrador (acceso total)</label>
          <label style="display:flex; align-items:center; gap:.4rem; font-weight:normal;"><input type="checkbox" name="nu_roles" value="creador"> 📝 Creador de Eventos</label>
          <label style="display:flex; align-items:center; gap:.4rem; font-weight:normal;"><input type="checkbox" name="nu_roles" value="editor"> ✏️ Editor de Eventos</label>
          <label style="display:flex; align-items:center; gap:.4rem; font-weight:normal;"><input type="checkbox" name="nu_roles" value="docente"> 🎓 Docente (Novedades)</label>
          <label style="display:flex; align-items:center; gap:.4rem; font-weight:normal;"><input type="checkbox" name="nu_roles" value="administrativo"> 🏢 Administrativo (Novedades)</label>
        </div>
      </div>

      <div class="fr">
        <label>Permisos específicos en Eventos</label>
        <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-top:.3rem;">
          <label style="display:flex; align-items:center; gap:.4rem; font-weight:normal;"><input type="checkbox" name="nu_perm" value="crear" checked> Crear eventos</label>
          <label style="display:flex; align-items:center; gap:.4rem; font-weight:normal;"><input type="checkbox" name="nu_perm" value="editar" checked> Editar eventos</label>
          <label style="display:flex; align-items:center; gap:.4rem; font-weight:normal;"><input type="checkbox" name="nu_perm" value="eliminar"> Eliminar eventos</label>
        </div>
      </div>

      <div class="fr"><label>Facultades, programas o áreas asignadas (para eventos)</label>${chkAreas('nu')}</div>
      <button class="btn pri" data-a="addUser">${FLATICONS.email} Crear usuario y enviar PIN por correo</button>
    </div>
    
    <div class="masiva-bar"><span class="masiva-n suave">Selecciona usuarios en la tabla</span><button class="btn sm" data-a="uBulk" data-op="on">✅ Reactivar</button><button class="btn sm" data-a="uBulk" data-op="off">⏸️ Suspender</button><button class="btn sm peligro" data-a="uBulk" data-op="del">🗑 Eliminar seleccionados</button></div>
    <div class="tw"><table><thead><tr><th><input type="checkbox" data-a="uSelAll" title="Seleccionar todos"></th><th>Nombre</th><th>Correo</th><th>Roles</th><th>Permisos Eventos</th><th>Áreas</th><th>PIN</th><th></th></tr></thead><tbody>` +
      (users || []).map(u => {
        const esYo = String(u.id) === String(USUARIO_ACTUAL.id);
        const rolesU = String(u.rol).split(',').map(x => x.trim());
        const permsU = u.permisos || [];
        const venc = u.vence && String(u.vence).slice(0, 10) < hoy(), susp = u.activo === false || venc;
        return `<tr style="${susp ? 'opacity:.6;background:#fbf3f2;' : ''}">
          <td>${esYo ? '' : `<input type="checkbox" class="usel" data-i="${u.id}">`}</td>
          <td><b>${esc(u.nombre)}</b>${u.es_temporal || u.vence ? ` <span class="badge" style="background:#FFF3D6;color:#8A5A00;">${u.tipo_usuario === 'prueba' ? '🧪 Prueba' : '⏳ Temporal real'}${u.vence ? ' · vence ' + esc(String(u.vence).slice(0, 10)) : ''}</span>` : ''}${susp ? ' <span class="badge" style="background:#FDE8E7;color:#B3261E;">⏸ Suspendido</span>' : ''}${esYo ? ' <span class="badge" style="background:#E1F2B8;color:#2f4a00;">Tú</span>' : ''}</td>
          <td style="font-size:0.85rem;">${esc(u.correo || '—')}</td>
          <td>${rolesU.map(r => `<span class="badge" style="background:#E6F2F1; color:#007A78; margin:1px;">${ROLES[r] || r}</span>`).join('')}</td>
          <td style="font-size:0.85rem;">${rolesU.includes('admin') ? 'Todos' : (permsU.length ? permsU.map(p => PERM_TXT[p] || p).join(', ') : 'Solo novedades')}</td>
          <td>${rolesU.includes('admin') ? '<span style="color:var(--suave)">Todas</span>' : resumenAreas(u.areas_asignadas)}</td>
          <td style="font-family:monospace">••••••</td>
          <td><div class="acc">
            <button class="btn sm" data-a="editUser" data-i="${u.id}">✏️ Editar</button>
            <button class="btn sm warn" data-a="resetPin" data-i="${u.id}">${FLATICONS.llave} Nuevo PIN</button>
            ${!esYo ? `<button class="btn sm pel" data-a="delUser" data-i="${u.id}">${FLATICONS.basura} Eliminar</button>` : ''}
          </div></td>
        </tr>`;
      }).join('') +
    '</tbody></table></div>';
  }

  async function modalEditarUsuario(id) {
    const { data: u } = await dbClient.from('usuarios_admin').select('*').eq('id', id).single();
    if (!u) return;
    const rolesU = String(u.rol).split(',').map(x => x.trim());
    const permsU = u.permisos || [];

    $('#modal').innerHTML = `<div class="mod">
      <h2>✏️ Editar usuario: ${esc(u.nombre)}</h2>
      <div class="fr"><label>Nombre *</label><input id="eu_nombre" value="${esc(u.nombre)}"></div>
      <div class="fr"><label>Correo electrónico</label><input type="email" id="eu_correo" value="${esc(u.correo || '')}"></div>
      
      <div class="fr">
        <label>Roles (Selecciona uno o varios)</label>
        <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-top:.3rem;">
          <label style="display:flex; align-items:center; gap:.4rem; font-weight:normal;"><input type="checkbox" name="eu_roles" value="admin" ${rolesU.includes('admin') ? 'checked' : ''}> 👑 Administrador</label>
          <label style="display:flex; align-items:center; gap:.4rem; font-weight:normal;"><input type="checkbox" name="eu_roles" value="creador" ${rolesU.includes('creador') ? 'checked' : ''}> 📝 Creador de Eventos</label>
          <label style="display:flex; align-items:center; gap:.4rem; font-weight:normal;"><input type="checkbox" name="eu_roles" value="editor" ${rolesU.includes('editor') ? 'checked' : ''}> ✏️ Editor de Eventos</label>
          <label style="display:flex; align-items:center; gap:.4rem; font-weight:normal;"><input type="checkbox" name="eu_roles" value="docente" ${rolesU.includes('docente') ? 'checked' : ''}> 🎓 Docente (Novedades)</label>
          <label style="display:flex; align-items:center; gap:.4rem; font-weight:normal;"><input type="checkbox" name="eu_roles" value="administrativo" ${rolesU.includes('administrativo') ? 'checked' : ''}> 🏢 Administrativo (Novedades)</label>
        </div>
      </div>

      <div class="fr">
        <label>Permisos específicos en Eventos</label>
        <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-top:.3rem;">
          <label style="display:flex; align-items:center; gap:.4rem; font-weight:normal;"><input type="checkbox" name="eu_perm" value="crear" ${permsU.includes('crear') ? 'checked' : ''}> Crear eventos</label>
          <label style="display:flex; align-items:center; gap:.4rem; font-weight:normal;"><input type="checkbox" name="eu_perm" value="editar" ${permsU.includes('editar') ? 'checked' : ''}> Editar eventos</label>
          <label style="display:flex; align-items:center; gap:.4rem; font-weight:normal;"><input type="checkbox" name="eu_perm" value="eliminar" ${permsU.includes('eliminar') ? 'checked' : ''}> Eliminar eventos</label>
        </div>
      </div>

      <div class="fr"><label>Facultades, programas o áreas asignadas</label>${window._chkAreas('eu', u.areas_asignadas || [])}</div>
      
      <div style="display:flex; justify-content:flex-end; gap:.8rem; margin-top:1.5rem;">
        <button class="btn" data-a="cerrar">Cancelar</button>
        <button class="btn pri" data-a="guardarEditUser" data-i="${id}">${FLATICONS.guardar} Guardar cambios</button>
      </div>
    </div>`;
    $('#modal').classList.add('on');
  }

  async function guardarEditarUsuario(id) {
    const nombre = $('#eu_nombre').value.trim();
    const correo = $('#eu_correo').value.trim();
    const rolesSel = [...document.querySelectorAll('input[name="eu_roles"]:checked')].map(c => c.value);
    const permisos = [...document.querySelectorAll('input[name="eu_perm"]:checked')].map(c => c.value);
    const areas = [...document.querySelectorAll('input[name="eu_areas"]:checked')].map(c => c.value).filter(v => v !== '__TODAS__');

    if (!nombre) return toast('El nombre es obligatorio', true);
    if (!rolesSel.length) return toast('Selecciona al menos un rol', true);

    const { error } = await dbClient.from('usuarios_admin').update({
      nombre, correo: correo || null, rol: rolesSel.join(','), permisos, areas_asignadas: areas
    }).eq('id', id);

    if (error) return toast('Error al actualizar: ' + error.message, true);
    registrarLog('Editó usuario', nombre);
    toast('✅ Usuario actualizado');
    cerrarModal();
    refrescar();
  }

  let LOGS_CACHE = [];
  async function pLogs() {
    const { data: logs, error } = await dbClient.from('logs').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) return encabezado('Error', error.message);
    LOGS_CACHE = logs || [];
    const acciones = [...new Set(LOGS_CACHE.map(l => l.accion))].sort();
    const usuarios = [...new Set(LOGS_CACHE.map(l => l.usuario_nombre))].sort();
    return encabezado('📜 Logs del Sistema', 'Historial de acciones realizadas por los usuarios.') + `
    <div class="tools"><input type="search" id="l_q" placeholder="🔍 Buscar…"><select id="l_user"><option value="">Todos los usuarios</option>${usuarios.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('')}</select><select id="l_acc"><option value="">Todas las acciones</option>${acciones.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('')}</select><button class="btn" data-a="refrescarLogs">🔄 Actualizar</button></div>
    <div class="tw" id="tablaLogs"></div>`;
  }
  function pintarLogs() {
    const q = norm(($('#l_q') || {}).value || '');
    const u = ($('#l_user') || {}).value || '';
    const a = ($('#l_acc') || {}).value || '';
    const L = LOGS_CACHE.filter(l => (!u || l.usuario_nombre === u) && (!a || l.accion === a) && (!q || norm(`${l.usuario_nombre} ${l.accion} ${l.detalle}`).includes(q)));
    $('#tablaLogs').innerHTML = L.length ? `<table><thead><tr><th>Fecha y Hora</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>` +
      L.map(l => `<tr><td style="white-space:nowrap; font-size:0.85rem;">${new Date(l.created_at).toLocaleString('es-CO')}</td><td><b>${esc(l.usuario_nombre)}</b></td><td><span class="badge" style="background:var(--fondo);">${esc(l.accion)}</span></td><td style="font-size:0.88rem; color:var(--suave);">${esc(l.detalle)}</td></tr>`).join('') + '</tbody></table>'
      : '<div style="text-align:center; padding:2rem; color:var(--suave);">No hay registros.</div>';
  }

  function pPublicar() {
    return encabezado('☁️ Publicar y datos', 'Todos los cambios se guardan en tiempo real.') + `
    <div class="caja"><h2>Estado de la conexión</h2><p>Conectado a Supabase · <b>${D.eventos.length}</b> eventos registrados.</p></div>
    <div class="caja"><h2>💾 Copia de seguridad</h2><p>Descarga una copia completa de los datos en formato JSON.</p><button class="btn" data-a="bajarJson">📥 Descargar copia de seguridad</button></div>`;
  }

  function modalPin() {
    $('#modal').innerHTML = `<div class="mod" style="max-width:420px;"><h2>${FLATICONS.llave} Cambiar mi PIN</h2><div class="fr"><label>PIN actual</label><input type="password" inputmode="numeric" id="p_act"></div><div class="fr"><label>Nuevo PIN (6-15 dígitos)</label><input type="password" inputmode="numeric" id="p_n1"></div><div class="fr"><label>Repetir nuevo PIN</label><input type="password" inputmode="numeric" id="p_n2"></div><div style="display:flex; justify-content:flex-end; gap:.8rem; margin-top:1.5rem;"><button class="btn" data-a="cerrar">Cancelar</button><button class="btn pri" data-a="guardarPin">${FLATICONS.guardar} Guardar</button></div></div>`;
    $('#modal').classList.add('on'); setTimeout(() => $('#p_act').focus(), 50);
  }
  async function guardarPin() {
    const a = $('#p_act').value.trim(), n1 = $('#p_n1').value.trim(), n2 = $('#p_n2').value.trim();
    if (!a) return toast('Ingresa tu PIN actual', true);
    if (!/^\d{6,15}$/.test(n1)) return toast('El PIN debe tener entre 6 y 15 dígitos', true);
    if (n1 !== n2) return toast('Los PIN nuevos no coinciden', true);
    const { data: u } = await dbClient.from('usuarios_admin').select('pin').eq('id', USUARIO_ACTUAL.id).single();
    if (!u || u.pin !== a) return toast('El PIN actual no es correcto', true);
    const { data: dup } = await dbClient.from('usuarios_admin').select('id').eq('pin', n1);
    if ((dup || []).some(x => String(x.id) !== String(USUARIO_ACTUAL.id))) return toast('Ese PIN ya está en uso, elige otro', true);
    const { error } = await actualizarPin(USUARIO_ACTUAL.id, n1);
    if (error) return toast('Error al guardar el PIN: ' + error.message, true);
    registrarLog('Cambió su PIN', 'Actualizó PIN personal'); cerrarModal(); toast(`${FLATICONS.check} PIN actualizado`);
  }

  const EMAILJS = { publicKey: 'bM_3h_4V9sB0N9615', serviceId: 'service_9y50r2h', templateId: 'template_h8y2k01' };
  const emailjsListo = () => EMAILJS.publicKey && EMAILJS.serviceId && EMAILJS.templateId;
  const generarPin = () => String(Math.floor(100000 + Math.random() * 900000));
  async function pinUnico() {
    for (let i = 0; i < 8; i++) {
      const p = generarPin();
      const { data } = await dbClient.from('usuarios_admin').select('id').eq('pin', p);
      if (!data || !data.length) return p;
    }
    return generarPin();
  }
  async function enviarPinPorCorreo(u, modo = 'reset') {
    if (!emailjsListo()) return { ok: false, error: 'EmailJS sin configurar' };
    if (!u.correo) return { ok: false, error: 'El usuario no tiene correo registrado' };
    const k = 'ubosque_mail_' + u.id, last = +localStorage.getItem(k) || 0;
    if (Date.now() - last < 60000) return { ok: false, espera: true, error: 'Ya se envió un correo hace menos de un minuto' };
    const nuevoPin = await pinUnico();
    let r = await dbClient.from('usuarios_admin').update({ pin: nuevoPin, pin_temporal: true }).eq('id', u.id);
    if (r.error && /pin_temporal/i.test(r.error.message || '')) r = await dbClient.from('usuarios_admin').update({ pin: nuevoPin }).eq('id', u.id);
    if (r.error) return { ok: false, error: r.error.message };
    const enlace = `${location.origin}${location.pathname}?reset=1&u=${encodeURIComponent(u.id)}`;
    const cuerpo = modo === 'nuevo'
      ? `¡Hola ${u.nombre}!\n\nTe crearon una cuenta en el Calendario Académico de la Universidad El Bosque.\n\nPIN temporal: ${nuevoPin}\n\nEntra al panel de administración con este PIN o desde:\n${enlace}\n\nAl entrar el sistema te pedirá crear tu propio PIN.\n\nRegistro y Control Académico`
      : `Hola ${u.nombre},\n\nEste es tu PIN temporal para entrar al Calendario Académico de la Universidad El Bosque:\n\nPIN temporal: ${nuevoPin}\n\nEntra al panel de administración con este PIN o desde:\n${enlace}\n\nAl entrar te pedirá crear tu propio PIN.\n\nRegistro y Control Académico`;
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS.serviceId,
        template_id: EMAILJS.templateId,
        user_id: EMAILJS.publicKey,
        template_params: {
          to_email: u.correo,
          user_email: u.correo,
          email: u.correo,
          to_name: u.nombre,
          user_name: u.nombre,
          pin: nuevoPin,
          link: enlace,
          reset_link: enlace,
          message: cuerpo
        }
      })
    });
    if (!res.ok) return { ok: false, error: (await res.text()) || 'HTTP ' + res.status };
    localStorage.setItem(k, Date.now());
    return { ok: true };
  }

  document.addEventListener('click', async ev => {
    const it = ev.target.closest('.admin-nav .it'); if (it) return ir(it.dataset.p);
    const ac = ev.target.closest('[data-a]'); if (!ac) return;
    const a = ac.dataset.a, i = ac.dataset.i;
    
    if (a === 'nuevo') return puede('crear') ? modalEvento() : sinPermiso();
    if (a === 'editar') return puede('editar') ? modalEvento(i) : sinPermiso();
    if (a === 'dup') { if (!puede('crear')) return sinPermiso(); const o = D.eventos.find(x => x.id === i); if (!o) return; if (!puedeEnEvento(o)) return sinArea(); DUP = { ...o, id: '', titulo: o.titulo + ' (copia)', estado: 'borrador' }; return modalEvento(); }
    if (a === 'cerrar') return cerrarModal();
    if (a === 'guardarEv') return guardarEvento(i || null);
    if (a === 'del') return eliminarEventoAdmin(i);
    if (a === 'tog') {
      if (!puede('editar')) return sinPermiso();
      const e = D.eventos.find(x => x.id === i);
      if (e) {
        if (!puedeEnEvento(e)) return sinArea();
        const nuevoEst = e.estado === 'borrador' ? 'publicado' : 'borrador';
        await dbClient.from('eventos').update({ estado: nuevoEst }).eq('id', i);
        registrarLog(nuevoEst === 'publicado' ? 'Publicó evento' : 'Pasó a borrador', e.titulo);
        D = await leerNube(); toast(nuevoEst === 'publicado' ? `${FLATICONS.check} Publicado` : `${FLATICONS.documento} En borrador`); pintarTabla();
      }
    }
    if (a === 'toggle') {
      const r = await dbClient.from(ac.dataset.t).update({ activo: ac.checked }).eq('id', i);
      if (r.error) { ac.checked = !ac.checked; return toast('Falta la columna "activo". Ejecuta el SQL actualizado en Supabase.', true); }
      const nd = await leerNube(); if (nd) D = nd; return toast(ac.checked ? '✅ Habilitado' : '⏸️ Suspendido');
    }
    if (a === 'addOpc') {
      const l = ac.dataset.l, v = ($('#op_' + l).value || '').trim(); if (!v) return toast('Escribe un valor', true);
      const r = await dbClient.from('listas_opciones').insert([{ lista: l, valor: v, activo: true }]);
      if (r.error) return toast('Falta la tabla listas_opciones. Ejecuta el SQL actualizado en Supabase.', true);
      const nd = await leerNube(); if (nd) D = nd; return refrescar();
    }
    if (a === 'delOpc') { await dbClient.from('listas_opciones').delete().eq('id', i); const nd = await leerNube(); if (nd) D = nd; return refrescar(); }
    if (a === 'selAll') { $$('.csel[data-t="' + ac.dataset.t + '"]').forEach(c => c.checked = ac.checked); return; }
    if (a === 'cBulk') {
      const t = ac.dataset.t, ids = $$('.csel[data-t="' + t + '"]:checked').map(c => c.dataset.i);
      if (!ids.length) return toast('Marca al menos un elemento', true);
      if (ac.dataset.op === 'del') { if (!confirm(`¿Eliminar ${ids.length} elemento(s)? Esta acción no se puede deshacer.`)) return; const r = await enLotes(ids, c => dbClient.from(t).delete().in('id', c)); if (r.error) return toast('Error: ' + r.error.message, true); registrarLog('Eliminó en lote', `${ids.length} de ${t}`); }
      else { const r = await enLotes(ids, c => dbClient.from(t).update({ activo: ac.dataset.op === 'on' }).in('id', c)); if (r.error) return toast('Falta la columna "activo". Ejecuta el SQL actualizado.', true); registrarLog(ac.dataset.op === 'on' ? 'Habilitó en lote' : 'Suspendió en lote', `${ids.length} de ${t}`); }
      const nd = await leerNube(); if (nd) D = nd; refrescar(); return toast(`✅ ${ids.length} actualizado(s)`);
    }
    if (a === 'uSelAll') { $$('.usel').forEach(c => c.checked = ac.checked); return; }
    if (a === 'uBulk') {
      const ids = $$('.usel:checked').map(c => c.dataset.i); if (!ids.length) return toast('Marca al menos un usuario', true);
      if (ac.dataset.op === 'del') { if (!confirm(`¿Eliminar ${ids.length} usuario(s)?`)) return; const r = await enLotes(ids, c => dbClient.from('usuarios_admin').delete().in('id', c)); if (r.error) return toast('Error: ' + r.error.message, true); registrarLog('Eliminó usuarios en lote', `${ids.length} usuarios`); }
      else { const r = await enLotes(ids, c => dbClient.from('usuarios_admin').update({ activo: ac.dataset.op === 'on' }).in('id', c)); if (r.error) return toast('Falta la columna "activo" en usuarios_admin. Ejecuta el SQL actualizado.', true); registrarLog(ac.dataset.op === 'on' ? 'Reactivó usuarios' : 'Suspendió usuarios', `${ids.length} usuarios`); }
      toast(`✅ ${ids.length} usuario(s) actualizados`); return ir('usuarios');
    }
    if (a === 'nSelAll') { $$('.nsel').forEach(c => c.checked = ac.checked); return; }
    if (a === 'nBulk') {
      const ids = $$('.nsel:checked').map(c => c.dataset.i); if (!ids.length) return toast('Marca al menos una novedad', true);
      if (!confirm(`¿Eliminar ${ids.length} novedad(es)?`)) return;
      const r = await enLotes(ids, c => dbClient.from('novedades').delete().in('id', c)); if (r.error) return toast('Error: ' + r.error.message, true);
      registrarLog('Eliminó novedades en lote', `${ids.length}`); toast(`🗑 ${ids.length} eliminadas`); return ir('novedades');
    }
    if (a === 'mkTest') {
      const persona = ($('#tu_persona').value || '').trim(), vence = $('#tu_vence').value, rol = $('#tu_rol').value, tipo = $('#tu_tipo').value;
      if (!persona) return toast('Escribe el nombre de la persona asignada', true);
      if (!vence) return toast('Elige la fecha en que se suspende', true);
      const pin = String(Math.floor(100000 + Math.random() * 900000)), nombre = (tipo === 'prueba' ? '🧪 ' : '⏳ ') + persona;
      try {
        let r = { nombre, pin, rol, correo: null, permisos: ['crear', 'editar'], areas_asignadas: [], vence, es_temporal: true, activo: true, tipo_usuario: tipo };
        try { await crearUsuario(r); } catch (e1) { if (!/vence|es_temporal|activo|tipo_usuario/i.test(e1.message || '')) throw e1; throw new Error('Faltan columnas en usuarios_admin (vence, es_temporal, activo, tipo_usuario). Ejecuta el SQL actualizado.'); }
        $('#tu_res').innerHTML = `<div style="background:#eaf7ee;border:1px solid #b7e1c1;border-radius:12px;padding:.7rem;">✅ <b>${esc(nombre)}</b> · ${esc(ROLES[rol] || rol)}<br>Se suspende el <b>${esc(vence)}</b><br>PIN: <b style="font-size:1.2rem;letter-spacing:2px;">${pin}</b></div>`; registrarLog('Creó usuario temporal', `${nombre} hasta ${vence}`);
      } catch (err) { toast(err.message || String(err), true); }
      return;
    }
    if (a === 'tkNew') return abrirTicket();
    if (a === 'tkEdit') return abrirTicket(i);
    if (a === 'tkSelAll') { $$('.tsel').forEach(c => c.checked = ac.checked); return; }
    if (a === 'tkEstado' || a === 'tkAsig' || a === 'tkDel') {
      const ids = $$('.tsel:checked').map(c => c.dataset.i); if (!ids.length) return toast('Marca al menos un ticket', true);
      let r;
      if (a === 'tkDel') { if (!confirm(`¿Eliminar ${ids.length} ticket(s)?`)) return; r = await enLotes(ids, c => dbClient.from('tickets').delete().in('id', c)); }
      else if (a === 'tkAsig') { const n = prompt('Asignar los tickets seleccionados a:'); if (!n) return; r = await enLotes(ids, c => dbClient.from('tickets').update({ asignado_a: n.trim(), updated_at: new Date().toISOString() }).in('id', c)); }
      else { const e = $('#tk_est_b').value, cerr = ['resuelto', 'cerrado'].includes(e); r = await enLotes(ids, c => dbClient.from('tickets').update({ estado: e, fecha_resolucion: cerr ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).in('id', c)); }
      if (r.error) return toast('Error: ' + r.error.message, true); toast(`✅ ${ids.length} ticket(s) actualizados`); return ir('soporte', true);
    }
    if (a === 'cleanTest') {
      const del = ac.dataset.u === '1'; if (!confirm(del ? '¿Borrar TODOS los datos y usuarios de prueba?' : '¿Borrar los datos creados por usuarios de prueba?')) return;
      const r = await dbClient.from('usuarios_admin').select('id').eq('tipo_usuario', 'prueba'); if (r.error) return toast('Falta la columna tipo_usuario. Ejecuta el SQL actualizado.', true);
      const ids = (r.data || []).map(x => String(x.id)); if (!ids.length) return toast('No hay usuarios de prueba');
      await limpiarPrueba(ids, del); registrarLog('Limpió datos de prueba', `${ids.length} usuarios`); const nd = await leerNube(); if (nd) D = nd; return toast('🧹 Datos de prueba eliminados');
    }
    if (a === 'renOpc' || a === 'togOpc') {
      const o = OPCS.find(x => String(x.id) === String(i)); if (!o) return;
      if (a === 'togOpc') { const r = await dbClient.from('listas_opciones').update({ activo: o.activo === false }).eq('id', i); if (r.error) return toast('Error: ' + r.error.message, true); }
      else { const nv = (prompt('Nuevo nombre para «' + o.valor + '»:', o.valor) || '').trim(); if (!nv || nv === o.valor) return; const r = await dbClient.from('listas_opciones').update({ valor: nv }).eq('id', i); if (r.error) return toast('No se pudo renombrar: ' + r.error.message, true); if (o.lista === 'publico') await dbClient.from('evento_publicos').update({ publico: nv }).eq('publico', o.valor); if (o.lista === 'modalidad') await dbClient.from('novedades').update({ modalidad: nv }).eq('modalidad', o.valor); }
      const nd = await leerNube(); if (nd) D = nd; return refrescar();
    }
    if (['eSelFac', 'eMover', 'eNivel', 'eRen', 'eEst', 'eDel'].includes(a)) {
      const selP = $$('.psel:checked').map(c => c.dataset.i), selF = $$('.fsel:checked').map(c => c.dataset.i);
      const fin = async m => { const nd = await leerNube(); if (nd) D = nd; await refrescar(); toast(m); };
      if (a === 'eSelFac') { const f = D.facultades.find(x => String(x.id) === String(i)); (f ? f.programas : []).forEach(pr => { const c = $('.psel[data-i="' + pr.id + '"]'); if (c) c.checked = ac.checked; }); return actualizarEstN(); }
      if (a === 'eMover') { const dest = $('#est_dest').value; if (!selP.length) return toast('Marca programas', true); if (!dest) return toast('Elige la facultad destino', true); const r = await enLotes(selP, c => dbClient.from('programas').update({ facultad_id: dest }).in('id', c)); if (r.error) return toast('Error: ' + r.error.message, true); registrarLog('Movió programas', `${selP.length} → ${dest}`); return fin(`📦 ${selP.length} programa(s) movidos`); }
      if (a === 'eNivel') { const nv = $('#est_niv').value; if (!selP.length || !nv) return toast('Marca programas y elige el nivel', true); const r = await enLotes(selP, c => dbClient.from('programas').update({ nivel: nv }).in('id', c)); if (r.error) return toast('Error: ' + r.error.message, true); registrarLog('Cambió nivel de programas', `${selP.length} → ${nv}`); return fin(`✅ Nivel actualizado en ${selP.length}`); }
      if (a === 'eRen') { if (!selP.length) return toast('Marca programas', true); const bus = prompt('Texto a buscar en los nombres:'); if (!bus) return; const nuevo = prompt('Reemplazar por (puede quedar vacío):', ''); if (nuevo === null) return; let n = 0; for (const id of selP) { const pr = D.facultades.flatMap(f => f.programas).find(x => String(x.id) === String(id)); if (!pr) continue; const nn = pr.nombre.split(bus).join(nuevo).replace(/\s+/g, ' ').trim(); if (nn && nn !== pr.nombre) { await dbClient.from('programas').update({ nombre: nn }).eq('id', id); n++; } } registrarLog('Renombró programas', `${n}`); return fin(`✏️ ${n} programa(s) renombrados`); }
      if (!selP.length && !selF.length) return toast('Marca programas o facultades', true);
      if (a === 'eEst') { const on = ac.dataset.op === 'on'; if (selP.length) await enLotes(selP, c => dbClient.from('programas').update({ activo: on }).in('id', c)); if (selF.length) await enLotes(selF, c => dbClient.from('facultades').update({ activo: on }).in('id', c)); registrarLog(on ? 'Habilitó estructura' : 'Suspendió estructura', `${selP.length} programas, ${selF.length} facultades`); return fin(on ? '✅ Habilitado' : '⏸️ Suspendido'); }
      if (a === 'eDel') { if (!confirm(`¿Eliminar ${selP.length} programa(s) y ${selF.length} facultad(es)? Al eliminar una facultad se eliminan también sus programas.`)) return; if (selP.length) await enLotes(selP, c => dbClient.from('programas').delete().in('id', c)); if (selF.length) { const r = await enLotes(selF, c => dbClient.from('facultades').delete().in('id', c)); if (r.error) return toast('Error: ' + r.error.message, true); } registrarLog('Eliminó estructura', `${selP.length} programas, ${selF.length} facultades`); return fin('🗑 Eliminado'); }
    }
    if (a === 'hist') return abrirHistorial(i);
    if (a === 'limpiarF') { Object.keys(F).forEach(k => F[k] = ''); SEL.clear(); return ir('eventos'); }
    if (a === 'm_edit') { if (!puede('editar')) return sinPermiso(); return abrirEdicionMasiva(); }
    if (a === 'm_del' || a === 'm_delall') {
      if (!puede('eliminar')) return sinPermiso();
      const base = a === 'm_del' ? [...SEL].map(id => D.eventos.find(x => x.id === id)).filter(Boolean) : eventosFiltrados();
      const ids = base.filter(puedeEnEvento).map(x => x.id);
      if (!ids.length) return sinArea();
      const ok = a === 'm_del' ? confirm(`¿Eliminar ${ids.length} evento(s) seleccionado(s)? Esta acción no se puede deshacer.`) : (prompt(`Vas a eliminar ${ids.length} evento(s) de la lista actual (según los filtros aplicados).\nEscribe ELIMINAR para confirmar:`) || '').trim().toUpperCase() === 'ELIMINAR';
      if (!ok) return;
      const { error } = await enLotes(ids, c => dbClient.from('eventos').delete().in('id', c));
      if (error) return toast('Error al eliminar: ' + error.message, true);
      registrarLog('Eliminó eventos masivamente', `${ids.length} eventos`);
      D = await leerNube(); SEL.clear(); pintarTabla(); toast(`${FLATICONS.basura} ${ids.length} eventos eliminados`);
    }
    if (a === 'm_pub' || a === 'm_bor') {
      if (!puede('editar')) return sinPermiso();
      const nuevoEst = a === 'm_pub' ? 'publicado' : 'borrador';
      const ids = [...SEL].filter(id => { const o = D.eventos.find(x => x.id === id); return o && puedeEnEvento(o); });
      if (!ids.length) return sinArea();
      await enLotes(ids, c => dbClient.from('eventos').update({ estado: nuevoEst }).in('id', c));
      registrarLog(nuevoEst === 'publicado' ? 'Publicó eventos masivamente' : 'Pasó a borrador masivamente', `${ids.length} eventos`);
      D = await leerNube(); SEL.clear(); pintarTabla(); toast(`${FLATICONS.check} Actualizados`);
    }
    if (a === 'pin') return modalPin();
    if (a === 'guardarPin') return guardarPin();
    if (a === 'addNov') return addNov();
    if (a === 'editNov') return editNov(i);
    if (a === 'delNov') return delNov(i);
    if (a === 'refrescarLogs') return refrescar();

    // Excel y extensiones de facultades
    if (a === 'descargarPlantillaExt') return descargarPlantillaExtensiones();
    if (a === 'cargarExcelExt') return importarExcelExtensiones();
    if (a === 'verExtAdmin') return abrirModalExtensionesAdmin(i);
    if (a === 'addExtManual') {
      const fid = ac.dataset.fac;
      const dep = ($('#ext_dep') || {}).value?.trim();
      const num = ($('#ext_num') || {}).value?.trim();
      const con = ($('#ext_con') || {}).value?.trim();
      const cor = ($('#ext_cor') || {}).value?.trim();
      const ubi = ($('#ext_ubi') || {}).value?.trim();
      if (!dep || !num) return toast('Completa dependencia y extensión', true);
      const fObj = D.facultades.find(x => String(x.id) === String(fid));
      if (!fObj) return;
      if (!Array.isArray(fObj.extensiones)) fObj.extensiones = [];
      fObj.extensiones.push({ dependencia: dep, extension: num, contacto: con, correo: cor, ubicacion: ubi });
      const mapa = leerExtensionesLocal();
      mapa[String(fid)] = fObj.extensiones;
      mapa[norm(fObj.nombre)] = fObj.extensiones;
      guardarExtensionesLocal(mapa);
      if (DB_READY) { try { await dbClient.from('facultades').update({ extensiones: fObj.extensiones }).eq('id', fid); } catch (_) {} }
      toast('✅ Extensión agregada');
      abrirModalExtensionesAdmin(fid);
      refrescar();
      return;
    }
    if (a === 'delExtItem') {
      const fid = ac.dataset.fac;
      const idx = +ac.dataset.idx;
      const fObj = D.facultades.find(x => String(x.id) === String(fid));
      if (!fObj || !Array.isArray(fObj.extensiones)) return;
      fObj.extensiones.splice(idx, 1);
      const mapa = leerExtensionesLocal();
      mapa[String(fid)] = fObj.extensiones;
      mapa[norm(fObj.nombre)] = fObj.extensiones;
      guardarExtensionesLocal(mapa);
      if (DB_READY) { try { await dbClient.from('facultades').update({ extensiones: fObj.extensiones }).eq('id', fid); } catch (_) {} }
      toast('Extensión eliminada');
      abrirModalExtensionesAdmin(fid);
      refrescar();
      return;
    }

    if (a === 'addUser') {
      const nombre = $('#nu_nombre').value.trim(), correo = $('#nu_correo').value.trim();
      const rolesSel = [...document.querySelectorAll('input[name="nu_roles"]:checked')].map(c => c.value);
      const permisos = [...document.querySelectorAll('input[name="nu_perm"]:checked')].map(c => c.value);
      const areas = [...document.querySelectorAll('input[name="nu_areas"]:checked')].map(c => c.value).filter(v => v !== '__TODAS__');
      
      if (!nombre) return toast('Escribe un nombre', true);
      if (!correo || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return toast('Escribe un correo válido', true);
      if (!rolesSel.length) return toast('Selecciona al menos un rol', true);

      try {
        const u = await crearUsuario({ nombre, pin: generarPin(), rol: rolesSel.join(','), correo, permisos, areas_asignadas: areas, pin_temporal: true });
        registrarLog('Creó usuario', `${nombre} (${rolesSel.join(',')})`);
        const r = await enviarPinPorCorreo(u, 'nuevo');
        toast(r.ok ? `✅ Usuario creado y PIN enviado a ${correo}` : `⚠️ Usuario creado, pero no se pudo enviar el correo (${r.error}). Usa "Nuevo PIN" en la tabla.`, !r.ok);
        refrescar();
      } catch (e) { toast('Error al crear usuario: ' + e.message, true); }
    }
    if (a === 'editUser') return modalEditarUsuario(i);
    if (a === 'guardarEditUser') return guardarEditarUsuario(i);
    if (a === 'resetPin') {
      const { data: u } = await dbClient.from('usuarios_admin').select('id,nombre,correo').eq('id', i).single();
      if (!u) return;
      if (!confirm(`¿Generar un nuevo PIN temporal para ${u.nombre} y enviarlo a ${u.correo || 'su correo'}?`)) return;
      const r = await enviarPinPorCorreo(u, 'reset');
      if (r.ok) { registrarLog('Restableció PIN', u.nombre); toast(`📧 Nuevo PIN temporal enviado a ${u.correo}`); }
      else toast('No se pudo enviar el correo: ' + r.error, true);
    }
    if (a === 'delUser') {
      if (confirm('¿Eliminar este usuario?')) { await dbClient.from('usuarios_admin').delete().eq('id', i); registrarLog('Eliminó usuario', 'Usuario ID ' + i); toast('Usuario eliminado'); refrescar(); }
    }
    
    if (a === 'addPer') {
      const anio = +$('#np_a').value, sem = +$('#np_s').value, id = `${anio}-${sem}`;
      if (D.periodos.some(p => p.id === id)) return toast('Ese semestre ya existe', true);
      const ini = $('#np_i').value || `${anio}-${sem === 1 ? '01-15' : '07-15'}`, fin = $('#np_f').value || `${anio}-${sem === 1 ? '06-30' : '12-15'}`;
      const { error } = await dbClient.from('periodos').insert([{ id, nombre: `${anio} - Semestre ${sem}`, inicio: ini, fin, activo: true }]);
      if (error) return toast('Error al crear semestre: ' + error.message, true);
      registrarLog('Creó semestre', id); D = await leerNube(); toast('Semestre creado'); refrescar();
    }
    if (a === 'togPer') { const p = D.periodos.find(x => x.id === i); if (!p) return; const act = p.activo === false; const { error } = await dbClient.from('periodos').update({ activo: act }).eq('id', i); if (error) return toast('Error: ' + error.message, true); registrarLog(act ? 'Activó semestre' : 'Suspendió semestre', i); D = await leerNube(); toast(act ? 'Semestre activo' : 'Semestre suspendido'); refrescar(); }
    if (a === 'delPer') { if (confirm('¿Eliminar semestre?')) { await dbClient.from('periodos').delete().eq('id', i); registrarLog('Eliminó semestre', i); D = await leerNube(); toast('Semestre eliminado'); refrescar(); } }
    if (a === 'addFac') {
      const n = $('#nf_nom').value.trim(); if (!n) return toast('Escribe un nombre', true);
      const color = $('#nf_col').value;
      const usadas = new Set(D.facultades.map(emojiFac));
      const base = buscarEmoji(EMOJI_FAC, n, null);
      const emoji = (base && !usadas.has(base)) ? base : (EMOJI_POOL.find(x => !usadas.has(x)) || base || '🏛️');
      let ins = await dbClient.from('facultades').insert([{ id: nuevoId(n, D.facultades), nombre: n, color, emoji }]);
      if (ins.error && /emoji/i.test(ins.error.message || '')) ins = await dbClient.from('facultades').insert([{ id: nuevoId(n, D.facultades), nombre: n, color }]);
      if (ins.error) return toast('Error al crear facultad: ' + ins.error.message, true);
      registrarLog('Creó facultad', n); D = await leerNube(); toast('Facultad agregada'); refrescar();
    }
    if (a === 'delFac') { if (confirm('¿Eliminar facultad y sus programas?')) { await dbClient.from('facultades').delete().eq('id', i); registrarLog('Eliminó facultad', i); D = await leerNube(); toast('Facultad eliminada'); refrescar(); } }
    if (a === 'addProg') { const f = D.facultades.find(x => x.id === i), n = $('#np_' + i).value.trim(); if (!n) return toast('Escribe el nombre del programa', true); await dbClient.from('programas').insert([{ id: nuevoId(n, f.programas), facultad_id: i, nombre: n, nivel: $('#nl_' + i).value }]); registrarLog('Creó programa', n); D = await leerNube(); toast('Programa agregado'); refrescar(); }
    if (a === 'delProg') { if (confirm('¿Eliminar este programa?')) { await dbClient.from('programas').delete().eq('id', i); registrarLog('Eliminó programa', i); D = await leerNube(); toast('Programa eliminado'); refrescar(); } }
    if (a === 'addArea') { const n = $('#na_nom').value.trim(); if (!n) return toast('Escribe un nombre', true); await dbClient.from('areas').insert([{ id: nuevoId(n, D.areas), nombre: n }]); registrarLog('Creó área', n); D = await leerNube(); toast('Área agregada'); refrescar(); }
    if (a === 'delArea') { if (confirm('¿Eliminar área?')) { await dbClient.from('areas').delete().eq('id', i); registrarLog('Eliminó área', i); D = await leerNube(); toast('Área eliminada'); refrescar(); } }
    if (a === 'addCat') {
      const n = $('#nc_nom').value.trim(); if (!n) return toast('Escribe un nombre', true);
      const id = uid();
      const r = await dbClient.from('categorias').insert([{ id, nombre: n, color: $('#nc_col').value }]).select();
      if (r.error) { console.error('addCat', r.error); return toast('No se pudo crear la categoría: ' + (r.error.message || r.error.code), true); }
      registrarLog('Creó categoría', n);
      const nuevos = await leerNube(); if (nuevos) D = nuevos;
      if (!D.categorias.some(c => c.id === id)) return toast('Supabase no guardó la categoría (revisa las políticas RLS de la tabla categorias: debe permitir INSERT y SELECT).', true);
      toast('Categoría agregada'); refrescar();
    }
    if (a === 'delCat') { if (confirm('¿Eliminar categoría?')) { await dbClient.from('categorias').delete().eq('id', i); registrarLog('Eliminó categoría', i); D = await leerNube(); toast('Categoría eliminada'); refrescar(); } }
    if (a === 'bajarJson') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(D, null, 2)], { type: 'application/json' })); a.download = 'respaldo-calendario.json'; a.click(); }
  });

  document.addEventListener('change', async ev => {
    const t = ev.target;
    if (t.matches('[data-chk-areas] input[type=checkbox]')) {
      const box = t.closest('[data-chk-areas]'), todos = box.querySelector('input[value="__TODAS__"]');
      if (t === todos) { if (t.checked) box.querySelectorAll('input').forEach(c => { if (c !== todos) c.checked = false; }); }
      else if (t.checked && todos) todos.checked = false;
      return;
    }
    if (t.dataset.ch === 'sel') { t.checked ? SEL.add(t.dataset.i) : SEL.delete(t.dataset.i); return pintarTabla(); }
    if (t.dataset.ch === 'todos') { eventosFiltrados().filter(puedeEnEvento).forEach(e => t.checked ? SEL.add(e.id) : SEL.delete(e.id)); return pintarTabla(); }
    if (t.id && t.id.startsWith('x_')) { F[t.id.slice(2)] = t.value; SEL.clear(); return pintarTabla(); }
    if (t.id === 'nv_filtro_est') { NF.estado = t.value; return refrescar(); }
    if (t.dataset.per) { await dbClient.from('periodos').update({ [t.dataset.c]: t.value }).eq('id', t.dataset.per); registrarLog('Editó semestre', t.dataset.per); D = await leerNube(); toast('Actualizado'); }
    if (t.dataset.fac && !t.dataset.prog) { await dbClient.from('facultades').update({ [t.dataset.c]: t.value }).eq('id', t.dataset.fac); registrarLog('Editó facultad', t.dataset.fac); D = await leerNube(); toast('Actualizado'); }
    if (t.dataset.prog) { await dbClient.from('programas').update({ [t.dataset.c]: t.value }).eq('id', t.dataset.prog); registrarLog('Editó programa', t.dataset.prog); D = await leerNube(); toast('Actualizado'); }
    if (t.dataset.area) { await dbClient.from('areas').update({ nombre: t.value }).eq('id', t.dataset.area); registrarLog('Editó área', t.dataset.area); D = await leerNube(); toast('Actualizado'); }
    if (t.dataset.cat && t.dataset.c) { const val = t.dataset.c === 'subcategorias' ? t.value.split(',').map(x => x.trim()).filter(Boolean) : t.value; const rs = await dbClient.from('categorias').update({ [t.dataset.c]: val }).eq('id', t.dataset.cat); if (rs.error && t.dataset.c === 'subcategorias') return toast('Falta la columna en Supabase. Ejecuta: ALTER TABLE categorias ADD COLUMN subcategorias jsonb DEFAULT \'[]\'; ALTER TABLE eventos ADD COLUMN subcategoria text;', true); registrarLog('Editó categoría', t.dataset.cat); D = await leerNube(); toast('Actualizado'); }
    if (t.id === 'l_user' || t.id === 'l_acc') pintarLogs();
  });
  document.addEventListener('input', ev => {
    if (ev.target.id === 'x_q') { F.q = ev.target.value; SEL.clear(); pintarTabla(); }
    if (ev.target.id === 'nv_buscar') { NF.q = ev.target.value; refrescar(); }
    if (ev.target.id === 'l_q') pintarLogs();
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && $('#modal').classList.contains('on')) cerrarModal(); });

  (async function init() {
    if (!DB_READY) return;
    const hideLoader = () => { const l = document.getElementById('loader'); if (l && !l.classList.contains('hidden')) { l.classList.add('hidden'); setTimeout(() => l.style.display = 'none', 500); } };
    const safety = setTimeout(() => { hideLoader(); document.getElementById('error-msg').textContent = 'No se pudo conectar con Supabase. Revisa tu conexión o recarga la página.'; document.getElementById('error-box').hidden = false; }, 14000);
    D = await leerNube(); clearTimeout(safety);
    if (!D) {
      document.getElementById('error-msg').textContent = 'No se pudieron cargar los datos de Supabase. Verifica que la base de datos esté activa y las políticas RLS permitan leer.';
      document.getElementById('error-box').hidden = false; hideLoader(); return;
    }
    
    const sesGuardada = localStorage.getItem('ubosque_admin_session');
    if (sesGuardada) {
      try {
        const s = JSON.parse(sesGuardada);
        if (s && s.id && (Date.now() - (s.ts || 0) < 43200000)) {
          const { data: ud } = await dbClient.from('usuarios_admin').select('*').eq('id', s.id).maybeSingle();
          if (ud) { USUARIO_ACTUAL = { ...s, nombre: ud.nombre, rol: ud.rol, permisos: ud.permisos || [], areas: ud.areas_asignadas || [], tipo_usuario: ud.tipo_usuario || 'real' }; localStorage.setItem('ubosque_admin_session', JSON.stringify(USUARIO_ACTUAL)); }
          else localStorage.removeItem('ubosque_admin_session');
        } else {
          localStorage.removeItem('ubosque_admin_session');
        }
      } catch (e) { localStorage.removeItem('ubosque_admin_session'); }
    }

    const hoyAnio = new Date().getFullYear(), anios = aniosDisponibles();
    S.anio = anios.includes(hoyAnio) ? hoyAnio : anios[anios.length - 1] || hoyAnio;
    S.ref = new Date();
    
    if (window.location.search.includes('reset')) {
      irAdmin();
    } else if (USUARIO_ACTUAL) {
      irAdmin();
    } else {
      pintarPublico();
    }
    hideLoader();
  })();
