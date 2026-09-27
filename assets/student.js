/* ======================================================================
   BATALLA DE MATRICES — lógica del estudiante (index.html)
   Cada estudiante entra individualmente con código de sala + nombre.
   Sincroniza en tiempo real con Firebase Realtime Database.
   ====================================================================== */
(function(){
  "use strict";

  var joinCard = document.getElementById("joinCard");
  var avatarGrid = document.getElementById("avatarGrid");
  var codeInput = document.getElementById("codeInput");
  var nameInput = document.getElementById("nameInput");
  var joinBtn = document.getElementById("joinBtn");
  var joinError = document.getElementById("joinError");
  var playRoot = document.getElementById("playRoot");

  var chosenAvatar = lsGet("bm_avatar", AVATARS[0]);
  AVATARS.forEach(function(a){
    var b = document.createElement("button");
    b.type = "button"; b.className = "avatar-opt" + (a===chosenAvatar? " sel":"");
    b.textContent = a; b.dataset.a = a;
    b.addEventListener("click", function(){
      chosenAvatar = a;
      avatarGrid.querySelectorAll(".avatar-opt").forEach(function(x){ x.classList.toggle("sel", x===b); });
    });
    avatarGrid.appendChild(b);
  });

  var prevCode = lsGet("bm_room","");
  var prevName = lsGet("bm_name","");
  if(prevCode) codeInput.value = prevCode;
  if(prevName) nameInput.value = prevName;

  var serverOffset = 0;
  if(window.db){
    db.ref(".info/serverTimeOffset").on("value", function(s){ serverOffset = s.val()||0; });
  }
  function serverNow(){ return Date.now() + serverOffset; }

  var state = {
    roomCode:"", playerId:null, name:"", avatar:chosenAvatar,
    room:null, lastIndex:-1, lastStatus:null,
    timerTickId:null, lastBossHp:null
  };

  function saveIdentity(){
    lsSet("bm_room", state.roomCode); lsSet("bm_pid", state.playerId);
    lsSet("bm_name", state.name); lsSet("bm_avatar", state.avatar);
  }
  function showJoinError(msg){ joinError.textContent = msg || ""; }

  joinBtn.addEventListener("click", attemptJoin);
  [codeInput, nameInput].forEach(function(el){
    el.addEventListener("keydown", function(e){ if(e.key==="Enter") attemptJoin(); });
  });

  function attemptJoin(){
    if(!window.db || window.FIREBASE_CONFIGURED===false){
      var extra = window.FIREBASE_ERROR ? (" Detalle: "+window.FIREBASE_ERROR) : "";
      showJoinError("El profesor todavía no ha configurado el servidor del juego (falta la conexión a Firebase)."+extra);
      return;
    }
    var code = codeInput.value.trim().replace(/\s+/g,"");
    var name = nameInput.value.trim();
    if(!/^\d{4,8}$/.test(code)){ showJoinError("Escribe el código numérico que ves en la pantalla de tu profesor."); return; }
    if(!name){ showJoinError("Escribe tu nombre para identificarte en el marcador."); return; }
    joinBtn.disabled = true; joinBtn.textContent = "Conectando…";

    db.ref("rooms/"+code).get().then(function(snap){
      if(!snap.exists()){
        showJoinError("No existe ninguna sala con ese código. Verifica con tu profesor.");
        joinBtn.disabled = false; joinBtn.textContent = "Entrar a la sala →";
        return;
      }
      state.roomCode = code; state.name = name; state.avatar = chosenAvatar;
      var reuse = (lsGet("bm_room","")===code && lsGet("bm_pid",null));
      var pid = reuse ? lsGet("bm_pid",null) : db.ref("rooms/"+code+"/players").push().key;
      state.playerId = pid;
      var playerRef = db.ref("rooms/"+code+"/players/"+pid);
      playerRef.get().then(function(pSnap){
        var existing = pSnap.val() || {};
        var payload = {
          name: state.name, avatar: state.avatar,
          score: existing.score||0, streak: existing.streak||0, bestStreak: existing.bestStreak||0,
          correctCount: existing.correctCount||0, connected:true,
          joinedAt: existing.joinedAt || serverNow()
        };
        playerRef.update(payload).then(function(){
          try{ playerRef.onDisconnect().update({connected:false}); }catch(e){}
          saveIdentity();
          enterGame();
        }).catch(function(){
          showJoinError("No se pudo unir a la sala. Intenta de nuevo.");
          joinBtn.disabled = false; joinBtn.textContent = "Entrar a la sala →";
        });
      });
    }).catch(function(){
      showJoinError("No se pudo conectar. Revisa tu conexión a internet e inténtalo de nuevo.");
      joinBtn.disabled = false; joinBtn.textContent = "Entrar a la sala →";
    });
  }

  function enterGame(){
    document.body.classList.add("in-game");
    document.querySelector(".nav").style.display = "none";
    var roomRef = db.ref("rooms/"+state.roomCode);
    roomRef.on("value", function(snap){
      var val = snap.val();
      if(!val){ renderClosed(); return; }
      state.room = val;
      renderByStatus();
      syncBossMini();
    }, function(){ renderClosed(); });
  }

  function renderClosed(){
    playRoot.innerHTML = '<div class="wrap-narrow"><div class="card center">' +
      '<h2 style="font-size:24px;">Sala no disponible</h2>' +
      '<p class="muted" style="margin-top:8px;">El profesor cerró la sala o el código ya no es válido.</p>' +
      '</div></div>';
  }

  /* ================= status router ================= */
  function renderByStatus(){
    var r = state.room;
    if(r.status==="lobby"){ state.lastStatus="lobby"; renderWaiting(); }
    else if(r.status==="question"){
      var isNew = (r.currentIndex !== state.lastIndex) || state.lastStatus!=="question";
      state.lastIndex = r.currentIndex; state.lastStatus="question";
      if(isNew) renderQuestion(); else syncTimerOnly();
    }
    else if(r.status==="reveal"){ state.lastStatus="reveal"; renderReveal(); }
    else if(r.status==="ended"){ state.lastStatus="ended"; renderEnded(); }
  }

  function bossWidget(compact){
    var r = state.room;
    if(!r || !r.boss) return "";
    var pct = clamp((r.boss.hp / r.boss.maxHp) * 100, 0, 100);
    var defeated = r.boss.hp<=0;
    var img = defeated? r.boss.deadImg : r.boss.img;
    return '<div class="card tight" style="margin-bottom:14px; text-align:center;">' +
      '<div class="muted" style="font-size:11px; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">'+(defeated? "¡Jefe derrotado! 🎉" : "Vida del jefe de la clase")+'</div>' +
      '<img src="'+img+'" alt="jefe" style="height:'+(compact?54:74)+'px; image-rendering:pixelated; margin:0 auto 8px;">' +
      '<div class="hp-bar-bg"><div class="hp-bar" style="width:'+pct+'%"></div></div>' +
    '</div>';
  }

  // Widget compacto y persistente del jefe: vive dentro de la pregunta activa (no solo antes/después),
  // porque es justo mientras se responde cuando la clase le está haciendo daño en tiempo real.
  function bossMiniHTML(){
    var r = state.room;
    if(!r || !r.boss) return "";
    var pct = clamp((r.boss.hp / r.boss.maxHp) * 100, 0, 100);
    var defeated = r.boss.hp<=0;
    return '<div class="boss-mini" id="bossMiniStage">' +
      '<img class="boss-sprite-mini" id="bossMiniImg" src="'+(defeated? r.boss.deadImg : r.boss.img)+'" alt="jefe">' +
      '<div class="boss-mini-body">' +
        '<div class="boss-mini-name">'+esc(r.boss.name||"")+'</div>' +
        '<div class="hp-bar-bg mini"><div class="hp-bar" id="bossMiniBar" style="width:'+pct+'%"></div></div>' +
      '</div>' +
    '</div>';
  }

  // Actualiza el widget compacto sin re-renderizar toda la pantalla (para no perder el estado de
  // "ya respondí" ni cortar el temporizador), y dispara la animación de golpe si el HP bajó.
  function syncBossMini(){
    var r = state.room;
    if(!r || !r.boss) return;
    var stage = document.getElementById("bossMiniStage");
    var img = document.getElementById("bossMiniImg");
    var bar = document.getElementById("bossMiniBar");
    if(!stage || !img || !bar){ state.lastBossHp = r.boss.hp; return; }
    var pct = clamp((r.boss.hp / r.boss.maxHp) * 100, 0, 100);
    var defeated = r.boss.hp<=0;
    var finalSrc = defeated ? r.boss.deadImg : r.boss.img;
    bar.style.width = pct+"%";
    if(state.lastBossHp!=null && r.boss.hp < state.lastBossHp){
      img.src = r.boss.hitImg;
      stage.classList.add("hit","shake");
      beep(180,.1,"square");
      setTimeout(function(){
        stage.classList.remove("hit","shake");
        if(img.isConnected) img.src = finalSrc;
      }, 420);
    } else if(img.getAttribute("src") !== finalSrc){
      img.src = finalSrc;
    }
    state.lastBossHp = r.boss.hp;
  }

  function renderWaiting(){
    clearInterval(state.timerTickId);
    var r = state.room;
    var players = r.players ? Object.keys(r.players).length : 0;
    playRoot.innerHTML = '<div class="wrap-narrow">' +
      bossWidget(true) +
      '<div class="card center">' +
        '<div style="font-size:40px;">'+state.avatar+'</div>' +
        '<h2 style="font-size:22px; margin-top:8px;">¡Ya estás dentro, '+esc(state.name)+'!</h2>' +
        '<p class="muted pulse" style="margin-top:10px;">Esperando a que el profesor inicie el juego…</p>' +
        '<p class="muted" style="margin-top:14px; font-family:var(--font-mono); font-size:12.5px;">'+players+' jugador(es) conectados</p>' +
      '</div>' +
    '</div>';
  }

  function tierChip(tier){ return '<span class="tier-chip tier-'+tier+'">'+TIER_LABEL[tier]+'</span>'; }

  function progressDots(){
    var out = '<div class="progress-dots">';
    for(var i=0;i<QUESTIONS.length;i++){
      var cls = "dot";
      if(i<state.room.currentIndex) cls += " done-ok"; // simplified: past
      else if(i===state.room.currentIndex) cls += " current";
      out += '<span class="'+cls+'"></span>';
    }
    return out+'</div>';
  }

  function scorebarHTML(){
    var me = (state.room.players && state.room.players[state.playerId]) || {score:0, streak:0};
    return '<div class="scorebar">' +
      '<div class="score-item"><div class="lab">Jugador</div><div class="val">'+state.avatar+' '+esc(state.name)+'</div></div>' +
      '<div class="score-item"><div class="lab">Puntos</div><div class="val">'+(me.score||0)+'</div></div>' +
      '<div class="score-item"><div class="lab">Racha</div><div class="val">'+(me.streak||0)+((me.streak||0)>=3?' 🔥':'')+'</div></div>' +
      '<div class="score-item"><div class="lab">Pregunta</div><div class="val">'+(state.room.currentIndex+1)+'/'+QUESTIONS.length+'</div></div>' +
    '</div>';
  }

  var answeredForIndex = -1;

  function renderQuestion(){
    clearInterval(state.timerTickId);
    var q = QUESTIONS[state.room.currentIndex];
    var already = answeredForIndex === state.room.currentIndex;

    var optsHTML = q.options.map(function(o,i){
      return '<button type="button" class="opt-btn" data-i="'+i+'">' +
        '<span class="opt-letter">'+String.fromCharCode(65+i)+'</span>' +
        '<span>'+optionHTML(o)+'</span></button>';
    }).join('');

    playRoot.innerHTML = '<div class="wrap-narrow">' +
      bossMiniHTML() +
      scorebarHTML() + progressDots() +
      '<div class="card">' +
        '<div class="q-head">'+tierChip(q.tier)+'<span class="muted" style="font-family:var(--font-mono); font-size:12.5px;">'+q.points+' pts base</span></div>' +
        '<div class="q-title">'+esc(q.title)+'</div>' +
        (q.matrixQuestion? matrixQuestionHTML(q.matrixQuestion) : '') +
        '<div class="options" id="optsWrap">'+optsHTML+'</div>' +
        '<div class="timer-wrap">' +
          '<div class="timer-bar-bg"><div class="timer-bar" id="timerBar"></div></div>' +
          '<div class="timer-nums"><span id="timerLabel">⏱ tiempo restante</span><span id="timerNum">'+q.time+'s</span></div>' +
        '</div>' +
      '</div>' +
    '</div>';

    if(already){
      document.querySelectorAll("#optsWrap .opt-btn").forEach(function(b){ b.disabled = true; });
      document.getElementById("timerLabel").textContent = "✅ Ya respondiste, esperando a tus compañeros…";
    } else {
      document.getElementById("optsWrap").addEventListener("click", function(e){
        var b = e.target.closest(".opt-btn"); if(!b) return;
        lockAnswer(parseInt(b.dataset.i,10));
      });
    }
    tickTimer();
  }

  function syncTimerOnly(){
    // room updated (pause/resume/adjust) while same question is showing — just keep ticking with fresh data
    tickTimer();
  }

  function currentDeadlineInfo(){
    var t = state.room.timer || {};
    if(t.paused) return {msLeft: t.remainingWhenPaused||0, paused:true, duration:t.duration||20};
    var msLeft = (t.endAt||0) - serverNow();
    return {msLeft: Math.max(0,msLeft), paused:false, duration:t.duration||20};
  }

  function tickTimer(){
    clearInterval(state.timerTickId);
    state.timerTickId = setInterval(function(){
      if(!state.room || state.room.status!=="question") { clearInterval(state.timerTickId); return; }
      var info = currentDeadlineInfo();
      var bar = document.getElementById("timerBar"); var num = document.getElementById("timerNum");
      if(bar){ var pct = clamp(info.msLeft/(info.duration*1000),0,1)*100; bar.style.width = pct+"%"; if(pct<25) bar.style.background="var(--red)"; }
      if(num) num.textContent = (info.paused? "⏸ " : "") + Math.max(0,Math.ceil(info.msLeft/1000))+"s";
      if(info.msLeft<=0 && !info.paused && answeredForIndex !== state.room.currentIndex){
        lockAnswer(null);
      }
    }, 150);
  }

  function lockAnswer(choice){
    var idx = state.room.currentIndex;
    if(answeredForIndex === idx) return; // ya se respondio o se agoto el tiempo para esta pregunta
    answeredForIndex = idx;
    var q = QUESTIONS[idx];
    clearInterval(state.timerTickId);

    var info = currentDeadlineInfo();
    var correct = (choice===q.correct);
    var me = (state.room.players && state.room.players[state.playerId]) || {score:0,streak:0,bestStreak:0,correctCount:0};
    var points = 0;
    var newStreak = 0, newBest = me.bestStreak||0, newCorrect = me.correctCount||0;
    if(correct){
      points = computeScore(q.points, q.time, info.msLeft, me.streak||0);
      newStreak = (me.streak||0)+1; newBest = Math.max(newBest, newStreak); newCorrect = newCorrect+1;
      beep(880,.14,"triangle");
    } else {
      newStreak = 0; beep(220,.18,"sawtooth");
    }

    var playerRef = db.ref("rooms/"+state.roomCode+"/players/"+state.playerId);
    playerRef.update({
      score: (me.score||0)+points, streak:newStreak, bestStreak:newBest, correctCount:newCorrect, connected:true
    });
    db.ref("rooms/"+state.roomCode+"/answers/"+idx+"/"+state.playerId).set({
      choice: choice, correct: correct, points: points, submittedAt: serverNow(), name: state.name
    });
    // dañar al jefe en vivo, para todos: incremento atómico de daño (nunca decremento negativo pisado)
    if(correct && window.firebase && firebase.database && firebase.database.ServerValue){
      var dmg = (window.DAMAGE_PER_CORRECT && DAMAGE_PER_CORRECT[q.tier]) || 80;
      db.ref("rooms/"+state.roomCode+"/boss/hp").transaction(function(cur){
        if(cur===null) return cur;
        return Math.max(0, cur - dmg);
      });
    }

    // feedback visual local inmediato (sin mostrar aún si es correcto — eso llega con 'reveal')
    document.querySelectorAll("#optsWrap .opt-btn").forEach(function(b,i){
      b.disabled = true;
      if(i===choice) b.classList.add("pick");
    });
    var wrap = playRoot.querySelector(".card");
    var note = document.createElement("div");
    note.className = "feedback ok";
    note.style.marginTop = "14px";
    note.innerHTML = '<div class="fb-head">📨 Respuesta enviada</div>' +
      '<div class="fb-points">Esperando a que el profesor revele la respuesta correcta…</div>';
    wrap.appendChild(note);
  }

  function renderReveal(){
    clearInterval(state.timerTickId);
    var idx = state.room.currentIndex;
    var q = QUESTIONS[idx];
    var myAns = (state.room.answers && state.room.answers[idx] && state.room.answers[idx][state.playerId]) || null;
    var me = (state.room.players && state.room.players[state.playerId]) || {score:0,streak:0};

    var optsHTML = q.options.map(function(o,i){
      var cls = "opt-btn";
      if(i===q.correct) cls += " correct";
      else if(myAns && myAns.choice===i) cls += " wrong";
      return '<div class="'+cls+'">' +
        '<span class="opt-letter">'+String.fromCharCode(65+i)+'</span>' +
        '<span>'+optionHTML(o)+'</span>' + (i===q.correct? ' <span style="margin-left:auto;">✅</span>' : '') +
      '</div>';
    }).join('');

    var correct = myAns ? myAns.correct : false;

    playRoot.innerHTML = '<div class="wrap-narrow">' +
      bossWidget(true) +
      scorebarHTML() + progressDots() +
      '<div class="card">' +
        '<div class="q-head">'+tierChip(q.tier)+'</div>' +
        '<div class="q-title">'+esc(q.title)+'</div>' +
        (q.matrixQuestion? matrixQuestionHTML(q.matrixQuestion) : '') +
        '<div class="options">'+optsHTML+'</div>' +
        '<div class="feedback '+(correct?"ok":"bad")+'">' +
          '<div class="fb-head">'+(myAns? (correct? "✅ ¡Correcto!" : "❌ No era esa") : "⌛ No alcanzaste a responder")+'</div>' +
          (myAns? '<div class="fb-points">Puntos ganados: <b>+'+(myAns.points||0)+'</b></div>' : '') +
          ((me.streak||0)>=3? '<div class="streak-line">🔥 Racha de '+me.streak+' aciertos seguidos</div>' : '') +
          '<div class="fb-explain">'+esc(q.explain)+'</div>' +
        '</div>' +
        '<p class="muted" style="margin-top:14px; font-size:12.5px;" class="pulse">Esperando la siguiente pregunta…</p>' +
      '</div>' +
    '</div>';
  }

  function renderEnded(){
    clearInterval(state.timerTickId);
    var me = (state.room.players && state.room.players[state.playerId]) || {score:0,streak:0,bestStreak:0,correctCount:0};
    var total = QUESTIONS.length;
    var accuracy = Math.round(((me.correctCount||0)/total)*100);
    var rank = rankTitle(me.score||0);

    // ranking entre todos los jugadores conectados
    var all = state.room.players || {};
    var sorted = Object.keys(all).map(function(k){ return Object.assign({id:k}, all[k]); }).sort(function(a,b){ return (b.score||0)-(a.score||0); });
    var myRank = sorted.findIndex(function(p){ return p.id===state.playerId; }) + 1;

    var shareText = "🧮 BATALLA DE MATRICES\n"+state.avatar+" "+state.name+"\n🏆 Puntaje: "+(me.score||0)+" pts (puesto #"+myRank+" de "+sorted.length+")\n✅ Aciertos: "+(me.correctCount||0)+"/"+total+" ("+accuracy+"%)\n🔥 Racha máxima: "+(me.bestStreak||0)+"\n"+rank.title;

    playRoot.innerHTML = '<div class="wrap-narrow">' +
      bossWidget(false) +
      '<div class="card center">' +
        '<div style="font-size:46px;">'+state.avatar+'</div>' +
        '<div class="muted" style="margin-top:6px;">'+esc(state.name)+' · puesto #'+myRank+' de '+sorted.length+'</div>' +
        '<div class="rank-title">'+rank.title+'</div>' +
        '<div class="final-score">'+(me.score||0)+' <span style="font-size:16px; color:var(--muted); font-family:var(--font-body);">pts</span></div>' +
        '<p class="muted" style="margin-top:6px; font-size:13px;">'+rank.note+'</p>' +
        '<div class="stat-grid">' +
          '<div class="stat-tile"><div class="v">'+(me.correctCount||0)+'/'+total+'</div><div class="l">Aciertos</div></div>' +
          '<div class="stat-tile"><div class="v">'+accuracy+'%</div><div class="l">Precisión</div></div>' +
          '<div class="stat-tile"><div class="v">'+(me.bestStreak||0)+'</div><div class="l">Racha máxima</div></div>' +
        '</div>' +
        '<div class="share-box" id="shareBox">'+esc(shareText)+'</div>' +
        '<div class="btn-row" style="justify-content:center; margin-top:16px;">' +
          '<button class="btn btn-primary" id="copyBtn">📋 Copiar mi resultado</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    document.getElementById("copyBtn").addEventListener("click", function(){
      var btn = this;
      function done(ok){ btn.textContent = ok? "✅ ¡Copiado!" : "Selecciona y copia el texto manualmente"; setTimeout(function(){ btn.textContent="📋 Copiar mi resultado"; },1800); }
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(shareText).then(function(){done(true);}, function(){done(false);});
      } else { done(false); }
    });
    beep(988,.16,"triangle"); setTimeout(function(){beep(1318,.22,"triangle");},140);
  }

})();
