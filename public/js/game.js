// Game client logic
const socket = io();

let myPlayerId = null;
let myRoomCode = null;
let roomState = null;
let pendingAllianceFrom = null;
let selectedPieceId = null;
let movablePieceIds = [];
let chatTimeout = null;

// ===== SCREEN MANAGEMENT =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

// ===== ROOM CREATION =====
function createRoom() {
  const name = document.getElementById('create-name').value.trim() || 'Herói';
  socket.emit('create_room', { playerName: name }, (res) => {
    if (res.success) {
      myPlayerId = res.playerId;
      myRoomCode = res.roomCode;
      saveSession();
      document.getElementById('display-room-code').textContent = res.roomCode;
      showScreen('waiting');
    } else {
      alert(res.message || 'Erro ao criar sala');
    }
  });
}

function joinRoom() {
  const name = document.getElementById('join-name').value.trim() || 'Herói';
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (!code) return alert('Digite o código da sala!');

  socket.emit('join_room', { roomCode: code, playerName: name }, (res) => {
    if (res.success) {
      myPlayerId = res.playerId;
      myRoomCode = res.roomCode;
      saveSession();
      document.getElementById('display-room-code').textContent = res.roomCode;
      showScreen('waiting');
    } else {
      alert(res.message || 'Sala não encontrada');
    }
  });
}

function copyCode() {
  const code = document.getElementById('display-room-code').textContent;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.querySelector('.btn-copy');
    btn.textContent = 'COPIADO!';
    setTimeout(() => btn.textContent = 'COPIAR', 2000);
  });
}

function toggleReady() {
  socket.emit('set_ready');
}

function startGame() {
  socket.emit('start_game', (res) => {
    if (!res?.success) alert(res?.message || 'Erro ao iniciar');
  });
}

// ===== DICE =====
function rollDice() {
  socket.emit('roll_dice', (res) => {
    if (!res?.success) showToast(res?.message);
  });
}

// ===== MOVE PIECE =====
function onPieceClick(pieceId) {
  if (!movablePieceIds.includes(pieceId)) return;

  const player = roomState?.players?.find(p => p.id === myPlayerId);
  if (!player) return;
  const piece = player.pieces.find(p => p.id === pieceId);
  if (!piece) return;

  // Find the movable entry for this piece
  const movableEntries = roomState.movablePieces.filter(m => m.pieceId === pieceId);

  if (movableEntries.length === 1) {
    executePieceMove(piece, movableEntries[0]);
  } else if (movableEntries.length > 1) {
    // Multiple options - show selection
    showMoveOptions(piece, movableEntries);
  }
}

function executePieceMove(piece, moveEntry) {
  if (piece.inJail) {
    socket.emit('move_piece', { pieceId: piece.id, exitJail: true }, (res) => {
      if (!res?.success) showToast(res?.message);
    });
  } else {
    socket.emit('move_piece', { pieceId: piece.id, steps: moveEntry.steps }, (res) => {
      if (!res?.success) showToast(res?.message);
    });
  }
}

function showMoveOptions(piece, entries) {
  // Simple prompt for split
  const options = entries.map((e, i) => `${i + 1}. Mover ${e.steps} casas${e.split ? ' (dividir)' : ''}`).join('\n');
  const choice = prompt(`Escolha a jogada:\n${options}\n(Digite 1 ou 2)`);
  const idx = parseInt(choice) - 1;
  if (idx >= 0 && idx < entries.length) {
    executePieceMove(piece, entries[idx]);
  }
}

// ===== ALLIANCES =====
function proposeAlliance(targetId) {
  socket.emit('propose_alliance', { targetPlayerId: targetId }, (res) => {
    if (res?.success) showToast('Proposta enviada!');
  });
}

function breakAlliance(targetId) {
  if (!confirm('Trair a aliança?')) return;
  socket.emit('break_alliance', { targetPlayerId: targetId });
}

function respondAlliance(accept) {
  if (!pendingAllianceFrom) return;
  socket.emit('respond_alliance', { fromPlayerId: pendingAllianceFrom, accept }, () => {});
  pendingAllianceFrom = null;
  document.getElementById('alliance-modal').classList.add('hidden');
}

// ===== CHAT =====
function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit('chat_message', { message: msg });
  input.value = '';
}

document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});

// ===== SESSION =====
function saveSession() {
  if (myPlayerId && myRoomCode) {
    sessionStorage.setItem('aliado_player', myPlayerId);
    sessionStorage.setItem('aliado_room', myRoomCode);
  }
}

function loadSession() {
  const pid = sessionStorage.getItem('aliado_player');
  const rc = sessionStorage.getItem('aliado_room');
  if (pid && rc) {
    socket.emit('rejoin_room', { roomCode: rc, playerId: pid }, (res) => {
      if (res.success) {
        myPlayerId = pid;
        myRoomCode = rc;
      }
    });
  }
}

// ===== SOCKET EVENTS =====
socket.on('room_update', (room) => {
  roomState = room;
  updateUI(room);
});

socket.on('game_started', () => {
  showScreen('game');
});

socket.on('game_over', ({ winnerId, winnerName }) => {
  document.getElementById('gameover-winner').textContent = winnerName + ' VENCEU!';
  showScreen('gameover');
});

socket.on('alliance_proposal', ({ fromId, fromName, fromColor }) => {
  pendingAllianceFrom = fromId;
  document.getElementById('alliance-proposal-text').textContent =
    `${fromName} quer se aliar com você!`;
  const modal = document.getElementById('alliance-modal');
  modal.style.borderColor = BOARD_COLORS?.[fromColor] || '#FFE135';
  modal.classList.remove('hidden');
});

socket.on('chat', ({ playerName, color, message }) => {
  showChatMessage(playerName, color, message);
  addToGameLog(`💬 ${playerName}: ${message}`, 'info');
});

// ===== UI UPDATE =====
function updateUI(room) {
  if (!room) return;

  // Update waiting room
  if (!room.gameStarted) {
    updateWaitingRoom(room);
    return;
  }

  // Update game screen
  updateGameScreen(room);
}

function updateWaitingRoom(room) {
  const container = document.getElementById('waiting-players');
  if (!container) return;

  container.innerHTML = room.players.map(p => `
    <div class="waiting-player ${p.isReady ? 'ready' : ''}">
      <div class="player-dot" style="background:${getPlayerColor(p.color)}"></div>
      <span class="player-name">${p.name} ${p.id === myPlayerId ? '(você)' : ''}</span>
      <span class="player-status ${p.isReady ? 'ready' : ''}">${p.isReady ? 'PRONTO' : 'AGUARDANDO'}</span>
    </div>
  `).join('');

  // Log
  const logEl = document.getElementById('waiting-log');
  if (logEl) {
    logEl.innerHTML = room.log.slice(-5).map(l => `<div>${l.message}</div>`).join('');
    logEl.scrollTop = logEl.scrollHeight;
  }

  // Start button for host
  const startBtn = document.getElementById('start-btn');
  if (startBtn) {
    const isHost = room.players.find(p => p.id === myPlayerId)?.socketId === room.hostId ||
      room.players[0]?.id === myPlayerId;
    startBtn.classList.toggle('hidden', !isHost || room.players.length < 2);
  }

  // Ready button text
  const readyBtn = document.getElementById('ready-btn');
  if (readyBtn) {
    const me = room.players.find(p => p.id === myPlayerId);
    if (me) readyBtn.textContent = me.isReady ? 'NÃO ESTOU PRONTO' : 'ESTOU PRONTO';
  }
}

function updateGameScreen(room) {
  const currentPlayer = room.players[room.currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === myPlayerId;

  // Turn indicator
  const turnEl = document.getElementById('turn-name');
  if (turnEl) {
    turnEl.textContent = isMyTurn
      ? '⚡ SUA VEZ!'
      : `VEZ DE: ${currentPlayer?.name?.toUpperCase()}`;
    turnEl.style.color = isMyTurn ? '#FFE135' : '#888';
  }

  // Dice
  const d1 = document.getElementById('die1');
  const d2 = document.getElementById('die2');
  if (d1 && d2) {
    d1.textContent = room.diceValues[0] || '?';
    d2.textContent = room.diceValues[1] || '?';
  }

  // Roll button
  const rollBtn = document.getElementById('roll-btn');
  if (rollBtn) {
    rollBtn.disabled = !isMyTurn || room.turnPhase !== 'roll';
  }

  // Movable pieces
  movablePieceIds = [];
  if (isMyTurn && room.turnPhase === 'move') {
    movablePieceIds = [...new Set(room.movablePieces.map(m => m.pieceId))];
  }

  // Players panel
  updatePlayersPanel(room);

  // Alliance panel
  updateAlliancePanel(room);

  // Game log
  const logEl = document.getElementById('game-log');
  if (logEl) {
    logEl.innerHTML = room.log.map(l =>
      `<div class="log-entry ${l.type || ''}">${l.message}</div>`
    ).join('');
    logEl.scrollTop = logEl.scrollHeight;
  }

  // Render board
  const canvas = document.getElementById('gameCanvas');
  if (canvas && room) {
    drawBoard(canvas, room, myPlayerId, movablePieceIds, onPieceClick);
  }
}

function updatePlayersPanel(room) {
  const panel = document.getElementById('players-panel');
  if (!panel) return;

  const currentPlayer = room.players[room.currentPlayerIndex];
  const myPlayer = room.players.find(p => p.id === myPlayerId);

  panel.innerHTML = room.players.map(p => {
    const isActive = p.id === currentPlayer?.id;
    const isAllied = myPlayer?.alliances?.includes(p.id);
    const pieces = p.pieces.map(pc => `
      <div class="piece-mini ${pc.inJail ? 'in-jail' : ''} ${pc.finished ? 'finished' : ''}"
           style="background:${getPlayerColor(p.color)}"></div>
    `).join('');

    return `
      <div class="player-row ${isActive ? 'active-turn' : ''} ${p.finished ? 'finished' : ''}"
           style="border-left-color:${getPlayerColor(p.color)}">
        <div class="player-dot-sm" style="background:${getPlayerColor(p.color)}"></div>
        <span class="player-row-name">${p.name} ${p.id === myPlayerId ? '(você)' : ''}</span>
        ${isAllied ? '<span class="alliance-badge">ALIADO</span>' : ''}
        ${p.bleeding ? '<span class="bleeding-badge">🩸</span>' : ''}
        <div class="player-row-pieces">${pieces}</div>
      </div>
    `;
  }).join('');
}

function updateAlliancePanel(room) {
  const container = document.getElementById('alliance-buttons');
  if (!container) return;

  const myPlayer = room.players.find(p => p.id === myPlayerId);
  if (!myPlayer) return;

  const others = room.players.filter(p => p.id !== myPlayerId && !p.finished);

  container.innerHTML = others.map(p => {
    const isAllied = myPlayer.alliances.includes(p.id);
    if (isAllied) {
      return `
        <button class="alliance-btn break" onclick="breakAlliance('${p.id}')">
          💔 Trair ${p.name}
        </button>
      `;
    } else {
      return `
        <button class="alliance-btn propose" onclick="proposeAlliance('${p.id}')">
          🤝 Aliar ${p.name}
        </button>
      `;
    }
  }).join('');
}

function addToGameLog(message, type) {
  const logEl = document.getElementById('game-log');
  if (!logEl) return;
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = message;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

function showChatMessage(playerName, color, message) {
  // Remove old chat bubbles
  document.querySelectorAll('.chat-message').forEach(el => el.remove());

  const div = document.createElement('div');
  div.className = 'chat-message';
  div.innerHTML = `<span style="color:${getPlayerColor(color)}">${playerName}:</span> ${message}`;
  document.body.appendChild(div);

  setTimeout(() => div.remove(), 3200);
}

function showToast(msg) {
  if (!msg) return;
  const div = document.createElement('div');
  div.style.cssText = `
    position:fixed;top:20px;left:50%;transform:translateX(-50%);
    background:#222;border:1px solid #FFE135;color:#FFE135;
    padding:10px 20px;border-radius:6px;z-index:999;
    font-family:'Bebas Neue',cursive;letter-spacing:2px;font-size:1rem;
    animation:chatPop 0.2s ease;
  `;
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 2500);
}

function getPlayerColor(color) {
  const map = {
    yellow: '#FFE135',
    red: '#E8001C',
    blue: '#4A9FFF',
    green: '#00CC66'
  };
  return map[color] || '#ffffff';
}

// Animate dice roll
socket.on('room_update', (room) => {
  if (room.diceValues?.length === 2) {
    const d1 = document.getElementById('die1');
    const d2 = document.getElementById('die2');
    if (d1 && d2) {
      d1.classList.add('rolling');
      d2.classList.add('rolling');
      setTimeout(() => {
        d1.classList.remove('rolling');
        d2.classList.remove('rolling');
      }, 400);
    }
  }
});

// ===== INIT =====
loadSession();
showScreen('splash');
