/* ======================================================================
   Utilidades compartidas: render de matrices, puntajes, jefe final, etc.
   ====================================================================== */
(function(global){
  "use strict";

  global.AVATARS = ["🦁","🐉","🚀","🧠","🔺","🧮","➗","🦊","🦉","🐺","⚡","🎯","🐢","🦅","🐙","🦂"];
  global.TIER_LABEL = {bronce:"🥉 Bronce", plata:"🥈 Plata", oro:"🥇 Oro"};

  // ---- El jefe final: cada nivel tiene su propia bestia ----
  // Sprites CC0 de Kenney Vleugels (kenney.nl) — ver assets/boss/LICENSE-sprites.txt
  global.BOSSES = {
    matriz: { name:"El Guardián de la Matriz", normal:"assets/boss/boss_normal.webp", hit:"assets/boss/boss_hit.webp", dead:"assets/boss/boss_dead.webp", hp:1200 }
  };
  global.DAMAGE_PER_CORRECT = { bronce:60, plata:100, oro:160 };

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
  function fmtNum(n){ return (n<0? "−"+Math.abs(n) : String(n)); }
  function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }

  function matrixHTML(rows){
    var body = rows.map(function(r){
      return "<tr>"+ r.map(function(v){ return "<td>"+esc(fmtNum(v))+"</td>"; }).join("") +"</tr>";
    }).join("");
    return '<span class="matrix"><span class="bracket bracket-l"></span>' +
           '<table class="matrix-table">'+body+'</table>' +
           '<span class="bracket bracket-r"></span></span>';
  }
  function optionHTML(opt){ return opt.m ? matrixHTML(opt.m) : '<span>'+esc(opt.t)+'</span>'; }
  function matrixQuestionHTML(mq){
    return '<div class="mq-row">' + mq.map(function(m){
      return '<span class="mq-item">'+esc(m.label)+' = '+matrixHTML(m.rows)+'</span>';
    }).join('') + '</div>';
  }

  function genRoomCode(){ return String(Math.floor(100000 + Math.random()*900000)); }

  function computeScore(basePoints, totalTimeSec, msLeft, streakBefore){
    var speedMult = 0.5 + 0.5*clamp(msLeft/(totalTimeSec*1000), 0, 1);
    var streakMult = 1 + Math.min(streakBefore,5)*0.1;
    return Math.round(basePoints*speedMult*streakMult);
  }

  function rankTitle(score){
    if(score>=2500) return {title:"🏆 Gran Maestro de Matrices", note:"Dominio total de operaciones y determinantes."};
    if(score>=1800) return {title:"🥇 Experto en Matrices", note:"Muy sólido en las operaciones fundamentales."};
    if(score>=1000) return {title:"🥈 Aprendiz Avanzado", note:"Buen manejo, con algunos conceptos por afianzar."};
    return {title:"🥉 Explorador Novato", note:"Vale la pena repasar la Unidad 1 con calma."};
  }

  function safeLocal(){
    try{ var k="__t"; localStorage.setItem(k,"1"); localStorage.removeItem(k); return true; }catch(e){ return false; }
  }
  var HAS_LOCAL = safeLocal();
  function lsGet(k, fallback){
    if(!HAS_LOCAL) return fallback;
    try{ var v = localStorage.getItem(k); return v==null? fallback : JSON.parse(v); }catch(e){ return fallback; }
  }
  function lsSet(k,v){ if(!HAS_LOCAL) return; try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

  var audioCtx = null;
  function beep(freq, dur, type){
    try{
      if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
      if(audioCtx.state==="suspended") audioCtx.resume();
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type||"sine"; o.frequency.value = freq;
      g.gain.value = 0.07;
      o.connect(g); g.connect(audioCtx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.stop(audioCtx.currentTime + dur + 0.02);
    }catch(e){}
  }

  global.esc = esc; global.fmtNum = fmtNum; global.clamp = clamp;
  global.matrixHTML = matrixHTML; global.optionHTML = optionHTML; global.matrixQuestionHTML = matrixQuestionHTML;
  global.genRoomCode = genRoomCode; global.computeScore = computeScore; global.rankTitle = rankTitle;
  global.lsGet = lsGet; global.lsSet = lsSet; global.HAS_LOCAL = HAS_LOCAL;
  global.beep = beep;
})(window);
