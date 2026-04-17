// Board rendering using Canvas
// Ludo-style board with Invincible theme

const BOARD_COLORS = {
  yellow: '#FFE135',
  red: '#E8001C',
  blue: '#4A9FFF',
  green: '#00CC66'
};

const DARK = '#0A0A0A';
const DARK2 = '#1A1A1A';
const DARK3 = '#222222';
const WHITE = '#F5F5F0';

// Board layout: 15x15 grid
// Standard Ludo layout
function drawBoard(canvas, gameState, myPlayerId, selectablePieceIds, onPieceClick) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const CELL = W / 15;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = DARK2;
  ctx.fillRect(0, 0, W, H);

  // Draw the 4 home zones (corners)
  const homeZones = [
    { x: 0, y: 0, color: 'yellow' },       // top-left
    { x: 9, y: 0, color: 'blue' },          // top-right
    { x: 0, y: 9, color: 'green' },         // bottom-left
    { x: 9, y: 9, color: 'red' }            // bottom-right
  ];

  for (const hz of homeZones) {
    const px = hz.x * CELL;
    const py = hz.y * CELL;
    const size = 6 * CELL;

    // Background
    ctx.fillStyle = hexToRgba(BOARD_COLORS[hz.color], 0.08);
    ctx.fillRect(px, py, size, size);

    // Border
    ctx.strokeStyle = hexToRgba(BOARD_COLORS[hz.color], 0.3);
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);

    // Inner jail zone (3x3 inside the 6x6)
    const jailPad = CELL * 1.5;
    ctx.fillStyle = hexToRgba(BOARD_COLORS[hz.color], 0.15);
    ctx.fillRect(px + jailPad, py + jailPad, size - jailPad * 2, size - jailPad * 2);

    // Color label
    ctx.fillStyle = hexToRgba(BOARD_COLORS[hz.color], 0.6);
    ctx.font = `bold ${CELL * 0.6}px Bebas Neue, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(hz.color.toUpperCase()[0], px + size / 2, py + size / 2);
  }

  // Draw path squares
  drawPath(ctx, CELL, gameState, selectablePieceIds);

  // Draw center (finish)
  drawCenter(ctx, CELL, W, H);

  // Draw pieces
  if (gameState) {
    drawPieces(ctx, CELL, gameState, myPlayerId, selectablePieceIds);
  }

  // Set up click handler
  if (onPieceClick) {
    canvas.onclick = (e) => handleCanvasClick(e, canvas, CELL, gameState, myPlayerId, selectablePieceIds, onPieceClick);
    canvas.ontouchend = (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      handleCanvasClick(touch, canvas, CELL, gameState, myPlayerId, selectablePieceIds, onPieceClick);
    };
  }
}

function drawPath(ctx, CELL, gameState, selectablePieceIds) {
  // Path squares: the track around the board
  const pathSquares = getPathSquares(CELL);

  const SKULL_SQUARES = [8, 21, 34, 47];
  const SAFE_SQUARES = [0, 13, 26, 39];
  const START_POSITIONS = { yellow: 0, red: 13, blue: 26, green: 39 };

  pathSquares.forEach((sq, idx) => {
    const isSkull = SKULL_SQUARES.includes(idx);
    const isSafe = SAFE_SQUARES.includes(idx);

    // Determine if it's a start square for a color
    let startColor = null;
    for (const [color, pos] of Object.entries(START_POSITIONS)) {
      if (pos === idx) { startColor = color; break; }
    }

    // Fill
    if (isSkull) {
      ctx.fillStyle = 'rgba(150,0,200,0.3)';
    } else if (startColor) {
      ctx.fillStyle = hexToRgba(BOARD_COLORS[startColor], 0.3);
    } else if (isSafe) {
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
    } else {
      ctx.fillStyle = DARK3;
    }
    roundRect(ctx, sq.x + 1, sq.y + 1, CELL - 2, CELL - 2, 2);
    ctx.fill();

    // Border
    ctx.strokeStyle = isSkull ? 'rgba(150,0,200,0.6)' : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    roundRect(ctx, sq.x + 1, sq.y + 1, CELL - 2, CELL - 2, 2);
    ctx.stroke();

    // Skull icon
    if (isSkull) {
      ctx.fillStyle = 'rgba(200,100,255,0.8)';
      ctx.font = `${CELL * 0.55}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💀', sq.x + CELL / 2, sq.y + CELL / 2);
    }

    // Star for safe
    if (isSafe && !startColor) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = `${CELL * 0.5}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', sq.x + CELL / 2, sq.y + CELL / 2);
    }
  });

  // Draw home stretches
  drawHomeStretches(ctx, CELL);
}

function drawHomeStretches(ctx, CELL) {
  // Yellow: row 7, cols 1-5 (left to right toward center)
  const stretches = [
    { color: 'yellow', squares: [[1,7],[2,7],[3,7],[4,7],[5,7]] },
    { color: 'blue',   squares: [[13,7],[12,7],[11,7],[10,7],[9,7]] },
    { color: 'green',  squares: [[7,13],[7,12],[7,11],[7,10],[7,9]] },
    { color: 'red',    squares: [[7,1],[7,2],[7,3],[7,4],[7,5]] }
  ];

  for (const s of stretches) {
    s.squares.forEach((pos, i) => {
      const x = pos[0] * CELL;
      const y = pos[1] * CELL;
      const alpha = 0.2 + (i / s.squares.length) * 0.4;
      ctx.fillStyle = hexToRgba(BOARD_COLORS[s.color], alpha);
      roundRect(ctx, x + 1, y + 1, CELL - 2, CELL - 2, 2);
      ctx.fill();
    });
  }
}

function drawCenter(ctx, CELL, W, H) {
  const cx = 6 * CELL;
  const cy = 6 * CELL;
  const size = 3 * CELL;

  // Center diamond/star - the finish
  ctx.fillStyle = DARK3;
  ctx.fillRect(cx, cy, size, size);

  // Draw Invincible-style star
  const x = cx + size / 2;
  const y = cy + size / 2;
  const r = size * 0.4;

  // Gradient fill for center
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, '#FFE135');
  grad.addColorStop(0.5, '#1A3FC4');
  grad.addColorStop(1, '#E8001C');
  ctx.fillStyle = grad;

  drawStar(ctx, x, y, 5, r, r * 0.4);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `bold ${CELL * 0.45}px Bebas Neue, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('WIN', x, y);
}

function drawStar(ctx, cx, cy, spikes, outerR, innerR) {
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerR);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerR);
  ctx.closePath();
}

function drawPieces(ctx, CELL, gameState, myPlayerId, selectablePieceIds) {
  const { players } = gameState;
  const START_POSITIONS = { yellow: 0, red: 13, blue: 26, green: 39 };
  const pathSquares = getPathSquares(CELL);

  // Collect positions to stack
  const posMap = {}; // key -> [{piece, player}]

  for (const player of players) {
    for (const piece of player.pieces) {
      if (piece.finished) continue;

      let key;
      let sq;

      if (piece.inJail) {
        // Draw in jail zone
        drawJailPiece(ctx, CELL, player, piece, players, selectablePieceIds);
        continue;
      }

      if (piece.homeStretch) {
        drawHomeStretchPiece(ctx, CELL, player, piece, selectablePieceIds);
        continue;
      }

      // On main path
      const pos = piece.position;
      key = `path_${pos}`;
      if (!posMap[key]) posMap[key] = [];
      posMap[key].push({ piece, player });
    }
  }

  // Draw stacked pieces on path
  for (const [key, pieces] of Object.entries(posMap)) {
    const idx = parseInt(key.split('_')[1]);
    const sq = pathSquares[idx];
    if (!sq) continue;

    const count = pieces.length;
    pieces.forEach(({ piece, player }, i) => {
      const offset = getStackOffset(i, count, CELL * 0.35);
      const cx = sq.x + CELL / 2 + offset.x;
      const cy = sq.y + CELL / 2 + offset.y;
      const r = CELL * 0.28;
      const isSelectable = selectablePieceIds?.includes(piece.id);
      drawPieceCircle(ctx, cx, cy, r, player.color, piece, isSelectable, player.id === myPlayerId);
    });
  }
}

function drawJailPiece(ctx, CELL, player, piece, allPlayers, selectablePieceIds) {
  const jailPositions = {
    yellow: { bx: 0, by: 0 },
    blue:   { bx: 9, by: 0 },
    green:  { bx: 0, by: 9 },
    red:    { bx: 9, by: 9 }
  };

  const base = jailPositions[player.color];
  if (!base) return;

  const jailedPieces = player.pieces.filter(p => p.inJail);
  const idx = jailedPieces.findIndex(p => p.id === piece.id);
  if (idx < 0) return;

  const jailSlots = [
    { dx: 1.5, dy: 1.5 }, { dx: 3.5, dy: 1.5 },
    { dx: 1.5, dy: 3.5 }, { dx: 3.5, dy: 3.5 }
  ];
  const slot = jailSlots[idx] || jailSlots[0];
  const cx = (base.bx + slot.dx) * CELL;
  const cy = (base.by + slot.dy) * CELL;
  const r = CELL * 0.32;
  const isSelectable = selectablePieceIds?.includes(piece.id);

  drawPieceCircle(ctx, cx, cy, r, player.color, piece, isSelectable, false);
}

function drawHomeStretchPiece(ctx, CELL, player, piece, selectablePieceIds) {
  const stretchSquares = {
    yellow: [[1,7],[2,7],[3,7],[4,7],[5,7]],
    blue:   [[13,7],[12,7],[11,7],[10,7],[9,7]],
    green:  [[7,13],[7,12],[7,11],[7,10],[7,9]],
    red:    [[7,1],[7,2],[7,3],[7,4],[7,5]]
  };

  const squares = stretchSquares[player.color];
  if (!squares) return;
  const pos = Math.min(piece.homeStretchPos, squares.length - 1);
  const sq = squares[pos];
  const cx = sq[0] * CELL + CELL / 2;
  const cy = sq[1] * CELL + CELL / 2;
  const r = CELL * 0.3;
  const isSelectable = selectablePieceIds?.includes(piece.id);
  drawPieceCircle(ctx, cx, cy, r, player.color, piece, isSelectable, false);
}

function drawPieceCircle(ctx, cx, cy, r, color, piece, isSelectable, isOwn) {
  const c = BOARD_COLORS[color] || '#ffffff';

  if (isSelectable) {
    // Glow effect
    ctx.shadowColor = '#FFE135';
    ctx.shadowBlur = 12;
  }

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = c;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = isSelectable ? 2 : 1;
  ctx.stroke();

  // Inner fill
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.65, 0, Math.PI * 2);
  ctx.fillStyle = isSelectable ? '#FFE135' : 'rgba(0,0,0,0.4)';
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // Grouped indicator
  if (piece.groupedWith) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();
  }
}

function getStackOffset(index, total, spacing) {
  if (total === 1) return { x: 0, y: 0 };
  if (total === 2) return index === 0 ? { x: -spacing * 0.5, y: 0 } : { x: spacing * 0.5, y: 0 };
  if (total === 3) {
    const angles = [270, 30, 150];
    const a = (angles[index] * Math.PI) / 180;
    return { x: Math.cos(a) * spacing * 0.5, y: Math.sin(a) * spacing * 0.5 };
  }
  const a = (index * 90 * Math.PI) / 180;
  return { x: Math.cos(a) * spacing * 0.5, y: Math.sin(a) * spacing * 0.5 };
}

function handleCanvasClick(e, canvas, CELL, gameState, myPlayerId, selectablePieceIds, onPieceClick) {
  if (!selectablePieceIds || selectablePieceIds.length === 0) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;

  const { players } = gameState;
  const pathSquares = getPathSquares(CELL);

  const jailPositions = {
    yellow: { bx: 0, by: 0 },
    blue:   { bx: 9, by: 0 },
    green:  { bx: 0, by: 9 },
    red:    { bx: 9, by: 9 }
  };

  const stretchSquares = {
    yellow: [[1,7],[2,7],[3,7],[4,7],[5,7]],
    blue:   [[13,7],[12,7],[11,7],[10,7],[9,7]],
    green:  [[7,13],[7,12],[7,11],[7,10],[7,9]],
    red:    [[7,1],[7,2],[7,3],[7,4],[7,5]]
  };

  for (const player of players) {
    if (player.id !== myPlayerId) continue;

    for (const piece of player.pieces) {
      if (!selectablePieceIds.includes(piece.id)) continue;

      let cx, cy;

      if (piece.inJail) {
        const base = jailPositions[player.color];
        const jailed = player.pieces.filter(p => p.inJail);
        const idx = jailed.findIndex(p => p.id === piece.id);
        const slots = [
          { dx: 1.5, dy: 1.5 }, { dx: 3.5, dy: 1.5 },
          { dx: 1.5, dy: 3.5 }, { dx: 3.5, dy: 3.5 }
        ];
        const slot = slots[idx] || slots[0];
        cx = (base.bx + slot.dx) * CELL;
        cy = (base.by + slot.dy) * CELL;
      } else if (piece.homeStretch) {
        const sq = stretchSquares[player.color]?.[piece.homeStretchPos];
        if (!sq) continue;
        cx = sq[0] * CELL + CELL / 2;
        cy = sq[1] * CELL + CELL / 2;
      } else {
        const sq = pathSquares[piece.position];
        if (!sq) continue;
        cx = sq.x + CELL / 2;
        cy = sq.y + CELL / 2;
      }

      const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);
      if (dist < CELL * 0.6) {
        onPieceClick(piece.id);
        return;
      }
    }
  }
}

// Returns pixel positions for each of the 52 path squares
function getPathSquares(CELL) {
  // Standard Ludo path: 52 squares around the border
  // Starting from yellow start (col 6, row 14) going up then clockwise
  const squares = [];

  // We define the path as an ordered list of [col, row] grid positions
  const path = [
    // Yellow home straight approach (bottom left vertical going up) col 6
    [6,14],[6,13],[6,12],[6,11],[6,10],[6,9],
    // Top left turn (row 8 going right)
    [6,8],[7,8],
    // Left side going up... actually let's do proper Ludo layout
  ];

  // Proper Ludo 52-square path
  // Board is 15x15, path cells are in middle rows/cols
  const properPath = buildLudoPath();
  return properPath.map(([col, row]) => ({ x: col * CELL, y: row * CELL }));
}

function buildLudoPath() {
  // 52 squares following Ludo's standard path
  // Starting at yellow's start position, going clockwise
  const path = [];

  // Bottom middle section (going left to right along row 14 and 13... )
  // Let's define it properly by the actual Ludo layout

  // Yellow starts at index 0 = [6, 14]
  // We go: up the left column of the middle path, across the top, down the right, across the bottom

  // Left side going up: col 6, rows 14 down to 9 (but only the 2 middle columns)
  // The middle track is 3 cells wide in each direction

  // Standard Ludo path (col, row) — 52 squares, 0-indexed
  // Left vertical (going up): col 6, rows 14,13,12,11,10,9
  for (let r = 14; r >= 9; r--) path.push([6, r]);
  // Turn top-left corner, going right along row 8: cols 6,5,4,3,2,1,0 then turn
  // Actually: left side is cols 1-5, top is rows 1-5, right is cols 9-13, bottom is rows 9-13
  // The path goes through the 3-cell wide corridor

  // Let me use a well-known coordinate set for 15x15 Ludo:
  // This is the standard path used in most digital Ludo implementations

  return [
    // Start yellow (bottom-left of middle, going up)
    [6,14],[6,13],[6,12],[6,11],[6,10],[6,9],
    // Across top-left area (row 8, going left)
    [5,8],[4,8],[3,8],[2,8],[1,8],
    // Up left side of top (col 0, going up? no...)
    // Go up: col 0, rows 8,7,6
    [0,8],[0,7],[0,6],
    // Across top (row 6, going right)
    [1,6],[2,6],[3,6],[4,6],[5,6],
    // Up to top middle (col 6, going up)
    [6,5],[6,4],[6,3],[6,2],[6,1],[6,0],
    // Across top right
    [7,0],[8,0],
    // Right col going down
    [8,1],[8,2],[8,3],[8,4],[8,5],
    // Across right middle (row 6 going right)
    [9,6],[10,6],[11,6],[12,6],[13,6],
    // Down right side
    [14,6],[14,7],[14,8],
    // Across bottom right
    [13,8],[12,8],[11,8],[10,8],[9,8],
    // Down right middle
    [8,9],[8,10],[8,11],[8,12],[8,13],[8,14],
    // Across bottom
    [8,14],[7,14]  // This would double... let me fix
  ];
}

// Corrected proper Ludo path
function getPathSquares(CELL) {
  const path = getLudoPath52();
  return path.map(([col, row]) => ({ x: col * CELL, y: row * CELL }));
}

function getLudoPath52() {
  // 52 unique squares for Ludo path on 15x15 board
  // Start = yellow's starting square
  return [
    // Bottom part of left column (going UP), cols 6
    [6,14],[6,13],[6,12],[6,11],[6,10],[6,9],
    // Left row going LEFT (row 8)
    [5,8],[4,8],[3,8],[2,8],[1,8],
    // Left column going UP (col 0)
    [0,8],[0,7],[0,6],
    // Top row going RIGHT (row 6)
    [1,6],[2,6],[3,6],[4,6],[5,6],
    // Middle col going UP (col 6)
    [6,5],[6,4],[6,3],[6,2],[6,1],
    // Top row going RIGHT (row 0)
    [6,0],[7,0],[8,0],
    // Right col going DOWN (col 8)
    [8,1],[8,2],[8,3],[8,4],[8,5],
    // Right-middle row going RIGHT (row 6)
    [9,6],[10,6],[11,6],[12,6],[13,6],
    // Right column going DOWN (col 14)
    [14,6],[14,7],[14,8],
    // Bottom-right going LEFT (row 8)
    [13,8],[12,8],[11,8],[10,8],[9,8],
    // Right-middle col going DOWN (col 8)
    [8,9],[8,10],[8,11],[8,12],[8,13],
    // Bottom row going LEFT (row 14)
    [8,14],[7,14]
  ];
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
