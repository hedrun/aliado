// Game Logic for Aliado - Free for All with Alliances

const BOARD_SIZE = 52; // number of path squares
const HOME_STRETCH = 6; // squares in home stretch
const PIECES_PER_PLAYER = 4;

const PLAYER_COLORS = ['yellow', 'red', 'blue', 'green'];

const SKULL_SQUARES = [8, 21, 34, 47]; // squares that send piece back to jail

// Starting positions on the main track for each color
const START_POSITIONS = {
  yellow: 0,
  red: 13,
  blue: 26,
  green: 39
};

// Safe squares (cannot be killed here)
const SAFE_SQUARES = [0, 13, 26, 39];

function createPiece(playerId, index) {
  return {
    id: `${playerId}_${index}`,
    playerId,
    position: -1, // -1 = in jail (paiol)
    inJail: true,
    finished: false,
    homeStretch: false,
    homeStretchPos: -1,
    groupedWith: null // id of piece grouped with (pitoco)
  };
}

function createPlayer(id, name, color, socketId) {
  return {
    id,
    name,
    color,
    socketId,
    pieces: [0, 1, 2, 3].map(i => createPiece(id, i)),
    finished: false,
    alliances: [], // array of player ids allied with
    isReady: false,
    score: 0,
    bleeding: false, // just died, skip one turn
    extraTurn: false
  };
}

function createRoom(code, hostId) {
  return {
    code,
    hostId,
    players: [],
    gameStarted: false,
    gameOver: false,
    winner: null,
    currentPlayerIndex: 0,
    turnPhase: 'roll', // 'roll' | 'move' | 'done'
    diceValues: [],
    diceRolled: false,
    movablePieces: [],
    log: [],
    createdAt: Date.now()
  };
}

function rollDice() {
  return [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1
  ];
}

function isDouble(dice) {
  return dice[0] === dice[1];
}

function isEighteen(dice) {
  return (dice[0] === 1 && dice[1] === 2) || (dice[0] === 2 && dice[1] === 1);
}

function canExitJail(dice) {
  // Need a 6 on either die, or double 1s, or double 6s
  return dice[0] === 6 || dice[1] === 6 || isDouble(dice);
}

function getAbsolutePosition(piece, color) {
  if (piece.inJail || piece.finished) return -1;
  if (piece.homeStretch) return 1000 + piece.homeStretchPos; // special range
  return piece.position;
}

function normalizePosition(pos) {
  return ((pos % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
}

function getMovablePieces(player, dice, allPlayers) {
  const movable = [];
  const total = dice[0] + dice[1];
  const hasDouble = isDouble(dice);
  const hasEighteen = isEighteen(dice);
  const canExit = canExitJail(dice);

  for (const piece of player.pieces) {
    if (piece.finished) continue;

    if (piece.inJail) {
      if (canExit) {
        movable.push({ pieceId: piece.id, moves: [] });
      }
    } else if (piece.homeStretch) {
      // In home stretch
      const newPos = piece.homeStretchPos + total;
      if (newPos <= HOME_STRETCH) {
        movable.push({ pieceId: piece.id, steps: total });
      }
      // With a 6, can split
      if ((dice[0] === 6 || dice[1] === 6) && !hasDouble) {
        const other = dice[0] === 6 ? dice[1] : dice[0];
        const newPos2 = piece.homeStretchPos + other;
        if (newPos2 <= HOME_STRETCH) {
          movable.push({ pieceId: piece.id, steps: other, split: true });
        }
      }
    } else {
      // On board
      movable.push({ pieceId: piece.id, steps: total });

      // Split on 6
      if ((dice[0] === 6 || dice[1] === 6) && !hasDouble && !hasEighteen) {
        const other = dice[0] === 6 ? dice[1] : dice[0];
        movable.push({ pieceId: piece.id, steps: other, split: true });
        movable.push({ pieceId: piece.id, steps: 6, split: true });
      }
    }
  }

  return movable;
}

function movePiece(room, playerId, pieceId, steps, exitJail = false) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return { success: false, message: 'Player not found' };

  const piece = player.pieces.find(p => p.id === pieceId);
  if (!piece) return { success: false, message: 'Piece not found' };

  const events = [];

  if (exitJail) {
    // Exit from jail
    const dice = room.diceValues;
    const hasDouble = isDouble(dice);

    piece.inJail = false;
    piece.position = START_POSITIONS[player.color];

    // Check if first to exit - get bonus piece
    const othersOut = room.players.some(p =>
      p.id !== playerId && p.pieces.some(pc => !pc.inJail && !pc.finished)
    );

    if (!othersOut) {
      // First to exit bonus - bring extra piece if any still in jail
      const jailedPieces = player.pieces.filter(p => p.inJail && p.id !== pieceId);
      if (jailedPieces.length > 0) {
        jailedPieces[0].inJail = false;
        jailedPieces[0].position = START_POSITIONS[player.color];
        events.push({ type: 'bonus_exit', message: `${player.name} saiu primeiro e ganhou bônus de saída!` });
      }
    }

    // Double exit - bring two pieces
    if (hasDouble) {
      const jailed = player.pieces.filter(p => p.inJail && p.id !== pieceId);
      if (jailed.length > 0) {
        jailed[0].inJail = false;
        jailed[0].position = START_POSITIONS[player.color];
        piece.groupedWith = jailed[0].id;
        jailed[0].groupedWith = piece.id;
        events.push({ type: 'double_exit', message: `${player.name} saiu com duas pedras (pitoco)!` });
      }
    }

    events.push({ type: 'exit_jail', message: `${player.name} saiu do paiol!` });
    return { success: true, events };
  }

  if (piece.inJail) return { success: false, message: 'Piece is in jail' };

  // Move piece
  if (piece.homeStretch) {
    piece.homeStretchPos += steps;
    if (piece.homeStretchPos >= HOME_STRETCH) {
      piece.homeStretchPos = HOME_STRETCH;
      piece.finished = true;
      events.push({ type: 'finished', message: `${player.name} chegou com uma pedra!` });

      // Check if all pieces finished
      if (player.pieces.every(p => p.finished)) {
        player.finished = true;
        events.push({ type: 'player_finished', playerId, message: `${player.name} completou o jogo!` });
      }
    }
  } else {
    const startPos = START_POSITIONS[player.color];
    const currentRelative = ((piece.position - startPos) + BOARD_SIZE) % BOARD_SIZE;
    const newRelative = currentRelative + steps;

    if (newRelative >= BOARD_SIZE) {
      // Enter home stretch
      const overshoot = newRelative - BOARD_SIZE;
      piece.homeStretch = true;
      piece.homeStretchPos = overshoot;
      piece.position = -2; // not on main board
    } else {
      const newAbsPos = normalizePosition(startPos + newRelative);
      piece.position = newAbsPos;

      // Check skull square
      if (SKULL_SQUARES.includes(newAbsPos)) {
        piece.inJail = true;
        piece.position = -1;
        piece.homeStretch = false;
        piece.groupedWith = null;
        player.bleeding = true;
        events.push({ type: 'skull', message: `${player.name} caiu na caveira e voltou pro paiol! Ficará uma rodada sangrando.` });
        return { success: true, events };
      }

      // Check kills
      if (!SAFE_SQUARES.includes(newAbsPos)) {
        for (const otherPlayer of room.players) {
          if (otherPlayer.id === playerId) continue;

          // Check alliance
          const allied = player.alliances.includes(otherPlayer.id) &&
            otherPlayer.alliances.includes(playerId);

          for (const otherPiece of otherPlayer.pieces) {
            if (!otherPiece.inJail && !otherPiece.finished &&
              !otherPiece.homeStretch && otherPiece.position === newAbsPos) {

              if (allied) {
                // Can't kill ally - block move
                piece.position = normalizePosition(newAbsPos - 1);
                events.push({ type: 'blocked_by_ally', message: `${player.name} não pode matar o aliado ${otherPlayer.name}!` });
              } else {
                // Kill the piece
                otherPiece.inJail = true;
                otherPiece.position = -1;
                otherPiece.groupedWith = null;
                otherPlayer.bleeding = true;
                events.push({ type: 'kill', killerId: playerId, victimId: otherPlayer.id, message: `${player.name} matou uma pedra de ${otherPlayer.name}!` });
              }
            }
          }
        }
      }

      // Pitoco - group with same player's piece on same square
      for (const ownPiece of player.pieces) {
        if (ownPiece.id !== piece.id && !ownPiece.inJail &&
          !ownPiece.finished && !ownPiece.homeStretch &&
          ownPiece.position === newAbsPos && ownPiece.groupedWith === null) {
          piece.groupedWith = ownPiece.id;
          ownPiece.groupedWith = piece.id;
          events.push({ type: 'pitoco', message: `${player.name} fez pitoco!` });
        }
      }
    }
  }

  return { success: true, events };
}

function getNextPlayerIndex(room) {
  let next = (room.currentPlayerIndex + 1) % room.players.length;
  let attempts = 0;
  while (attempts < room.players.length) {
    const p = room.players[next];
    if (!p.finished) {
      if (p.bleeding) {
        p.bleeding = false; // skip this turn
        next = (next + 1) % room.players.length;
      } else {
        return next;
      }
    } else {
      next = (next + 1) % room.players.length;
    }
    attempts++;
  }
  return next;
}

function checkGameOver(room) {
  const activePlayers = room.players.filter(p => !p.finished);
  if (activePlayers.length <= 1) {
    room.gameOver = true;
    // The last one standing (or first finished) wins
    const finished = room.players.filter(p => p.finished);
    if (finished.length > 0) {
      room.winner = finished[0].id;
    } else {
      room.winner = activePlayers[0]?.id;
    }
    return true;
  }
  return false;
}

module.exports = {
  createRoom,
  createPlayer,
  rollDice,
  isDouble,
  isEighteen,
  canExitJail,
  getMovablePieces,
  movePiece,
  getNextPlayerIndex,
  checkGameOver,
  PLAYER_COLORS,
  START_POSITIONS,
  SKULL_SQUARES,
  SAFE_SQUARES,
  BOARD_SIZE,
  HOME_STRETCH
};
