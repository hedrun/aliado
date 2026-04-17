const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const {
  createRoom, createPlayer, rollDice, isDouble, isEighteen,
  canExitJail, getMovablePieces, movePiece, getNextPlayerIndex,
  checkGameOver, PLAYER_COLORS
} = require('./src/gameLogic');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// In-memory store
const rooms = {};
const socketToPlayer = {}; // socketId -> { roomCode, playerId }

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function sanitizeRoom(room) {
  // Send full room state to clients
  return {
    code: room.code,
    hostId: room.hostId,
    gameStarted: room.gameStarted,
    gameOver: room.gameOver,
    winner: room.winner,
    currentPlayerIndex: room.currentPlayerIndex,
    turnPhase: room.turnPhase,
    diceValues: room.diceValues,
    diceRolled: room.diceRolled,
    movablePieces: room.movablePieces,
    log: room.log.slice(-20),
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      pieces: p.pieces,
      finished: p.finished,
      alliances: p.alliances,
      isReady: p.isReady,
      bleeding: p.bleeding
    }))
  };
}

function addLog(room, message, type = 'info') {
  room.log.push({ message, type, timestamp: Date.now() });
  if (room.log.length > 50) room.log.shift();
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Create room
  socket.on('create_room', ({ playerName }, cb) => {
    let code;
    do { code = generateRoomCode(); } while (rooms[code]);

    const room = createRoom(code, socket.id);
    const playerId = uuidv4();
    const color = PLAYER_COLORS[0];
    const player = createPlayer(playerId, playerName || 'Hero', color, socket.id);
    room.players.push(player);
    rooms[code] = room;
    socketToPlayer[socket.id] = { roomCode: code, playerId };

    socket.join(code);
    cb({ success: true, roomCode: code, playerId, color });
    io.to(code).emit('room_update', sanitizeRoom(room));
    console.log(`Room ${code} created by ${playerName}`);
  });

  // Join room
  socket.on('join_room', ({ roomCode, playerName }, cb) => {
    const room = rooms[roomCode];
    if (!room) return cb({ success: false, message: 'Sala não encontrada!' });
    if (room.gameStarted) return cb({ success: false, message: 'Jogo já começou!' });
    if (room.players.length >= 4) return cb({ success: false, message: 'Sala cheia! (máx 4 jogadores)' });

    const usedColors = room.players.map(p => p.color);
    const color = PLAYER_COLORS.find(c => !usedColors.includes(c));

    const playerId = uuidv4();
    const player = createPlayer(playerId, playerName || 'Novo Herói', color, socket.id);
    room.players.push(player);
    socketToPlayer[socket.id] = { roomCode, playerId };

    socket.join(roomCode);
    addLog(room, `${player.name} entrou na sala!`, 'join');
    cb({ success: true, roomCode, playerId, color });
    io.to(roomCode).emit('room_update', sanitizeRoom(room));
    console.log(`${playerName} joined room ${roomCode}`);
  });

  // Rejoin room
  socket.on('rejoin_room', ({ roomCode, playerId }, cb) => {
    const room = rooms[roomCode];
    if (!room) return cb({ success: false, message: 'Sala não encontrada' });

    const player = room.players.find(p => p.id === playerId);
    if (!player) return cb({ success: false, message: 'Jogador não encontrado' });

    player.socketId = socket.id;
    socketToPlayer[socket.id] = { roomCode, playerId };
    socket.join(roomCode);
    cb({ success: true, color: player.color });
    io.to(roomCode).emit('room_update', sanitizeRoom(room));
  });

  // Set ready
  socket.on('set_ready', () => {
    const info = socketToPlayer[socket.id];
    if (!info) return;
    const room = rooms[info.roomCode];
    if (!room) return;
    const player = room.players.find(p => p.id === info.playerId);
    if (!player) return;
    player.isReady = !player.isReady;
    io.to(info.roomCode).emit('room_update', sanitizeRoom(room));
  });

  // Start game
  socket.on('start_game', (cb) => {
    const info = socketToPlayer[socket.id];
    if (!info) return cb?.({ success: false });
    const room = rooms[info.roomCode];
    if (!room) return cb?.({ success: false });
    if (room.hostId !== socket.id) return cb?.({ success: false, message: 'Apenas o host pode iniciar!' });
    if (room.players.length < 2) return cb?.({ success: false, message: 'Precisa de pelo menos 2 jogadores!' });

    room.gameStarted = true;
    room.currentPlayerIndex = 0;
    room.turnPhase = 'roll';
    addLog(room, '⚡ O jogo começou! Que os heróis lutem!', 'start');
    cb?.({ success: true });
    io.to(info.roomCode).emit('room_update', sanitizeRoom(room));
    io.to(info.roomCode).emit('game_started');
  });

  // Roll dice
  socket.on('roll_dice', (cb) => {
    const info = socketToPlayer[socket.id];
    if (!info) return;
    const room = rooms[info.roomCode];
    if (!room || !room.gameStarted) return;

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (currentPlayer.id !== info.playerId) return cb?.({ success: false, message: 'Não é sua vez!' });
    if (room.turnPhase !== 'roll') return cb?.({ success: false, message: 'Dados já rolados!' });

    const dice = rollDice();
    room.diceValues = dice;
    room.diceRolled = true;
    room.turnPhase = 'move';

    const movable = getMovablePieces(currentPlayer, dice, room.players);
    room.movablePieces = movable;

    const double = isDouble(dice);
    const eighteen = isEighteen(dice);
    let msg = `${currentPlayer.name} rolou ${dice[0]} e ${dice[1]}`;
    if (double) msg += ' (DUPLA! Joga de novo!)';
    if (eighteen) msg += ' (18! Joga de novo!)';
    addLog(room, msg, 'dice');

    if (movable.length === 0) {
      // No moves available, skip turn
      addLog(room, `${currentPlayer.name} não tem jogadas disponíveis.`, 'info');
      if (double || eighteen) {
        room.turnPhase = 'roll';
        room.diceValues = [];
      } else {
        room.currentPlayerIndex = getNextPlayerIndex(room);
        room.turnPhase = 'roll';
        room.diceValues = [];
        room.movablePieces = [];
      }
    }

    cb?.({ success: true });
    io.to(info.roomCode).emit('room_update', sanitizeRoom(room));
  });

  // Move piece
  socket.on('move_piece', ({ pieceId, steps, exitJail }, cb) => {
    const info = socketToPlayer[socket.id];
    if (!info) return;
    const room = rooms[info.roomCode];
    if (!room || !room.gameStarted) return;

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (currentPlayer.id !== info.playerId) return cb?.({ success: false, message: 'Não é sua vez!' });
    if (room.turnPhase !== 'move') return cb?.({ success: false, message: 'Rola os dados primeiro!' });

    const result = movePiece(room, info.playerId, pieceId, steps, exitJail);
    if (!result.success) return cb?.({ success: false, message: result.message });

    for (const event of (result.events || [])) {
      addLog(room, event.message, event.type);
    }

    // Check game over
    if (checkGameOver(room)) {
      const winner = room.players.find(p => p.id === room.winner);
      addLog(room, `🏆 ${winner?.name} VENCEU! INVINCIBLE!`, 'win');
      cb?.({ success: true });
      io.to(info.roomCode).emit('room_update', sanitizeRoom(room));
      io.to(info.roomCode).emit('game_over', { winnerId: room.winner, winnerName: winner?.name });
      return;
    }

    const dice = room.diceValues;
    const double = isDouble(dice);
    const eighteen = isEighteen(dice);

    if (double || eighteen) {
      // Extra turn
      room.turnPhase = 'roll';
      room.diceValues = [];
      room.movablePieces = [];
      addLog(room, `${currentPlayer.name} joga novamente!`, 'extra');
    } else {
      room.currentPlayerIndex = getNextPlayerIndex(room);
      room.turnPhase = 'roll';
      room.diceValues = [];
      room.movablePieces = [];
    }

    cb?.({ success: true });
    io.to(info.roomCode).emit('room_update', sanitizeRoom(room));
  });

  // Propose alliance
  socket.on('propose_alliance', ({ targetPlayerId }, cb) => {
    const info = socketToPlayer[socket.id];
    if (!info) return;
    const room = rooms[info.roomCode];
    if (!room) return;

    const player = room.players.find(p => p.id === info.playerId);
    const target = room.players.find(p => p.id === targetPlayerId);
    if (!player || !target) return;

    // Notify target
    const targetSocket = target.socketId;
    io.to(targetSocket).emit('alliance_proposal', {
      fromId: player.id,
      fromName: player.name,
      fromColor: player.color
    });
    addLog(room, `${player.name} propôs aliança com ${target.name}!`, 'alliance');
    cb?.({ success: true });
    io.to(info.roomCode).emit('room_update', sanitizeRoom(room));
  });

  // Respond to alliance
  socket.on('respond_alliance', ({ fromPlayerId, accept }, cb) => {
    const info = socketToPlayer[socket.id];
    if (!info) return;
    const room = rooms[info.roomCode];
    if (!room) return;

    const player = room.players.find(p => p.id === info.playerId);
    const fromPlayer = room.players.find(p => p.id === fromPlayerId);
    if (!player || !fromPlayer) return;

    if (accept) {
      if (!player.alliances.includes(fromPlayerId)) player.alliances.push(fromPlayerId);
      if (!fromPlayer.alliances.includes(info.playerId)) fromPlayer.alliances.push(info.playerId);
      addLog(room, `🤝 ${player.name} e ${fromPlayer.name} firmaram aliança!`, 'alliance');
    } else {
      addLog(room, `❌ ${player.name} recusou aliança com ${fromPlayer.name}.`, 'info');
    }

    cb?.({ success: true });
    io.to(info.roomCode).emit('room_update', sanitizeRoom(room));
  });

  // Break alliance
  socket.on('break_alliance', ({ targetPlayerId }, cb) => {
    const info = socketToPlayer[socket.id];
    if (!info) return;
    const room = rooms[info.roomCode];
    if (!room) return;

    const player = room.players.find(p => p.id === info.playerId);
    const target = room.players.find(p => p.id === targetPlayerId);
    if (!player || !target) return;

    player.alliances = player.alliances.filter(id => id !== targetPlayerId);
    target.alliances = target.alliances.filter(id => id !== info.playerId);

    addLog(room, `💔 ${player.name} traiu a aliança com ${target.name}!`, 'betray');
    cb?.({ success: true });
    io.to(info.roomCode).emit('room_update', sanitizeRoom(room));
  });

  // Chat
  socket.on('chat_message', ({ message }) => {
    const info = socketToPlayer[socket.id];
    if (!info) return;
    const room = rooms[info.roomCode];
    if (!room) return;
    const player = room.players.find(p => p.id === info.playerId);
    if (!player) return;

    const sanitized = message.slice(0, 100);
    io.to(info.roomCode).emit('chat', {
      playerName: player.name,
      color: player.color,
      message: sanitized
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    const info = socketToPlayer[socket.id];
    if (info) {
      const room = rooms[info.roomCode];
      if (room) {
        const player = room.players.find(p => p.id === info.playerId);
        if (player) {
          addLog(room, `${player.name} desconectou.`, 'disconnect');
          io.to(info.roomCode).emit('room_update', sanitizeRoom(room));
        }
      }
      delete socketToPlayer[socket.id];
    }
  });
});

// Cleanup old rooms periodically
setInterval(() => {
  const now = Date.now();
  for (const code of Object.keys(rooms)) {
    const room = rooms[code];
    if (now - room.createdAt > 24 * 60 * 60 * 1000) {
      delete rooms[code];
    }
  }
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🦸 Aliado Invincible server running on port ${PORT}`);
});
