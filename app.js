// Escala de Cultos — IASD (versão com dados na nuvem: Firebase)
import { firebaseConfig } from './firebase-config.js';
import * as nuvem from './nuvem.js';

const LOCAL_ANTIGO = 'escala-cultos-iasd-v1';   // chave usada pela versão sem nuvem
const DIAS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const ICONES = {escolasabatina:'📚', pregacao:'🎤', sonoplastia:'🎧', louvor:'🎶', especial:'🎵', adoracao:'🧒', diaconos:'🤝', diaconisas:'🤝', recepcao:'👋'};
const SABADO = ['adoracao','diaconos','diaconisas','recepcao'];
const CONFIG_PADRAO = {
  igreja: 'Igreja Adventista do Sétimo Dia',
  versao: 5,
  funcoes: [
    {id:'escolasabatina', nome:'Escola Sabatina'},
    {id:'pregacao',    nome:'Pregação'},
    {id:'sonoplastia', nome:'Sonoplastia'},
    {id:'louvor',      nome:'Louvor Congregacional'},
    {id:'especial',    nome:'Louvor Especial'},
    {id:'adoracao',    nome:'Adoração Infantil'},
    {id:'diaconos',    nome:'Diáconos',   multiplo:true},
    {id:'diaconisas',  nome:'Diaconisas', multiplo:true},
    {id:'recepcao',    nome:'Recepção'}
  ],
  programas: [
    {id:'qua-oracao', dia:3, nome:'Culto de Oração',      hora:'19:30', ativo:true,  funcoes:['pregacao','sonoplastia','louvor','especial']},
    {id:'sab-es',     dia:6, nome:'Escola Sabatina',      hora:'09:00', ativo:false, funcoes:['sonoplastia','louvor','especial',...SABADO]},
    {id:'sab-divino', dia:6, nome:'Culto Divino',         hora:'10:30', ativo:true,  funcoes:['escolasabatina','pregacao','sonoplastia','louvor','especial',...SABADO]},
    {id:'sab-ja',     dia:6, nome:'Culto Jovem (JA)',     hora:'17:00', ativo:true,  funcoes:['pregacao','sonoplastia','louvor','especial',...SABADO]},
    {id:'dom-evang',  dia:0, nome:'Culto de Evangelismo', hora:'19:00', ativo:true,  funcoes:['pregacao','sonoplastia','louvor','especial']}
  ],
  avisosDias: 5
};

const $ = s => document.querySelector(s);
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- Estado em memória (espelho da nuvem) ---------- */
const estadoVazio = () => ({
  igreja: CONFIG_PADRAO.igreja, funcoes: [], programas: [],
  avisos: { dias: 5, enviados: {} },   // enviados: "data|programa|funcao|nome" -> timestamp
  membros: [], usuarios: [],
  escala: {}                            // "data|programa" -> {funcao: nome | [nomes], obs}
});
let S = estadoVazio();
let escalaDocs = [];       // documentos de escala carregados (para limpar mês)
let usuario = null;        // usuário logado {id, nome, email, perfil, funcoes, telefone}
let configCarregada = false;
let ouvintes = [];
let ouvinteEscala = null, faixaEscala = '';
let instalando = false;

function toast(msg, ms = 2400){ const t=$('#toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(toast.t); toast.t=setTimeout(()=>t.classList.remove('on'), ms); }
function erroNuvem(e){
  console.error(e);
  const c = e?.code || '';
  if (c.includes('permission-denied')) toast('Sem permissão para essa alteração.', 4000);
  else if (c.includes('unavailable')) toast('Sem conexão. A alteração será enviada quando a internet voltar.', 4000);
  else toast('Erro ao salvar: ' + (e?.message || e), 5000);
}
const traduzErroLogin = e => {
  const c = e?.code || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return 'E-mail ou senha incorretos';
  if (c.includes('invalid-email')) return 'E-mail inválido';
  if (c.includes('too-many-requests')) return 'Muitas tentativas. Aguarde alguns minutos.';
  if (c.includes('email-already-in-use')) return 'Este e-mail já tem conta';
  if (c.includes('weak-password')) return 'Senha fraca: use pelo menos 6 caracteres';
  if (c.includes('network')) return 'Sem conexão com a internet';
  if (c.includes('operation-not-allowed') || c.includes('configuration-not-found'))
    return 'O login por e-mail/senha ainda não está ativado no Firebase. No console do Firebase, vá em Authentication → Método de login → E-mail/senha → Ativar → Salvar, e tente de novo.';
  if (c.includes('unauthorized-domain')) return 'Este endereço ainda não foi autorizado no Firebase: Authentication → Configurações → Domínios autorizados → adicione ' + location.hostname;
  return 'Erro: ' + (e?.message || c);
};

/* ---------- Telas ---------- */
function mostrarTela(qual){
  $('#telaCarregando').hidden = qual !== 'carregando';
  $('#telaConfigurar').hidden = qual !== 'configurar';
  $('#telaLogin').hidden = qual !== 'login';
  document.body.classList.toggle('deslogado', qual !== 'app');
}
const carregando = msg => { $('#carregandoMsg').textContent = msg || 'Carregando…'; mostrarTela('carregando'); };

/* ---------- Datas e mês ---------- */
let mesAtual = (()=>{ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); })();
const isoDe = dt => dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
const dataDeIso = iso => { const [y,m,d] = iso.split('-').map(Number); return new Date(y, m-1, d); };
const hojeLocal = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const somaDias = (dt, n) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n);
const diasEntre = (a, b) => Math.round((b - a) / 86400000);
function mudarMes(delta){
  const [y,m] = mesAtual.split('-').map(Number);
  const d = new Date(y, m-1+delta, 1);
  mesAtual = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  ouvirEscalaDaFaixa(); renderTudo();
}
function nomeMes(ym){
  const [y,m] = ym.split('-').map(Number);
  const s = new Date(y, m-1, 1).toLocaleDateString('pt-BR',{month:'long', year:'numeric'});
  return s.charAt(0).toUpperCase()+s.slice(1);
}
function diasDoMes(ym){
  const [y,m] = ym.split('-').map(Number);
  const total = new Date(y, m, 0).getDate(), out = [];
  for (let d=1; d<=total; d++){
    const dt = new Date(y, m-1, d);
    const progs = S.programas.filter(p => p.ativo && Number(p.dia) === dt.getDay())
                             .sort((a,b) => (a.hora||'').localeCompare(b.hora||''));
    if (progs.length) out.push({ iso: isoDe(dt), dt, progs });
  }
  return out;
}
const fmtData = dt => DIAS[dt.getDay()]+', '+String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0');
const ehMultiplo = fid => !!(S.funcoes.find(f => f.id === fid) || {}).multiplo;
const nomesDe = v => (Array.isArray(v) ? v : String(v ?? '').split(',')).map(x => String(x).trim()).filter(Boolean);
const vagasDe = v => Array.isArray(v) ? [...v] : nomesDe(v);
const textoDe = v => Array.isArray(v) ? nomesDe(v).join(', ') : String(v ?? '');
const nomeFuncao = id => (S.funcoes.find(f => f.id === id) || {}).nome || id;
const funcoesDo = p => (p.funcoes||[]).filter(fid => S.funcoes.some(f => f.id === fid))
                                       .sort((a,b) => S.funcoes.findIndex(f=>f.id===a) - S.funcoes.findIndex(f=>f.id===b));
const idEscala = chave => chave.replace('|', '_');

/* ---------- Abas ---------- */
function abrirAba(tab){
  const b = document.querySelector(`nav button[data-tab="${tab}"]`);
  if (!b || b.hidden) tab = 'escala';
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('ativo', x.dataset.tab===tab));
  document.querySelectorAll('main section').forEach(s => s.classList.toggle('ativo', s.id==='tab-'+tab));
  renderTudo();
}
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => abrirAba(b.dataset.tab)));

/* ---------- Renderização sem atrapalhar quem está digitando ---------- */
let renderAdiado = false;
const editando = () => {
  const a = document.activeElement;
  return !!(a && a.closest && a.closest('main') && a.matches('input:not([type=checkbox]), select, textarea'));
};
function agendarRender(){
  if (editando()) { renderAdiado = true; return; }
  renderTudo();
}
document.addEventListener('focusout', () => setTimeout(() => {
  if (renderAdiado && !editando()) { renderAdiado = false; renderTudo(); }
}, 60));

/* ---------- Login ---------- */
const ehAdmin = () => usuario?.perfil === 'admin';
let modoSetup = false;

async function mostrarLogin(msgErro){
  carregando('Conectando…');
  try { modoSetup = !(await nuvem.instalado()); }
  catch(e){ modoSetup = false; console.error(e); }
  mostrarTela('login');
  $('#campoNome').hidden = !modoSetup; $('#campoSenha2').hidden = !modoSetup;
  $('#lgEsqueci').hidden = modoSetup;
  $('#loginSub').textContent = modoSetup ? 'Primeiro acesso: crie o administrador do sistema' : 'Entre com seu e-mail e senha';
  $('#lgBtn').textContent = modoSetup ? 'Criar administrador e entrar' : 'Entrar';
  $('#loginIgreja').textContent = S.igreja || 'Escala de Cultos';
  $('#lgErro').textContent = msgErro || ''; $('#lgInfo').textContent = '';
  $('#lgSenha').value = ''; $('#lgSenha2').value = '';
  setTimeout(() => $(modoSetup ? '#lgNome' : '#lgEmail').focus(), 0);
}
$('#formLogin').addEventListener('submit', async e => {
  e.preventDefault();
  const erro = m => { $('#lgErro').textContent = m; $('#lgInfo').textContent = ''; };
  const email = $('#lgEmail').value.trim().toLowerCase(), senha = $('#lgSenha').value;
  $('#lgBtn').disabled = true;
  try {
    if (modoSetup){
      const nome = $('#lgNome').value.trim();
      if (!nome) return erro('Informe seu nome');
      if (senha.length < 6) return erro('A senha precisa ter pelo menos 6 caracteres');
      if (senha !== $('#lgSenha2').value) return erro('As senhas não conferem');
      instalando = true;
      await nuvem.criarPrimeiroAdmin(nome, email, senha, clone(CONFIG_PADRAO));
      instalando = false;
    } else {
      await nuvem.entrar(email, senha);
    }
  } catch(err){ instalando = false; erro(traduzErroLogin(err)); }
  finally { $('#lgBtn').disabled = false; }
});
$('#lgEsqueci').addEventListener('click', async () => {
  const email = $('#lgEmail').value.trim();
  if (!email) { $('#lgErro').textContent = 'Digite seu e-mail acima e clique de novo em "Esqueci minha senha".'; return; }
  try { await nuvem.redefinirSenha(email); $('#lgErro').textContent = ''; $('#lgInfo').textContent = 'Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha (veja também o spam).'; }
  catch(err){ $('#lgErro').textContent = traduzErroLogin(err); }
});
$('#btnSair').addEventListener('click', () => nuvem.sair());

function pararOuvintes(){
  ouvintes.forEach(f => { try{ f(); }catch(e){} }); ouvintes = [];
  if (ouvinteEscala) { try{ ouvinteEscala(); }catch(e){} ouvinteEscala = null; faixaEscala = ''; }
}
async function aoMudarLogin(u){
  pararOuvintes(); usuario = null; S = estadoVazio(); configCarregada = false;
  if (!u) { mostrarLogin(); return; }
  carregando('Carregando seus dados…');
  ouvintes.push(nuvem.ouvirDoc('usuarios', u.uid, d => {
    if (!d) { if (instalando) return; sairComErro('Seu acesso não está liberado. Fale com o administrador.'); return; }
    if (!['admin','lider'].includes(d.perfil)) { sairComErro('Seu acesso foi removido. Fale com o administrador.'); return; }
    const primeira = !usuario;
    usuario = { id: u.uid, ...d, funcoes: d.funcoes || [] };
    if (primeira) iniciarOuvintes();
    aplicarPerfil(); agendarRender();
  }, e => sairComErro(traduzErroLogin(e))));
}
async function sairComErro(msg){ pararOuvintes(); await nuvem.sair(); mostrarLogin(msg); }

function iniciarOuvintes(){
  ouvintes.push(nuvem.ouvirDoc('config', 'geral', d => {
    if (!d) {
      if (ehAdmin()) nuvem.definir('config', 'geral', clone(CONFIG_PADRAO), false).catch(erroNuvem);
      return;
    }
    if ((d.versao || 4) < 5 && ehAdmin()) { migrarConfigV5(d); return; }
    S.igreja = d.igreja || CONFIG_PADRAO.igreja;
    S.funcoes = d.funcoes || [];
    S.programas = d.programas || [];
    S.avisos.dias = Number(d.avisosDias) || 5;
    if (!configCarregada){ configCarregada = true; mostrarTela('app'); abrirAba('escala'); }
    agendarRender();
  }, erroNuvem));
  ouvintes.push(nuvem.ouvirColecao('membros', l => { S.membros = l; agendarRender(); }, erroNuvem));
  ouvintes.push(nuvem.ouvirColecao('usuarios', l => { S.usuarios = l; agendarRender(); }, erroNuvem));
  ouvirEscalaDaFaixa();
}
// v5: acrescenta a função "Escola Sabatina" e a coloca no Culto Divino de sábado
function migrarConfigV5(d){
  const cfg = clone(d);
  cfg.funcoes = cfg.funcoes || [];
  if (!cfg.funcoes.some(f => f.id === 'escolasabatina')) cfg.funcoes.unshift({ id:'escolasabatina', nome:'Escola Sabatina' });
  (cfg.programas || []).forEach(p => {
    const divino = p.id === 'sab-divino' || (Number(p.dia) === 6 && /divino/i.test(p.nome || ''));
    if (divino){ p.funcoes = p.funcoes || []; if (!p.funcoes.includes('escolasabatina')) p.funcoes.unshift('escolasabatina'); }
  });
  cfg.versao = 5;
  nuvem.definir('config', 'geral', cfg, false).catch(erroNuvem);
}
// Escuta a escala do mês aberto e dos próximos 60 dias (para os avisos)
function ouvirEscalaDaFaixa(){
  if (!usuario) return;
  const [y,m] = mesAtual.split('-').map(Number);
  const hoje = hojeLocal();
  const ini = isoDe(new Date(Math.min(new Date(y, m-1, 1), hoje)));
  const fim = isoDe(new Date(Math.max(new Date(y, m, 0), somaDias(hoje, 60))));
  const faixa = ini + '..' + fim;
  if (faixa === faixaEscala) return;
  if (ouvinteEscala) ouvinteEscala();
  faixaEscala = faixa;
  ouvinteEscala = nuvem.ouvirEscala(ini, fim, aplicarEscala, erroNuvem);
}
function aplicarEscala(docs){
  escalaDocs = docs;
  const mapa = {}, enviados = {};
  docs.forEach(d => {
    const chave = d.data + '|' + d.programa;
    const { id, data, programa, _avisos, ...campos } = d;
    if (Object.keys(campos).length) mapa[chave] = campos;
    Object.entries(_avisos || {}).forEach(([k, ts]) => { enviados[chave + '|' + k] = ts; });
  });
  // Alterações locais ainda não enviadas têm prioridade
  Object.entries(pendentes).forEach(([chave, campos]) => {
    const r = mapa[chave] ||= {};
    Object.entries(campos).forEach(([f, v]) => { if (v === null) delete r[f]; else r[f] = v; });
    if (!Object.keys(r).length) delete mapa[chave];
  });
  S.escala = mapa; S.avisos.enviados = enviados;
  agendarRender();
}

function aplicarPerfil(){
  document.querySelectorAll('[data-perfil="admin"]').forEach(el => el.hidden = !ehAdmin());
  $('#usuarioInfo').textContent = usuario.nome + ' · ' + (ehAdmin() ? 'Administrador' : 'Líder');
}

/* ---------- Gravação da escala (com espera enquanto digita) ---------- */
const pendentes = {};   // chave -> {funcao: valor | null}
const temporizadores = {};
function gravarCampo(chave, fid, valor, imediato = false){
  (pendentes[chave] ||= {})[fid] = valor;
  const t = chave + '|' + fid;
  clearTimeout(temporizadores[t]);
  if (imediato) enviarCampo(chave, fid);
  else temporizadores[t] = setTimeout(() => enviarCampo(chave, fid), 700);
}
async function enviarCampo(chave, fid){
  const t = chave + '|' + fid; clearTimeout(temporizadores[t]); delete temporizadores[t];
  const campos = pendentes[chave]; if (!campos || !(fid in campos)) return;
  const valor = campos[fid];
  const [data, programa] = chave.split('|');
  marcarSalvando(+1);
  try { await nuvem.definir('escala', idEscala(chave), { data, programa, [fid]: valor }); }
  catch(e){ erroNuvem(e); }
  finally { marcarSalvando(-1); }
  if (pendentes[chave] && pendentes[chave][fid] === valor){
    delete pendentes[chave][fid];
    if (!Object.keys(pendentes[chave]).length) delete pendentes[chave];
  }
}
function enviarTudoPendente(){ Object.keys(temporizadores).forEach(t => { const i = t.lastIndexOf('|'); enviarCampo(t.slice(0, i), t.slice(i+1)); }); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') enviarTudoPendente(); });
window.addEventListener('beforeunload', e => {
  if (Object.keys(temporizadores).length || salvando > 0){ enviarTudoPendente(); e.preventDefault(); e.returnValue = ''; }
});
let salvando = 0;
function marcarSalvando(d){
  salvando = Math.max(0, salvando + d);
  $('#statusNuvem').textContent = salvando ? '⏳ salvando…' : '☁️ salvo';
}

/* ---------- Escala ---------- */
const funcoesDoUsuario = () => ehAdmin() ? S.funcoes.map(f => f.id) : (usuario?.funcoes || []);
const funcoesVisiveis = p => { const ok = funcoesDoUsuario(); return funcoesDo(p).filter(f => ok.includes(f)); };
const podeTema = () => ehAdmin() || funcoesDoUsuario().includes('pregacao');
function renderEscala(){
  const box = $('#listaDias'), dias = diasDoMes(mesAtual);
  const minhas = funcoesDoUsuario().filter(id => S.funcoes.some(f => f.id === id));
  $('#dicaEscala').innerHTML = ehAdmin()
    ? 'Digite os nomes ou escolha da lista. Tudo é salvo automaticamente na nuvem e aparece para todos. O rodízio usa os membros cadastrados e as funções marcadas para cada um.'
    : (minhas.length ? 'Você é responsável por: <strong>' + minhas.map(id => esc(nomeFuncao(id))).join(', ') + '</strong>. A escala completa está em Visualizar / Enviar.' : '');
  if (!minhas.length){ box.innerHTML = '<p class="vazio">Nenhum campo foi atribuído a você ainda. Peça ao administrador para definir quais campos você preenche.</p>'; return; }
  const visiveis = dias.map(d => ({...d, progs: d.progs.filter(p => funcoesVisiveis(p).length)})).filter(d => d.progs.length);
  if (!visiveis.length){ box.innerHTML = '<p class="vazio">Nenhuma programação deste mês usa os seus campos.</p>'; return; }
  box.innerHTML = visiveis.map(d => `
    <article class="dia ${d.dt.getDay()===6?'sabado':''}">
      <h3>${fmtData(d.dt)}</h3>
      ${d.progs.map(p => {
        const k = d.iso+'|'+p.id, r = S.escala[k] || {};
        return `<div class="prog">
          <div class="prog-tit"><strong>${esc(p.nome)}</strong><span>${esc(p.hora)}</span></div>
          <div class="campos">
            ${funcoesVisiveis(p).map(fid => campoHTML(k, fid, r[fid])).join('')}
            ${podeTema() ? `<label>Tema / observação<input data-k="${esc(k)}" data-f="obs" value="${esc(r.obs||'')}" placeholder="Opcional"></label>` : ''}
          </div>
        </div>`;
      }).join('')}
    </article>`).join('');
}
function campoHTML(k, fid, v){
  const attrs = `list="dl-${esc(fid)}" data-k="${esc(k)}" data-f="${esc(fid)}"`;
  if (!ehMultiplo(fid)){
    const t = textoDe(v);
    return `<label>${esc(nomeFuncao(fid))}<input ${attrs} value="${esc(t)}" placeholder="Nome" class="${t?'preenchido':''}"></label>`;
  }
  let vagas = vagasDe(v); if (!vagas.length) vagas = [''];
  return `<div class="multi"><span>${esc(nomeFuncao(fid))} <small>(${nomesDe(v).length})</small></span>
    ${vagas.map((n, i) => `<div class="multi-linha">
      <input ${attrs} data-idx="${i}" value="${esc(n)}" placeholder="Nome" class="${n.trim()?'preenchido':''}">
      <button type="button" class="rm" data-rm="${i}" data-k="${esc(k)}" data-f="${esc(fid)}" title="Remover">×</button></div>`).join('')}
    <button type="button" class="add" data-add="1" data-k="${esc(k)}" data-f="${esc(fid)}">+ Adicionar</button></div>`;
}
// Atualiza o estado local e agenda a gravação na nuvem
function atualizarCampo(k, fid, v, imediato = false){
  const r = S.escala[k] ||= {};
  const vazio = Array.isArray(v) ? (!v.length || (v.length === 1 && !String(v[0]).trim())) : !String(v).trim();
  if (vazio) delete r[fid]; else r[fid] = v;
  if (!Object.keys(r).length) delete S.escala[k];
  gravarCampo(k, fid, vazio ? null : v, imediato);
}
$('#listaDias').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]'); if (!b) return;
  const k = b.dataset.k, fid = b.dataset.f;
  if (!funcoesDoUsuario().includes(fid)) return;
  const vagas = vagasDe((S.escala[k] || {})[fid]);
  let foco;
  if (b.dataset.add){ if (!vagas.length) vagas.push(''); vagas.push(''); foco = vagas.length - 1; }
  else vagas.splice(Number(b.dataset.rm), 1);
  // vagas vazias também são gravadas para o campo extra continuar aparecendo
  const r = S.escala[k] ||= {};
  if (!vagas.length || (vagas.length === 1 && !vagas[0].trim())) { delete r[fid]; gravarCampo(k, fid, null, true); }
  else { r[fid] = vagas; gravarCampo(k, fid, vagas, true); }
  renderEscala();
  if (foco != null) document.querySelector(`#listaDias input[data-k="${k}"][data-f="${fid}"][data-idx="${foco}"]`)?.focus();
});
$('#listaDias').addEventListener('input', e => {
  const i = e.target; if (!i.dataset.k) return;
  if (i.dataset.f === 'obs' ? !podeTema() : !funcoesDoUsuario().includes(i.dataset.f)) return;
  const v = i.value.trim();
  if (i.dataset.idx != null){
    const vagas = vagasDe((S.escala[i.dataset.k] || {})[i.dataset.f]);
    while (vagas.length <= Number(i.dataset.idx)) vagas.push('');
    vagas[Number(i.dataset.idx)] = i.value;
    atualizarCampo(i.dataset.k, i.dataset.f, vagas);
    const cont = i.closest('.multi').querySelector('small'); if (cont) cont.textContent = '(' + nomesDe(vagas).length + ')';
  } else atualizarCampo(i.dataset.k, i.dataset.f, i.value);
  if (i.dataset.f !== 'obs') i.classList.toggle('preenchido', !!v);
  marcarSalvando(0); $('#statusNuvem').textContent = '⏳ salvando…';
});
$('#listaDias').addEventListener('focusout', e => {
  const i = e.target; if (i.dataset?.k) enviarCampo(i.dataset.k, i.dataset.f);
});

function renderDatalists(){
  $('#datalists').innerHTML = S.funcoes.map(f => {
    let lista = S.membros.filter(m => (m.funcoes||[]).includes(f.id));
    if (!lista.length) lista = S.membros;
    return `<datalist id="dl-${esc(f.id)}">${lista.map(m => `<option value="${esc(m.nome)}">`).join('')}</datalist>`;
  }).join('');
}

$('#btnSugerir').addEventListener('click', async () => {
  const dias = diasDoMes(mesAtual), cont = {};
  dias.forEach(d => d.progs.forEach(p => {
    const r = S.escala[d.iso+'|'+p.id] || {};
    funcoesDo(p).forEach(fid => nomesDe(ehMultiplo(fid) ? r[fid] : [textoDe(r[fid])]).forEach(nm => { cont[fid] ??= {}; cont[fid][nm] = (cont[fid][nm]||0)+1; }));
  }));
  let n = 0; const semGente = new Set(), ops = [];
  dias.forEach(d => d.progs.forEach(p => {
    const k = d.iso+'|'+p.id, r = S.escala[k] || {};
    const mudancas = {};
    funcoesVisiveis(p).forEach(fid => {
      const multi = ehMultiplo(fid);
      let vagas = multi ? vagasDe(r[fid]) : [textoDe(r[fid])];
      if (multi && !vagas.length) vagas = ['', ''];
      if (!vagas.some(x => !x.trim())) return;
      const escolher = () => {
        const usados = new Set(Object.entries(r).filter(([c]) => c!=='obs').flatMap(([,v]) => nomesDe(Array.isArray(v) ? v : [v])).concat(nomesDe(vagas)));
        const pool = S.membros.filter(m => (m.funcoes||[]).includes(fid) && !usados.has(m.nome));
        if (!pool.length){ semGente.add(nomeFuncao(fid)); return null; }
        cont[fid] ??= {};
        const min = Math.min(...pool.map(m => cont[fid][m.nome]||0));
        const cand = pool.filter(m => (cont[fid][m.nome]||0) === min);
        const pick = cand[Math.floor(Math.random()*cand.length)];
        cont[fid][pick.nome] = min+1; n++; return pick.nome;
      };
      vagas = vagas.map(x => x.trim() ? x : (escolher() || ''));
      if (nomesDe(vagas).length){ r[fid] = multi ? vagas : vagas[0]; S.escala[k] = r; mudancas[fid] = r[fid]; }
    });
    if (Object.keys(mudancas).length) ops.push({ col:'escala', id: idEscala(k), dados: { data: d.iso, programa: p.id, ...mudancas } });
  }));
  renderEscala();
  if (ops.length){
    marcarSalvando(+1);
    try { await nuvem.lote(ops); } catch(e){ erroNuvem(e); } finally { marcarSalvando(-1); }
  }
  toast(n ? `${n} vaga(s) preenchida(s)` + (semGente.size ? ` · sem membros para: ${[...semGente].join(', ')}` : '')
          : (semGente.size ? `Cadastre membros para: ${[...semGente].join(', ')}` : 'Nenhuma vaga vazia'));
});

$('#btnLimpar').addEventListener('click', async () => {
  if (!ehAdmin()) return;
  if (!confirm('Apagar toda a escala de '+nomeMes(mesAtual)+' para todos os usuários?')) return;
  const ops = escalaDocs.filter(d => d.data.startsWith(mesAtual+'-')).map(d => ({ tipo:'apagar', col:'escala', id:d.id }));
  try { await nuvem.lote(ops); toast('Mês limpo'); } catch(e){ erroNuvem(e); }
});

/* ---------- Membros ---------- */
function chipsFuncoes(sel, attrs=''){
  return S.funcoes.map(f => `<label class="chip ${sel.includes(f.id)?'on':''}"><input type="checkbox" value="${esc(f.id)}" ${sel.includes(f.id)?'checked':''} ${attrs}>${esc(f.nome)}</label>`).join('');
}
function contagemMes(nome){
  let c = 0;
  Object.entries(S.escala).forEach(([k,r]) => { if (k.startsWith(mesAtual+'-')) Object.entries(r).forEach(([f,v]) => { if (f!=='obs') c += nomesDe(Array.isArray(v) ? v : [v]).filter(x => x === nome).length; }); });
  return c;
}
function renderMembros(){
  const marcados = [...document.querySelectorAll('#novoFuncoes input:checked')].map(i => i.value);
  $('#novoFuncoes').innerHTML = chipsFuncoes(marcados);
  const box = $('#listaMembros');
  $('#totalMembros').textContent = S.membros.length ? '(' + S.membros.length + ')' : '';
  $('#btnExcluirTodos').hidden = !S.membros.length;
  if (!S.membros.length){ box.innerHTML = '<p class="vazio">Nenhum membro cadastrado ainda.</p>'; return; }
  const lista = [...S.membros].sort((a,b) => (a.nome||'').localeCompare(b.nome||'','pt-BR'));
  box.innerHTML = `<div class="rolar"><table><tr><th>Nome</th><th>WhatsApp</th><th>Pode atuar em</th><th>Escalas em ${esc(nomeMes(mesAtual))}</th><th></th></tr>
    ${lista.map(m => `<tr>
      <td><input value="${esc(m.nome)}" data-mid="${esc(m.id)}" data-campo="nome" style="width:100%"></td>
      <td><input class="tel" value="${esc(m.telefone||'')}" data-mid="${esc(m.id)}" data-campo="telefone" inputmode="tel" placeholder="(DDD) número"></td>
      <td><div class="chips">${chipsFuncoes(m.funcoes||[], `data-mid="${esc(m.id)}" data-campo="funcao"`)}</div></td>
      <td style="text-align:center">${contagemMes(m.nome)}</td>
      <td><button class="btn perigo pq" data-del="${esc(m.id)}">Excluir</button></td></tr>`).join('')}
  </table></div>`;
}
document.addEventListener('change', e => {
  const c = e.target.closest?.('.chip'); if (c) c.classList.toggle('on', e.target.checked);
});
const dadosMembro = m => ({ nome: m.nome, telefone: m.telefone || '', funcoes: m.funcoes || [] });
$('#listaMembros').addEventListener('change', async e => {
  const i = e.target, m = S.membros.find(x => x.id === i.dataset.mid); if (!m) return;
  const ops = [];
  if (i.dataset.campo === 'nome'){
    const novo = i.value.trim(); if (!novo){ i.value = m.nome; return; }
    const antigo = m.nome; m.nome = novo;
    // troca o nome nas escalas carregadas
    Object.entries(S.escala).forEach(([k, r]) => {
      const mud = {};
      Object.keys(r).forEach(f => {
        if (f === 'obs') return;
        if (Array.isArray(r[f]) && r[f].some(x => x.trim() === antigo)) mud[f] = r[f].map(x => x.trim() === antigo ? novo : x);
        else if (r[f] === antigo) mud[f] = novo;
      });
      if (Object.keys(mud).length){ const [data, programa] = k.split('|'); ops.push({ col:'escala', id:idEscala(k), dados:{ data, programa, ...mud } }); }
    });
  } else if (i.dataset.campo === 'telefone'){
    m.telefone = i.value.trim();
    if (m.telefone && !telefoneValido(m.telefone)) toast('Confira o número: use DDD + número, ex.: (71) 99999-9999');
  } else if (i.dataset.campo === 'funcao'){
    m.funcoes = m.funcoes || [];
    if (i.checked){ if (!m.funcoes.includes(i.value)) m.funcoes.push(i.value); }
    else m.funcoes = m.funcoes.filter(f => f !== i.value);
  }
  ops.push({ col:'membros', id:m.id, dados: dadosMembro(m), mesclar:false });
  try { await nuvem.lote(ops); } catch(err){ erroNuvem(err); }
});
$('#listaMembros').addEventListener('click', async e => {
  const id = e.target.dataset.del; if (!id) return;
  const m = S.membros.find(x => x.id === id);
  if (!confirm('Excluir '+m.nome+'? (as escalas já feitas continuam com o nome)')) return;
  try { await nuvem.apagar('membros', id); } catch(err){ erroNuvem(err); }
});
$('#btnExcluirTodos').addEventListener('click', async () => {
  if (!ehAdmin() || !S.membros.length) return;
  if (!confirm('Excluir TODOS os ' + S.membros.length + ' membros cadastrados, para todos os usuários?\n\nAs escalas já feitas continuam com os nomes. Esta ação não pode ser desfeita.')) return;
  try { await nuvem.lote(S.membros.map(m => ({ tipo:'apagar', col:'membros', id:m.id }))); toast('Todos os membros foram excluídos'); }
  catch(err){ erroNuvem(err); }
});
function novoMembro(nome, funcoes, telefone=''){
  nome = nome.trim(); if (!nome) return null;
  if (S.membros.some(m => m.nome.toLowerCase() === nome.toLowerCase())) return null;
  return { id: uid(), nome, telefone: telefone.trim(), funcoes };
}
$('#btnAddMembro').addEventListener('click', async () => {
  const funcoes = [...document.querySelectorAll('#novoFuncoes input:checked')].map(i => i.value);
  const m = novoMembro($('#novoNome').value, funcoes, $('#novoTel').value);
  if (!m) { toast('Informe um nome que ainda não esteja cadastrado'); return; }
  $('#novoNome').value = ''; $('#novoTel').value = '';
  try { await nuvem.definir('membros', m.id, dadosMembro(m), false); toast('Membro adicionado'); } catch(err){ erroNuvem(err); }
});
$('#novoNome').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnAddMembro').click(); });
$('#btnAddVarios').addEventListener('click', async () => {
  const vistos = new Set(S.membros.map(m => m.nome.toLowerCase())), ops = [];
  $('#variosNomes').value.split('\n').forEach(l => {
    const nome = l.trim(); if (!nome || vistos.has(nome.toLowerCase())) return;
    vistos.add(nome.toLowerCase());
    const id = uid(); ops.push({ col:'membros', id, dados:{ nome, telefone:'', funcoes:[] }, mesclar:false });
  });
  $('#variosNomes').value = '';
  try { await nuvem.lote(ops); toast(ops.length+' membro(s) adicionado(s). Marque as funções de cada um na lista.'); } catch(err){ erroNuvem(err); }
});

/* ---------- Usuários (admin) ---------- */
const usuariosAtivos = () => S.usuarios.filter(u => ['admin','lider'].includes(u.perfil));
function renderUsuarios(){
  if (!ehAdmin()) { $('#listaUsuarios').innerHTML = ''; return; }
  const marcados = [...document.querySelectorAll('#nuFuncoes input:checked')].map(i => i.value);
  $('#nuFuncoes').innerHTML = chipsFuncoes(marcados);
  const lista = usuariosAtivos().sort((a,b) => (a.nome||'').localeCompare(b.nome||'','pt-BR'));
  $('#listaUsuarios').innerHTML = `<div class="rolar"><table>
    <tr><th>Nome</th><th>E-mail</th><th>WhatsApp</th><th>Perfil</th><th>Campos que preenche</th><th>Ações</th></tr>
    ${lista.map(u => { const eu = u.id === usuario.id; return `<tr>
      <td>${esc(u.nome)} ${eu ? '<small>(você)</small>' : ''}</td>
      <td>${esc(u.email)}</td>
      <td><input class="tel" value="${esc(u.telefone||'')}" data-utel="${esc(u.id)}" inputmode="tel" placeholder="(DDD) número"></td>
      <td>${eu ? `<span class="tag admin">Administrador</span>` :
        `<select data-uperfil="${esc(u.id)}"><option value="lider" ${u.perfil==='lider'?'selected':''}>Líder</option><option value="admin" ${u.perfil==='admin'?'selected':''}>Administrador</option></select>`}</td>
      <td>${u.perfil === 'admin' ? '<span class="dica">Todos</span>' :
        `<div class="chips">${chipsFuncoes(u.funcoes||[], `data-ufunc="${esc(u.id)}"`)}</div>${(u.funcoes||[]).length ? '' : '<small style="color:#b3261e">Nenhum campo — este líder não verá nada na Escala</small>'}`}</td>
      <td>${eu ? `<button class="btn sec pq" data-minha="1">Alterar senha</button>` :
        `<button class="btn sec pq" data-uredef="${esc(u.id)}">Enviar redefinição de senha</button>
         <button class="btn perigo pq" data-udel="${esc(u.id)}">Excluir</button>`}</td></tr>`; }).join('')}
  </table></div>`;
}
$('#listaUsuarios').addEventListener('change', async e => {
  const i = e.target;
  try {
    if (i.dataset.utel){
      const tel = i.value.trim();
      if (tel && !telefoneValido(tel)) toast('Confira o número: use DDD + número');
      await nuvem.definir('usuarios', i.dataset.utel, { telefone: tel });
    } else if (i.dataset.ufunc){
      const u = S.usuarios.find(x => x.id === i.dataset.ufunc); if (!u) return;
      let f = [...(u.funcoes||[])];
      if (i.checked){ if (!f.includes(i.value)) f.push(i.value); } else f = f.filter(x => x !== i.value);
      await nuvem.definir('usuarios', u.id, { funcoes: f });
    } else if (i.dataset.uperfil){
      if (i.dataset.uperfil === usuario.id) return;
      await nuvem.definir('usuarios', i.dataset.uperfil, { perfil: i.value === 'admin' ? 'admin' : 'lider' });
      toast('Perfil atualizado');
    }
  } catch(err){ erroNuvem(err); }
});
$('#nuPerfil').addEventListener('change', () => { $('#nuCampos').hidden = $('#nuPerfil').value === 'admin'; });
$('#listaUsuarios').addEventListener('click', async e => {
  const d = e.target.dataset;
  if (d.minha) { abrirDialogSenha(); return; }
  if (d.uredef){
    const u = S.usuarios.find(x => x.id === d.uredef); if (!u) return;
    try { await nuvem.redefinirSenha(u.email); toast('E-mail de redefinição enviado para ' + u.email, 4000); } catch(err){ toast(traduzErroLogin(err), 4000); }
  }
  if (d.udel){
    const u = S.usuarios.find(x => x.id === d.udel); if (!u || u.id === usuario.id) return;
    if (!confirm('Excluir o acesso de '+u.nome+'? Ele não conseguirá mais entrar no sistema.')) return;
    try { await nuvem.definir('usuarios', u.id, { perfil: 'removido', funcoes: [] }); toast('Acesso removido'); } catch(err){ erroNuvem(err); }
  }
});
$('#btnAddUsuario').addEventListener('click', async () => {
  const nome = $('#nuNome').value.trim(), email = $('#nuEmail').value.trim().toLowerCase(), senha = $('#nuSenha').value;
  if (!nome || !email) return toast('Informe nome e e-mail');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('E-mail inválido');
  if (usuariosAtivos().some(u => (u.email||'').toLowerCase() === email)) return toast('Esse e-mail já é usuário');
  const perfil = $('#nuPerfil').value === 'admin' ? 'admin' : 'lider';
  const funcoes = [...document.querySelectorAll('#nuFuncoes input:checked')].map(i => i.value);
  if (perfil === 'lider' && !funcoes.length) return toast('Marque ao menos um campo para este líder');
  const dados = { nome, email, perfil, telefone: $('#nuTel').value.trim(), funcoes: perfil === 'lider' ? funcoes : [] };
  const btn = $('#btnAddUsuario'); btn.disabled = true;
  try {
    const antigo = S.usuarios.find(u => (u.email||'').toLowerCase() === email);
    if (antigo) {
      // reativa um usuário que tinha sido excluído (a senha antiga continua valendo)
      await nuvem.definir('usuarios', antigo.id, dados, false);
      toast('Usuário reativado. Ele entra com a senha que já tinha (ou use "Enviar redefinição de senha").', 5000);
    } else {
      if (senha.length < 6) { toast('A senha precisa ter pelo menos 6 caracteres'); return; }
      const novoId = await nuvem.criarConta(email, senha);
      await nuvem.definir('usuarios', novoId, dados, false);
      toast('Usuário ' + email + ' criado. Passe para ele o e-mail e a senha inicial.', 4000);
    }
    ['#nuNome','#nuEmail','#nuSenha','#nuTel'].forEach(s => $(s).value = ''); $('#nuPerfil').value = 'lider'; $('#nuCampos').hidden = false;
    $('#nuFuncoes').innerHTML = chipsFuncoes([]);
  } catch(err){
    if ((err?.code||'').includes('email-already-in-use')) toast('Este e-mail já tem conta no Firebase, mas não está na lista. Apague-o em Authentication no console do Firebase e tente de novo.', 7000);
    else toast(traduzErroLogin(err), 5000);
  } finally { btn.disabled = false; }
});

/* troca da própria senha */
function abrirDialogSenha(){
  ['#snAtual','#snNova','#snNova2'].forEach(s => $(s).value = '');
  $('#snErro').textContent = '';
  $('#dlgSenha').showModal();
}
$('#btnMinhaSenha').addEventListener('click', abrirDialogSenha);
$('#snCancelar').addEventListener('click', () => $('#dlgSenha').close());
$('#formSenha').addEventListener('submit', async e => {
  e.preventDefault();
  const erro = m => { $('#snErro').textContent = m; };
  const nova = $('#snNova').value;
  if (nova.length < 6) return erro('A nova senha precisa ter pelo menos 6 caracteres');
  if (nova !== $('#snNova2').value) return erro('As senhas não conferem');
  try { await nuvem.trocarMinhaSenha($('#snAtual').value, nova); $('#dlgSenha').close(); toast('Senha alterada'); }
  catch(err){ erro(/invalid-credential|wrong-password/.test(err?.code||'') ? 'Senha atual incorreta' : traduzErroLogin(err)); }
});

/* ---------- Avisos ---------- */
const soDigitos = t => String(t||'').replace(/\D/g, '');
function telefoneWhats(t){
  let d = soDigitos(t);
  if (!d) return '';
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d;
}
const telefoneValido = t => { const d = telefoneWhats(t); return d.length >= 12 && d.length <= 13; };
function membroPorNome(nome){
  const n = nome.trim().toLowerCase();
  return S.membros.find(m => (m.nome||'').trim().toLowerCase() === n);
}
function responsavelDe(fid){
  const ativos = usuariosAtivos(), comTel = ativos.filter(u => telefoneValido(u.telefone));
  return comTel.find(u => u.perfil === 'lider' && (u.funcoes||[]).includes(fid))
      || ativos.find(u => u.perfil === 'lider' && (u.funcoes||[]).includes(fid))
      || comTel.find(u => u.perfil === 'admin') || null;
}
function escaladosEntre(inicio, fim, filtroFuncoes){
  const out = [];
  for (let dt = new Date(inicio); dt <= fim; dt = somaDias(dt, 1)){
    const iso = isoDe(dt);
    S.programas.filter(p => p.ativo && Number(p.dia) === dt.getDay())
      .sort((a,b) => (a.hora||'').localeCompare(b.hora||''))
      .forEach(p => {
        const r = S.escala[iso+'|'+p.id] || {};
        funcoesDo(p).filter(f => !filtroFuncoes || filtroFuncoes.includes(f)).forEach(fid => {
          const nomes = ehMultiplo(fid) ? nomesDe(r[fid]) : (textoDe(r[fid]).trim() ? [textoDe(r[fid]).trim()] : []);
          nomes.forEach(nome => {
            const m = membroPorNome(nome);
            out.push({ iso, dt: new Date(dt), prog: p, fid, nome, telefone: m?.telefone || '', chave: [iso, p.id, fid, nome].join('|') });
          });
        });
      });
  }
  return out;
}
const quandoTexto = a => `${DIAS[a.dt.getDay()].toLowerCase()}, ${String(a.dt.getDate()).padStart(2,'0')}/${String(a.dt.getMonth()+1).padStart(2,'0')}, às ${a.prog.hora || '—'}`;
function mensagemAviso(a){
  const resp = responsavelDe(a.fid);
  const contato = resp
    ? `${resp.nome}${telefoneValido(resp.telefone) ? ' pelo WhatsApp: https://wa.me/' + telefoneWhats(resp.telefone) : ''}`
    : 'o líder responsável';
  return `Olá, ${a.nome.split(' ')[0]}! 🙏\n\n` +
    `Lembrete da escala da *${S.igreja}*:\n\n` +
    `📅 *${quandoTexto(a).replace(/^./, c => c.toUpperCase())}*\n` +
    `⛪ ${a.prog.nome}\n` +
    `${ICONES[a.fid] || '•'} Função: *${nomeFuncao(a.fid)}*\n\n` +
    `Caso não possa comparecer, por favor avise com antecedência ${contato}\n\n` +
    `Deus abençoe!`;
}
function linkWhats(telefone, texto){
  texto = texto.replace(/️/g, '').normalize('NFC');
  const celular = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const tel = telefoneWhats(telefone);
  const q = (tel ? 'phone=' + tel + '&' : '') + 'text=' + encodeURIComponent(texto);
  return (celular ? 'whatsapp://send?' : 'https://api.whatsapp.com/send?') + q;
}
function abrirWhats(url){
  if (url.startsWith('whatsapp://')) location.href = url; else window.open(url, '_blank');
}
let avJanela = null;
function renderAvisos(){
  const dias = Number(S.avisos?.dias) || 5;
  if (avJanela == null) avJanela = Math.max(dias + 2, 7);
  $('#avDias').value = dias; $('#avDias').disabled = !ehAdmin();
  $('#avJanela').value = avJanela;
  const hoje = hojeLocal();
  const lista = escaladosEntre(hoje, somaDias(hoje, avJanela), ehAdmin() ? null : funcoesDoUsuario());
  renderAvisos.lista = lista;
  const box = $('#listaAvisos');
  if (!lista.length){ box.innerHTML = `<p class="vazio">Ninguém escalado ${ehAdmin() ? '' : 'nas suas funções '}nos próximos ${avJanela} dias.</p>`; return; }
  const enviados = S.avisos.enviados || {};
  const grupos = {};
  lista.forEach((a, i) => { (grupos[a.iso] ||= []).push(i); });
  box.innerHTML = Object.entries(grupos).map(([iso, idxs]) => {
    const dt = dataDeIso(iso), falta = diasEntre(hoje, dt);
    const etiqueta = falta === 0 ? 'hoje' : falta === 1 ? 'amanhã' : `daqui a ${falta} dias`;
    const diaDeAvisar = falta === dias;
    return `<article class="dia ${dt.getDay()===6?'sabado':''}">
      <h3>${fmtData(dt)} <span class="tag ${diaDeAvisar?'hoje':''}" style="margin-left:8px;font-weight:500">${etiqueta}${diaDeAvisar?' · dia de avisar':''}</span></h3>
      <div class="rolar"><table style="border:0">
        <tr><th>Culto</th><th>Função</th><th>Escalado</th><th>WhatsApp</th><th>Situação</th><th></th></tr>
        ${idxs.map(i => { const a = lista[i], env = enviados[a.chave]; return `<tr>
          <td>${esc(a.prog.nome)} <small>${esc(a.prog.hora)}</small></td>
          <td>${esc(nomeFuncao(a.fid))}</td>
          <td>${esc(a.nome)}</td>
          <td>${a.telefone ? (telefoneValido(a.telefone) ? esc(a.telefone) : `<span class="tag alerta">número inválido</span>`) : `<span class="tag alerta">sem telefone</span>`}</td>
          <td>${env ? `<span class="tag ok">✓ enviado ${new Date(env).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</span>` : '<span class="tag">pendente</span>'}</td>
          <td class="acoes-av"><button class="btn pq" data-av="${i}">${env ? 'Reenviar' : 'Enviar'}</button>
            <button class="btn sec pq" data-avcopiar="${i}">Copiar</button></td></tr>`; }).join('')}
      </table></div></article>`;
  }).join('');
}
async function copiarTexto(t){
  try { await navigator.clipboard.writeText(t); }
  catch(err){ const x=document.createElement('textarea'); x.value=t; document.body.appendChild(x); x.select(); document.execCommand('copy'); x.remove(); }
}
$('#listaAvisos').addEventListener('click', async e => {
  const lista = renderAvisos.lista || [];
  if (e.target.dataset.av != null){
    const a = lista[Number(e.target.dataset.av)]; if (!a) return;
    if (!telefoneValido(a.telefone)) toast('Sem telefone válido: escolha o contato no WhatsApp');
    abrirWhats(linkWhats(a.telefone, mensagemAviso(a)));
    const ts = Date.now();
    S.avisos.enviados[a.chave] = ts; renderAvisos();
    try { await nuvem.definir('escala', idEscala(a.iso+'|'+a.prog.id), { data: a.iso, programa: a.prog.id, _avisos: { [a.fid+'|'+a.nome]: ts } }); }
    catch(err){ erroNuvem(err); }
  }
  if (e.target.dataset.avcopiar != null){
    const a = lista[Number(e.target.dataset.avcopiar)]; if (!a) return;
    await copiarTexto(mensagemAviso(a)); toast('Mensagem copiada');
  }
});
$('#avDias').addEventListener('change', async e => {
  if (!ehAdmin()) return;
  const n = Math.min(30, Math.max(1, Number(e.target.value) || 5));
  avJanela = Math.max(avJanela || n, n);
  try { await nuvem.definir('config', 'geral', { avisosDias: n }); } catch(err){ erroNuvem(err); }
});
$('#avJanela').addEventListener('change', e => { avJanela = Math.min(60, Math.max(1, Number(e.target.value) || 5)); renderAvisos(); });

/* ---------- Visualizar ---------- */
function renderPreview(){
  const dias = diasDoMes(mesAtual), box = $('#preview');
  if (!dias.length){ box.innerHTML = '<p class="vazio">Nenhuma programação neste mês.</p>'; return; }
  const usadas = S.funcoes.filter(f => dias.some(d => d.progs.some(p => funcoesDo(p).includes(f.id))));
  const temObs = dias.some(d => d.progs.some(p => (S.escala[d.iso+'|'+p.id]||{}).obs));
  let linhas = '';
  dias.forEach(d => d.progs.forEach((p, i) => {
    const r = S.escala[d.iso+'|'+p.id] || {}, fs = funcoesDo(p);
    linhas += `<tr>${i===0 ? `<td class="data" rowspan="${d.progs.length}">${fmtData(d.dt)}</td>` : ''}
      <td><strong>${esc(p.nome)}</strong><br><small>${esc(p.hora)}</small></td>
      ${usadas.map(f => fs.includes(f.id) ? `<td>${esc(textoDe(r[f.id]))}</td>` : '<td class="na">—</td>').join('')}
      ${temObs ? `<td>${esc(r.obs||'')}</td>` : ''}</tr>`;
  }));
  box.innerHTML = `<h2>Escala de Cultos — ${esc(nomeMes(mesAtual))}</h2><p class="sub">${esc(S.igreja)}</p>
    <div class="rolar"><table><tr><th>Data</th><th>Programação</th>${usadas.map(f => `<th>${esc(f.nome)}</th>`).join('')}${temObs?'<th>Tema / Obs.</th>':''}</tr>${linhas}</table></div>`;
}
function textoWhats(){
  const dias = diasDoMes(mesAtual);
  let t = `*Escala de Cultos — ${nomeMes(mesAtual)}*\n_${S.igreja}_\n`;
  dias.forEach(d => d.progs.forEach(p => {
    const r = S.escala[d.iso+'|'+p.id] || {};
    t += `\n📅 *${fmtData(d.dt)}* — ${p.nome} (${p.hora})\n`;
    if (r.obs) t += `📖 ${r.obs}\n`;
    funcoesDo(p).forEach(fid => { t += `${ICONES[fid]||'•'} ${nomeFuncao(fid)}: ${textoDe(r[fid]) || 'a definir'}\n`; });
  }));
  return t + '\n_Deus abençoe a todos!_';
}
window.textoWhats = textoWhats;
$('#btnCopiar').addEventListener('click', async () => { await copiarTexto(textoWhats()); toast('Texto copiado! Cole no grupo do WhatsApp.'); });
$('#btnWhats').addEventListener('click', () => abrirWhats(linkWhats('', textoWhats())));

/* ---------- Configurações (admin) ---------- */
const configAtual = () => ({ versao: 5, igreja: S.igreja, funcoes: S.funcoes, programas: S.programas, avisosDias: S.avisos.dias });
async function salvarConfig(){
  try { await nuvem.definir('config', 'geral', clone(configAtual()), false); } catch(err){ erroNuvem(err); }
}
function renderConfig(){
  if (document.activeElement !== $('#cfgIgreja')) $('#cfgIgreja').value = S.igreja;
  $('#tabProgramas').innerHTML = `<tr><th>Nome</th><th>Dia</th><th>Horário</th><th>Ativo</th><th>Funções necessárias</th><th></th></tr>` +
    S.programas.map(p => `<tr>
      <td><input value="${esc(p.nome)}" data-pid="${esc(p.id)}" data-campo="nome"></td>
      <td><select data-pid="${esc(p.id)}" data-campo="dia">${DIAS.map((d,i) => `<option value="${i}" ${Number(p.dia)===i?'selected':''}>${d}</option>`).join('')}</select></td>
      <td><input type="time" value="${esc(p.hora)}" data-pid="${esc(p.id)}" data-campo="hora"></td>
      <td style="text-align:center"><input type="checkbox" ${p.ativo?'checked':''} data-pid="${esc(p.id)}" data-campo="ativo"></td>
      <td><div class="chips">${chipsFuncoes(p.funcoes||[], `data-pid="${esc(p.id)}" data-campo="funcao"`)}</div></td>
      <td><button class="btn perigo pq" data-delprog="${esc(p.id)}">Excluir</button></td></tr>`).join('');
  $('#listaFuncoes').innerHTML = S.funcoes.map(f => `<div class="linha" style="margin-bottom:6px">
      <input value="${esc(f.nome)}" data-fid="${esc(f.id)}" style="flex:1;min-width:200px">
      <label class="chip ${f.multiplo?'on':''}"><input type="checkbox" data-fmulti="${esc(f.id)}" ${f.multiplo?'checked':''}>Vários nomes</label>
      <button class="btn perigo pq" data-delfunc="${esc(f.id)}">Excluir</button></div>`).join('');
  let dadosAntigos = null; try { dadosAntigos = localStorage.getItem(LOCAL_ANTIGO); } catch(e){}
  $('#cartaoLocal').hidden = !dadosAntigos;
}
$('#cfgIgreja').addEventListener('change', e => { S.igreja = e.target.value.trim() || CONFIG_PADRAO.igreja; salvarConfig(); });
$('#tabProgramas').addEventListener('change', e => {
  const i = e.target, p = S.programas.find(x => x.id === i.dataset.pid); if (!p) return;
  const c = i.dataset.campo;
  if (c === 'nome') p.nome = i.value;
  else if (c === 'dia') p.dia = Number(i.value);
  else if (c === 'hora') p.hora = i.value;
  else if (c === 'ativo') p.ativo = i.checked;
  else if (c === 'funcao'){ p.funcoes = p.funcoes||[]; if (i.checked){ if(!p.funcoes.includes(i.value)) p.funcoes.push(i.value); } else p.funcoes = p.funcoes.filter(f => f!==i.value); }
  salvarConfig();
});
$('#tabProgramas').addEventListener('click', e => {
  const id = e.target.dataset.delprog; if (!id) return;
  if (!confirm('Excluir esta programação?')) return;
  S.programas = S.programas.filter(p => p.id !== id); salvarConfig();
});
$('#btnAddProg').addEventListener('click', () => {
  S.programas.push({id:uid(), dia:6, nome:'Nova programação', hora:'19:00', ativo:true, funcoes:S.funcoes.map(f => f.id)});
  salvarConfig();
});
$('#listaFuncoes').addEventListener('change', e => {
  if (e.target.dataset.fmulti){
    const f = S.funcoes.find(x => x.id === e.target.dataset.fmulti); if (!f) return;
    f.multiplo = e.target.checked; salvarConfig(); return;
  }
  const f = S.funcoes.find(x => x.id === e.target.dataset.fid); if (!f) return;
  f.nome = e.target.value.trim() || f.nome; salvarConfig();
});
$('#listaFuncoes').addEventListener('click', async e => {
  const id = e.target.dataset.delfunc; if (!id) return;
  if (!confirm('Excluir a função "'+nomeFuncao(id)+'"? Ela sai de todas as programações, membros e líderes.')) return;
  S.funcoes = S.funcoes.filter(f => f.id !== id);
  S.programas.forEach(p => p.funcoes = (p.funcoes||[]).filter(f => f !== id));
  const ops = [{ col:'config', id:'geral', dados: clone(configAtual()), mesclar:false }];
  S.membros.filter(m => (m.funcoes||[]).includes(id)).forEach(m => ops.push({ col:'membros', id:m.id, dados:{ funcoes: m.funcoes.filter(f => f !== id) } }));
  S.usuarios.filter(u => (u.funcoes||[]).includes(id)).forEach(u => ops.push({ col:'usuarios', id:u.id, dados:{ funcoes: u.funcoes.filter(f => f !== id) } }));
  try { await nuvem.lote(ops); } catch(err){ erroNuvem(err); }
});
$('#btnAddFuncao').addEventListener('click', () => {
  const nome = $('#novaFuncao').value.trim(); if (!nome) return;
  S.funcoes.push({id:uid(), nome}); $('#novaFuncao').value = '';
  salvarConfig(); toast('Função criada. Marque-a nas programações que precisam dela.');
});

/* backup */
$('#btnExportar').addEventListener('click', async () => {
  try {
    const docs = await nuvem.lerColecao('escala');
    const escala = {}, enviados = {};
    docs.forEach(d => {
      const chave = d.data + '|' + d.programa;
      const { id, data, programa, _avisos, ...campos } = d;
      if (Object.keys(campos).length) escala[chave] = campos;
      Object.entries(_avisos || {}).forEach(([k, ts]) => enviados[chave + '|' + k] = ts);
    });
    const dados = { versao: 4, exportadoEm: new Date().toISOString(), igreja: S.igreja, funcoes: S.funcoes, programas: S.programas,
      avisos: { dias: S.avisos.dias, enviados }, membros: S.membros, escala };
    const blob = new Blob([JSON.stringify(dados, null, 2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'escala-cultos-'+new Date().toISOString().slice(0,10)+'.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch(err){ erroNuvem(err); }
});
// Converte dados exportados (de qualquer versão) e envia para a nuvem
function migrarFormatoAntigo(d){
  d.funcoes = Array.isArray(d.funcoes) ? d.funcoes : clone(CONFIG_PADRAO.funcoes);
  d.programas = Array.isArray(d.programas) ? d.programas : clone(CONFIG_PADRAO.programas);
  if ((d.versao || 1) < 2){
    CONFIG_PADRAO.funcoes.filter(f => SABADO.includes(f.id)).forEach(f => { if (!d.funcoes.some(x => x.id === f.id)) d.funcoes.push(clone(f)); });
    d.programas.forEach(p => { if (Number(p.dia) === 6){ p.funcoes = p.funcoes || []; SABADO.forEach(id => { if (!p.funcoes.includes(id)) p.funcoes.push(id); }); } });
  }
  if ((d.versao || 1) < 3) d.funcoes.forEach(f => { if (f.id === 'diaconos' || f.id === 'diaconisas') f.multiplo = true; });
  if ((d.versao || 1) < 5){
    if (!d.funcoes.some(f => f.id === 'escolasabatina')) d.funcoes.unshift({ id:'escolasabatina', nome:'Escola Sabatina' });
    d.programas.forEach(p => { if (p.id === 'sab-divino' || (Number(p.dia) === 6 && /divino/i.test(p.nome || ''))){ p.funcoes = p.funcoes || []; if (!p.funcoes.includes('escolasabatina')) p.funcoes.unshift('escolasabatina'); } });
  }
  return d;
}
async function enviarParaNuvem(d){
  d = migrarFormatoAntigo(d);
  const ops = [{ col:'config', id:'geral', mesclar:false, dados:{
    versao: 5, igreja: d.igreja || CONFIG_PADRAO.igreja, funcoes: d.funcoes, programas: d.programas, avisosDias: Number(d.avisos?.dias) || 5 } }];
  (d.membros || []).forEach(m => { if (m?.nome) ops.push({ col:'membros', id: m.id || uid(), mesclar:false, dados:{ nome: m.nome, telefone: m.telefone || '', funcoes: m.funcoes || [] } }); });
  const avisosPorChave = {};
  Object.entries(d.avisos?.enviados || {}).forEach(([k, ts]) => {
    const [data, programa, ...resto] = k.split('|');
    (avisosPorChave[data+'|'+programa] ||= {})[resto.join('|')] = ts;
  });
  const chaves = new Set([...Object.keys(d.escala || {}), ...Object.keys(avisosPorChave)]);
  chaves.forEach(chave => {
    const [data, programa] = chave.split('|'); if (!data || !programa) return;
    const campos = {};
    Object.entries((d.escala || {})[chave] || {}).forEach(([f, v]) => { if (v !== '' && v != null) campos[f] = v; });
    ops.push({ col:'escala', id: idEscala(chave), mesclar:false, dados:{ data, programa, ...campos, ...(avisosPorChave[chave] ? { _avisos: avisosPorChave[chave] } : {}) } });
  });
  await nuvem.lote(ops);
  return { membros: (d.membros || []).length, escalas: chaves.size };
}
$('#arqImport').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = async () => {
    try{
      const d = JSON.parse(rd.result);
      if (!d || !Array.isArray(d.funcoes) || !Array.isArray(d.programas)) throw new Error('formato');
      if (!confirm('Enviar os dados deste arquivo para a nuvem? As configurações serão substituídas e os membros e escalas do arquivo serão gravados por cima dos atuais.')) return;
      const r = await enviarParaNuvem(d);
      toast(`Importado: ${r.membros} membro(s) e ${r.escalas} culto(s) com escala.`, 4000);
    }catch(err){ err?.message === 'formato' ? toast('Arquivo inválido') : erroNuvem(err); }
    e.target.value = '';
  };
  rd.readAsText(f);
});
$('#btnMigrarLocal').addEventListener('click', async () => {
  let d = null; try { d = JSON.parse(localStorage.getItem(LOCAL_ANTIGO)); } catch(e){}
  if (!d) { toast('Nenhum dado antigo encontrado'); return; }
  if (!confirm('Enviar para a nuvem as configurações, membros e escalas salvos neste navegador? As configurações atuais da nuvem serão substituídas.')) return;
  try {
    const r = await enviarParaNuvem(d);
    try { localStorage.setItem(LOCAL_ANTIGO + '-migrado', localStorage.getItem(LOCAL_ANTIGO)); localStorage.removeItem(LOCAL_ANTIGO); } catch(e){}
    toast(`Enviado: ${r.membros} membro(s) e ${r.escalas} culto(s) com escala.`, 4000); renderConfig();
  } catch(err){ erroNuvem(err); }
});
$('#btnDescartarLocal').addEventListener('click', () => {
  if (!confirm('Descartar os dados antigos salvos neste navegador? (não afeta a nuvem)')) return;
  try { localStorage.removeItem(LOCAL_ANTIGO); } catch(e){}
  renderConfig();
});
$('#btnReset').addEventListener('click', async () => {
  if (!confirm('Apagar TODAS as escalas e membros e voltar as configurações ao padrão, para todos os usuários? Os usuários serão mantidos. Faça uma exportação antes.')) return;
  try {
    const escalas = await nuvem.lerColecao('escala');
    await nuvem.lote([
      ...escalas.map(d => ({ tipo:'apagar', col:'escala', id:d.id })),
      ...S.membros.map(m => ({ tipo:'apagar', col:'membros', id:m.id })),
      { col:'config', id:'geral', dados: clone(CONFIG_PADRAO), mesclar:false }
    ]);
    toast('Dados apagados');
  } catch(err){ erroNuvem(err); }
});

/* ---------- Início ---------- */
$('#mesAnt').addEventListener('click', () => mudarMes(-1));
$('#mesProx').addEventListener('click', () => mudarMes(1));
$('#mesSel').addEventListener('change', e => { if (e.target.value){ mesAtual = e.target.value; ouvirEscalaDaFaixa(); renderTudo(); } });
function renderTudo(){
  $('#mesSel').value = mesAtual;
  $('#tituloIgreja').textContent = S.igreja || 'Escala de Cultos';
  if (!usuario || !configCarregada) return;
  renderDatalists(); renderEscala(); renderPreview(); renderAvisos();
  if (ehAdmin()){ renderMembros(); renderConfig(); renderUsuarios(); }
  if (!salvando) $('#statusNuvem').textContent = navigator.onLine === false ? '⚠️ sem internet' : '☁️ salvo';
}
window.addEventListener('online', () => renderTudo());
window.addEventListener('offline', () => { $('#statusNuvem').textContent = '⚠️ sem internet'; });

(function iniciarApp(){
  const cfgOk = firebaseConfig && firebaseConfig.apiKey && !/COLE|AQUI/i.test(firebaseConfig.apiKey) && firebaseConfig.projectId;
  if (!cfgOk) { mostrarTela('configurar'); return; }
  try { nuvem.iniciar(firebaseConfig); }
  catch(e){ mostrarTela('configurar'); $('#configErro').textContent = 'Erro na configuração: ' + e.message; return; }
  nuvem.aoMudarLogin(aoMudarLogin);
})();
