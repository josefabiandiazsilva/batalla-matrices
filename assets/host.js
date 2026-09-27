/* ======================================================================
   BATALLA DE MATRICES — panel del profesor (profesor.html)
   Crea la sala, proyecta el código, controla tiempo/revelación y observa
   el marcador y la arena del jefe en tiempo real.
   ====================================================================== */
(function(){
  "use strict";

  var hostRoot = document.getElementById("hostRoot");
  var serverOffset = 0;
  if(window.db){ db.ref(".info/serverTimeOffset").on("value", function(s){ serverOffset = s.val()||0; }); }
  function serverNow(){ return Date.now() + serverOffset; }

  var host = {
    roomCode:null, room:null, roomRef:null, tab:"present",
    lastBossHp:null, tickId:null, showLeaderboard:false
  };

  function esc2(s){ return esc(s); }

  function diagnosticCardHTML(){
    if(window.FIREBASE_CONFIGURED===false){
      return '<div class="card">' +
        '<div class="eyebrow">Falta configurar el servidor</div>' +
        '<p style="margin-top:10px;">Este sitio todavía no tiene conectado un proyecto de Firebase. Abre <code>assets/firebase-config.js</code> y pega las credenciales de tu proyecto gratuito (ver README.md).</p>' +
      '</div>';
    }
    return '<div class="card">' +
      '<div class="eyebrow">No se pudo conectar con Firebase</div>' +
      '<p style="margin-top:10px;">Las credenciales están puestas, pero la conexión falló. Causas más frecuentes:</p>' +
      '<ul style="margin-top:8px; padding-left:20px; color:var(--muted); font-size:13.5px; display:flex; flex-direction:column; gap:6px;">' +
        '<li>Todavía no creaste la <b style="color:var(--text)">Realtime Database</b> en la consola de Firebase (Compilación → Realtime Database → Crear base de datos). Tener el proyecto creado no es suficiente, la base de datos es un paso aparte.</li>' +
        '<li>El <code>databaseURL</code> tiene un error de tipeo (debe empezar con <code>https://</code> y terminar en <code>.firebaseio.com</code>).</li>' +
        '<li>Las reglas de la base de datos aún no se publicaron (pestaña "Reglas" → pegar <code>database.rules.json</code> → Publicar).</li>' +
        '<li>Estás viendo una versión en caché de esta página: recarga con Ctrl+Shift+R (o Cmd+Shift+R en Mac).</li>' +
      '</ul>' +
      (window.FIREBASE_ERROR? '<div class="share-box" style="margin-top:12px;">Detalle técnico: '+esc2(window.FIREBASE_ERROR)+'</div>' : '') +
    '</div>';
  }

  /* ================= SETUP SCREEN ================= */
  function renderSetup(){
    if(!window.db || window.FIREBASE_CONFIGURED===false){
      hostRoot.innerHTML = diagnosticCardHTML();
      return;
    }
    var bossKey = Object.keys(BOSSES)[0];
    var boss = BOSSES[bossKey];
    hostRoot.innerHTML = '<div class="card center" style="max-width:520px;">' +
      '<div class="eyebrow">Nueva sesión de clase</div>' +
      '<h2 style="font-size:22px; margin-top:8px;">El jefe de hoy</h2>' +
      '<img src="'+boss.normal+'" alt="jefe" style="height:180px; margin:14px auto; display:block; filter:drop-shadow(0 14px 18px rgba(0,0,0,.5));">' +
      '<div style="font-family:var(--font-display); font-size:18px; letter-spacing:1px; text-transform:uppercase;">'+esc2(boss.name)+'</div>' +
      '<button class="btn btn-primary btn-block" id="createBtn" style="margin-top:20px;">Crear sala →</button>' +
    '</div>';

    document.getElementById("createBtn").addEventListener("click", function(){ createRoom(bossKey); });
  }

  function createRoom(bossKey){
    var code = genRoomCode();
    var boss = BOSSES[bossKey];
    var maxHp = boss.hp;
    var payload = {
      status:"lobby", currentIndex:-1, createdAt: serverNow(),
      timer:null,
      boss:{ key:bossKey, name:boss.name, img:boss.normal, hitImg:boss.hit, deadImg:boss.dead, hp:maxHp, maxHp:maxHp },
      players:{}, answers:{}
    };
    db.ref("rooms/"+code).set(payload).then(function(){
      attachRoom(code);
    });
  }

  function attachRoom(code){
    host.roomCode = code;
    host.roomRef = db.ref("rooms/"+code);
    host.roomRef.on("value", function(snap){
      var val = snap.val();
      if(!val) return;
      var prevHp = host.room ? (host.room.boss && host.room.boss.hp) : null;
      host.room = val;
      renderHost();
      if(prevHp!=null && val.boss && val.boss.hp < prevHp){ triggerBossHit(prevHp - val.boss.hp); }
    });
  }

  /* ================= LAYOUT ================= */
  function renderHost(){
    if(!host.room){ renderSetup(); return; }
    var r = host.room;
    var playerCount = r.players ? Object.keys(r.players).length : 0;

    hostRoot.innerHTML =
      '<div class="card tight" style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:16px;">' +
        '<div>' +
          '<div class="room-code-label">Código de sala</div>' +
          '<div class="room-code" style="font-size:34px; letter-spacing:6px;">'+host.roomCode+'</div>' +
        '</div>' +
        '<div class="muted" style="font-family:var(--font-mono); font-size:13px;">👥 '+playerCount+' conectados</div>' +
        '<button class="btn btn-ghost btn-sm" id="newRoomBtn">＋ Nueva sala</button>' +
      '</div>' +
      (r.status==="lobby" ? renderLobby() : '') +
      (r.status!=="lobby" ? '<div class="tabs" style="margin-bottom:14px;">' +
        '<button class="tab-btn sub-tab'+(host.tab==="present"?" active":"")+'" data-sub="present">Proyección</button>' +
        '<button class="tab-btn sub-tab'+(host.tab==="board"?" active":"")+'" data-sub="board">Marcador y jefe</button>' +
      '</div>' : '') +
      (r.status!=="lobby" ? (host.tab==="present"? renderPresenter() : renderBoard()) : '');

    document.getElementById("newRoomBtn").addEventListener("click", function(){
      if(confirm("¿Crear una sala nueva? Se perderá el progreso de la sala actual.")) {
        host.roomRef && host.roomRef.off();
        host.room = null; host.roomCode = null; clearInterval(host.tickId);
        renderSetup();
      }
    });

    var subTabs = hostRoot.querySelectorAll(".sub-tab");
    subTabs.forEach(function(b){ b.addEventListener("click", function(){ host.tab = b.dataset.sub; renderHost(); }); });

    if(r.status==="lobby"){
      var startBtn = document.getElementById("startGameBtn");
      if(startBtn) startBtn.addEventListener("click", startGame);
    }
    if(r.status!=="lobby" && host.tab==="present") wirePresenterControls();
    if(r.status!=="lobby" && host.tab==="board") wireBoardControls();
  }

  function renderLobby(){
    var r = host.room;
    var players = r.players || {};
    var ids = Object.keys(players);
    return '<div class="card" style="margin-bottom:16px;">' +
      '<div class="eyebrow">Sala de espera</div>' +
      '<p class="muted" style="margin-top:8px; font-size:13.5px;">Proyecta el código de arriba. Los estudiantes entran en <b style="color:var(--text)">el enlace principal del sitio</b> (index.html) con ese código y su nombre — sin cuenta, sin instalar nada.</p>' +
      '<hr class="div">' +
      (ids.length? '<div class="roster-grid">'+ids.map(function(id){
        var p = players[id];
        return '<div class="roster-chip'+(p.connected===false?' offline':'')+'"><div class="av">'+p.avatar+'</div><div class="nm">'+esc2(p.name)+'</div></div>';
      }).join('')+'</div>' : '<p class="muted" style="font-size:13px;">Todavía no se ha conectado nadie…</p>') +
      '<button class="btn btn-primary btn-block" id="startGameBtn" style="margin-top:20px;" '+(ids.length? '' : 'disabled')+'>▶ Iniciar juego ('+ids.length+' jugador'+(ids.length===1?'':'es')+')</button>' +
    '</div>';
  }

  function startGame(){
    goToQuestion(0);
  }

  function goToQuestion(idx){
    var q = QUESTIONS[idx];
    host.roomRef.update({
      status:"question", currentIndex: idx,
      timer:{ duration:q.time, endAt: serverNow()+q.time*1000, paused:false, remainingWhenPaused:null }
    });
  }

  /* ================= boss mini widget (visible durante la pregunta, no solo en la pestaña de marcador) ================= */
function bossMiniHTML(boss){
if(!boss) return '';
var pct = clamp((boss.hp/boss.maxHp)*100,0,100);
var defeated = boss.hp<=0;
return '<div class="boss-mini" id="bossStage">' +
'<img class="boss-sprite-mini" id="bossImg" src="'+(defeated? boss.deadImg : boss.img)+'" alt="jefe">' +
'<div class="boss-mini-body">' +
'<div class="boss-mini-name">'+esc2(boss.name||"")+'</div>' +
'<div class="hp-bar-bg mini"><div class="hp-bar" style="width:'+pct+'%"></div></div>' +
'</div>' +
'</div>';
}

/* ================= PRESENTER TAB ================= */
  function currentDeadlineInfo(){
    var t = host.room.timer || {};
    if(!t) return {msLeft:0, paused:false, duration:20};
    if(t.paused) return {msLeft:t.remainingWhenPaused||0, paused:true, duration:t.duration||20};
    var msLeft = (t.endAt||0) - serverNow();
    return {msLeft:Math.max(0,msLeft), paused:false, duration:t.duration||20};
  }

  function renderPresenter(){
    var r = host.room;
    var idx = r.currentIndex;
    var q = QUESTIONS[idx];
    var revealed = r.status==="reveal" || r.status==="ended";
    var answers = (r.answers && r.answers[idx]) || {};
    var answeredCount = Object.keys(answers).length;
    var playerCount = r.players? Object.keys(r.players).length : 0;
    var counts = [0,0,0,0];
    Object.keys(answers).forEach(function(k){ var c=answers[k].choice; if(c!==null && c!==undefined) counts[c]++; });

    var optsHTML = q.options.map(function(o,i){
      return '<div class="presenter-opt'+(revealed && i===q.correct? ' reveal-correct':'')+'">' +
        '<span class="opt-letter">'+String.fromCharCode(65+i)+'</span>'+optionHTML(o)+
        (revealed && i===q.correct? ' ✅':'') +
        (revealed? '<span class="cnt">'+counts[i]+' voto(s)</span>' : '') +
      '</div>';
    }).join('');

    var info = currentDeadlineInfo();
    var timerTxt = revealed? "—" : Math.max(0,Math.ceil(info.msLeft/1000))+"s";
    var low = !revealed && info.msLeft < info.duration*1000*0.25;

    return '<div class="presenter-stage">' +
      bossMiniHTML(r.boss) +
      '<div class="presenter-num">Pregunta '+(idx+1)+' de '+QUESTIONS.length+' &middot; '+TIER_LABEL[q.tier]+' &middot; '+q.points+' pts &middot; '+answeredCount+'/'+playerCount+' respondieron</div>' +
      '<h3 style="font-size:22px; max-width:60ch; margin-inline:auto;">'+esc2(q.title)+'</h3>' +
      (q.matrixQuestion? '<div style="display:flex; justify-content:center;">'+matrixQuestionHTML(q.matrixQuestion)+'</div>' : '') +
      '<div class="presenter-timer'+(low?' low':'')+'" id="hostTimerNum">'+timerTxt+'</div>' +
      '<div class="btn-row" style="justify-content:center;">' +
        (revealed? '' :
          '<button class="btn btn-primary" id="pauseBtn">'+(info.paused? '▶ Reanudar':'⏸ Pausar')+'</button>' +
          '<button class="btn btn-ghost" id="minus10">−10s</button>' +
          '<button class="btn btn-ghost" id="plus10">+10s</button>' +
          '<button class="btn" id="revealBtn">👁 Revelar respuesta</button>'
        ) +
        (revealed? '<button class="btn btn-primary" id="nextBtn">'+(idx<QUESTIONS.length-1? 'Siguiente pregunta →' : 'Ver resultado final →')+'</button>' : '') +
      '</div>' +
      (revealed? '<p class="muted" style="max-width:56ch; margin:14px auto 0; font-size:13px; text-align:left;">'+esc2(q.explain)+'</p>' : '') +
      '<div class="presenter-options">'+optsHTML+'</div>' +
      answeredRosterHTML(r, idx, revealed) +
    '</div>';
  }

  // Quién ya respondió la pregunta actual — para que el profesor sepa si debe esperar o puede avanzar.
  function answeredRosterHTML(r, idx, revealed){
    var players = r.players || {};
    var answers = (r.answers && r.answers[idx]) || {};
    var ids = Object.keys(players);
    if(!ids.length) return '';
    // conectados primero, y dentro de cada grupo los que faltan por responder primero (para verlos de un vistazo)
    ids.sort(function(a,b){
      var pa=players[a], pb=players[b];
      var da = pa.connected===false?1:0, db_ = pb.connected===false?1:0;
      if(da!==db_) return da-db_;
      var aa = answers[a]?1:0, ab = answers[b]?1:0;
      if(aa!==ab) return aa-ab;
      return (pa.name||"").localeCompare(pb.name||"");
    });
    return '<div class="card tight" style="margin-top:16px;">' +
      '<div class="eyebrow">'+(revealed? '¿Quién respondió?' : '¿Quién falta por responder?')+'</div>' +
      '<div class="roster-grid" style="margin-top:10px;">' +
        ids.map(function(id){
          var p = players[id];
          var answered = !!answers[id];
          var offline = p.connected===false;
          return '<div class="roster-chip'+(offline?' offline':'')+(answered?' answered':'')+'">' +
            '<div class="av">'+p.avatar+'</div>' +
            '<div class="nm">'+esc2(p.name)+'</div>' +
            '<div class="roster-status">'+(offline? '⚪ desconectado' : (answered? '✅ listo' : '⏳ pensando…'))+'</div>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>';
  }

  function wirePresenterControls(){
    var r = host.room;
    var revealed = r.status==="reveal" || r.status==="ended";
    clearInterval(host.tickId);
    if(!revealed){
      host.tickId = setInterval(function(){
        var el = document.getElementById("hostTimerNum");
        if(!el || !host.room || host.room.status!=="question"){ return; }
        var info = currentDeadlineInfo();
        el.textContent = (info.paused? "⏸ ":"") + Math.max(0,Math.ceil(info.msLeft/1000))+"s";
        el.classList.toggle("low", !info.paused && info.msLeft < info.duration*1000*0.25);
      }, 250);
    }
    var pauseBtn = document.getElementById("pauseBtn");
    if(pauseBtn) pauseBtn.addEventListener("click", function(){
      var info = currentDeadlineInfo();
      if(info.paused){
        host.roomRef.child("timer").update({ paused:false, endAt: serverNow()+info.msLeft, remainingWhenPaused:null });
      } else {
        host.roomRef.child("timer").update({ paused:true, remainingWhenPaused: info.msLeft });
      }
    });
    var m10 = document.getElementById("minus10"), p10 = document.getElementById("plus10");
    if(m10) m10.addEventListener("click", function(){ adjustTime(-10000); });
    if(p10) p10.addEventListener("click", function(){ adjustTime(10000); });
    var revealBtn = document.getElementById("revealBtn");
    if(revealBtn) revealBtn.addEventListener("click", function(){ host.roomRef.update({status:"reveal"}); });
    var nextBtn = document.getElementById("nextBtn");
    if(nextBtn) nextBtn.addEventListener("click", function(){
      if(r.currentIndex < QUESTIONS.length-1) goToQuestion(r.currentIndex+1);
      else host.roomRef.update({status:"ended"});
    });
  }

  function adjustTime(deltaMs){
    var info = currentDeadlineInfo();
    if(info.paused){
      host.roomRef.child("timer").update({ remainingWhenPaused: Math.max(0, info.msLeft+deltaMs) });
    } else {
      host.roomRef.child("timer").update({ endAt: (host.room.timer.endAt||serverNow()) + deltaMs });
    }
  }

  /* ================= BOARD TAB (marcador + jefe) ================= */
  function renderBoard(){
    var r = host.room;
    var players = r.players || {};
    var sorted = Object.keys(players).map(function(k){ return Object.assign({id:k}, players[k]); })
      .sort(function(a,b){ return (b.score||0)-(a.score||0); });
    var max = sorted.length? Math.max.apply(null, sorted.map(function(t){return t.score||0;})) || 1 : 1;
    var boss = r.boss || {};
    var pct = boss.maxHp? clamp((boss.hp/boss.maxHp)*100,0,100) : 0;
    var defeated = boss.hp<=0;

    return '<div class="arena" id="arenaBox" style="background-image:url(\'https://images.unsplash.com/photo-1640865993619-cb8f720bf908?auto=format&fit=crop&w=1400&q=65\');">' +
        '<div class="arena-inner">' +
          '<div class="arena-name">'+esc2(boss.name||"")+'</div>' +
          '<div class="boss-stage" id="bossStage">' +
            '<img class="boss-sprite" id="bossImg" src="'+(defeated? boss.deadImg : boss.img)+'" alt="jefe">' +
          '</div>' +
          (defeated? '<div class="boss-victory">¡DERROTADO POR LA CLASE! 🏆</div>' :
            '<div style="width:100%;"><div class="hp-bar-bg"><div class="hp-bar" style="width:'+pct+'%"></div></div>' +
            '<div class="hp-nums"><span>'+Math.max(0,boss.hp)+' HP</span><span>'+boss.maxHp+' HP</span></div></div>') +
        '</div>' +
      '</div>' +
      '<div class="card" style="margin-top:16px;">' +
        '<div class="eyebrow">Marcador en vivo</div>' +
        (r.status==="ended" && sorted.length? podiumHTML(sorted) : '') +
        (sorted.length? '<hr class="div">'+sorted.map(function(t,i){ return leaderRow(t,i,max); }).join('') :
          '<p class="muted" style="margin-top:10px; font-size:13.5px;">Aún no hay jugadores.</p>') +
        (r.status==="ended"? '<div class="btn-row" style="margin-top:16px;"><button class="btn btn-primary" id="exportBtn">⬇ Exportar CSV</button></div>' : '') +
      '</div>';
  }

  function leaderRow(t,i,max){
    var pct = max>0? Math.max(4, Math.round(((t.score||0)/max)*100)) : 4;
    return '<div class="leader-row">' +
      '<div class="leader-rank">'+(i+1)+'</div>' +
      '<div class="leader-avatar">'+(t.avatar||"🧮")+'</div>' +
      '<div class="leader-name">'+esc2(t.name)+(t.connected===false? ' <span class="muted" style="font-size:11px;">(desconectado)</span>':'')+'</div>' +
      '<div class="leader-bar-bg"><div class="leader-bar" style="width:'+pct+'%"></div></div>' +
      '<div class="leader-score">'+(t.score||0)+'</div>' +
    '</div>';
  }

  function podiumHTML(sorted){
    var medals = ["🥇","🥈","🥉"];
    var cols = [0,1,2].map(function(pos){
      var t = sorted[pos];
      if(!t) return '<div class="podium-col"></div>';
      return '<div class="podium-col podium-'+(pos+1)+'">' +
        '<div style="font-size:22px;">'+t.avatar+'</div>' +
        '<div style="font-weight:700; font-size:13px; margin:4px 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">'+esc2(t.name)+'</div>' +
        '<div class="podium-block"><div class="podium-medal">'+medals[pos]+'</div><div style="font-family:var(--font-mono);">'+(t.score||0)+'</div></div>' +
      '</div>';
    });
    var arranged = [cols[1], cols[0], cols[2]];
    return '<div class="podium3">'+arranged.join('')+'</div>';
  }

  function wireBoardControls(){
    var exportBtn = document.getElementById("exportBtn");
    if(exportBtn) exportBtn.addEventListener("click", exportCSV);
  }

  function exportCSV(){
    var players = host.room.players || {};
    var rows = [["nombre","puntaje","aciertos","racha_maxima"]];
    Object.keys(players).forEach(function(k){
      var p = players[k];
      rows.push([p.name, p.score||0, p.correctCount||0, p.bestStreak||0]);
    });
    var csv = rows.map(function(r){ return r.map(function(v){ return '"'+String(v).replace(/"/g,'""')+'"'; }).join(','); }).join('\n');
    var blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "resultados_batalla_matrices_"+host.roomCode+".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
  }

  /* ================= boss hit fx ================= */
  function triggerBossHit(dmg){
    var stage = document.getElementById("bossStage");
    var img = document.getElementById("bossImg");
    if(!stage || !img) return;
    var boss = host.room.boss;
    var origSrc = img.src;
    img.src = boss.hitImg;
    stage.classList.add("hit","shake");
    beep(180,.12,"square");
    var fl = document.createElement("div");
    fl.className = "dmg-float"; fl.textContent = "−"+dmg;
    stage.appendChild(fl);
    setTimeout(function(){
      stage.classList.remove("hit","shake");
      if(img.isConnected) img.src = (boss.hp<=0? boss.deadImg : boss.img);
      if(fl.isConnected) fl.remove();
    }, 480);
  }

  renderSetup();
})();
