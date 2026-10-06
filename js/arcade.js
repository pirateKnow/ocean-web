(function () {
  const canvas = document.getElementById('game-canvas');
  const context = canvas && canvas.getContext('2d');
  const status = document.getElementById('game-status');
  const scoreOutput = document.getElementById('game-score');
  const livesOutput = document.getElementById('game-lives');
  const bestOutput = document.getElementById('game-best');
  const scoreLabel = document.getElementById('game-score-label');
  const livesLabel = document.getElementById('game-lives-label');
  const pauseButton = document.getElementById('game-pause');
  const title = document.getElementById('arcade-title');
  const mobileHint = document.getElementById('game-mobile-hint');
  const menuButtons = Array.from(document.querySelectorAll('[data-game]'));
  const controlButtons = Array.from(document.querySelectorAll('[data-game-action]'));

  if (!canvas || !context || !status || !scoreOutput || !livesOutput || !bestOutput || !pauseButton || !title) return;

  const width = canvas.width;
  const height = canvas.height;
  const frameInterval = 1000 / 60;
  const stars = Array.from({ length: 125 }, function (_, index) {
    return { x: (index * 137.5) % width, y: (index * 71.3) % height, alpha: 0.12 + (index % 5) * 0.055 };
  });
  const games = {
    starfall: { title: 'starfall', description: 'asteroid survival', controls: 'drag to steer and hold to fire.' },
    aim: { title: 'aim lab', description: 'precision practice', controls: 'click the targets before time runs out.' },
    tetris: { title: 'blockfall', description: 'stack the signal', controls: 'arrows move · up rotates · space drops.' },
    snake: { title: 'snake', description: 'collect & survive', controls: 'use arrows or wasd to steer.' },
    pong: { title: 'blackout pong', description: 'beat the machine', controls: 'move the pointer or use left/right.' }
  };
  const pieceShapes = [
    [[1, 1, 1, 1]],
    [[1, 1], [1, 1]],
    [[0, 1, 0], [1, 1, 1]],
    [[1, 0, 0], [1, 1, 1]],
    [[0, 0, 1], [1, 1, 1]],
    [[0, 1, 1], [1, 1, 0]],
    [[1, 1, 0], [0, 1, 1]]
  ];
  const colors = ['#d8d8d8', '#9c9c9c', '#bcbcbc', '#858585', '#c8c8c8', '#a6a6a6', '#737373'];
  let selectedGame = 'starfall';
  let miniGame = null;
  let animationFrame = 0;
  let pointerStart = null;
  let storageWarning = '';

  function setTitle(value) {
    const accent = title.querySelector('span');
    if (!accent) {
      title.textContent = value;
      return;
    }
    const split = Math.max(1, Math.ceil(value.length / 2));
    title.firstChild.nodeValue = value.slice(0, split);
    accent.textContent = value.slice(split);
  }

  function updatePauseButton() {
    const active = selectedGame !== 'starfall' && miniGame && (miniGame.state === 'running' || miniGame.state === 'paused');
    pauseButton.disabled = !active;
    pauseButton.textContent = miniGame && miniGame.state === 'paused' ? 'resume' : 'pause';
    pauseButton.setAttribute('aria-label', miniGame && miniGame.state === 'paused' ? 'resume game' : 'pause game');
  }

  function updateHud() {
    if (!miniGame) return;
    scoreOutput.textContent = String(miniGame.score);
    const lives = selectedGame === 'snake'
      ? miniGame.snake.length
      : selectedGame === 'tetris'
        ? miniGame.lines
        : selectedGame === 'aim'
          ? Math.ceil(miniGame.lives)
          : miniGame.lives;
    livesOutput.textContent = String(lives);
    bestOutput.textContent = String(miniGame.best);
  }

  function readBest(game) {
    try {
      return Number(localStorage.getItem('ocean-arcade-' + game + '-best')) || 0;
    } catch (error) {
      console.error('could not read the ' + game + ' high score:', error);
      storageWarning = 'local high score is unavailable in this browser.';
      return 0;
    }
  }

  function updateBest() {
    if (!miniGame || miniGame.score <= miniGame.best) return;
    miniGame.best = miniGame.score;
    try {
      localStorage.setItem('ocean-arcade-' + selectedGame + '-best', String(miniGame.best));
    } catch (error) {
      console.error('could not save the ' + selectedGame + ' high score:', error);
      storageWarning = 'your score is safe for this run, but could not be saved.';
      status.textContent = storageWarning;
    }
  }

  function makeGameState(game) {
    const best = readBest(game);
    const state = { state: 'ready', score: 0, lives: 3, best: best, lastFrame: 0, elapsed: 0, accumulator: 0 };
    if (game === 'aim') {
      state.lives = 30;
      state.target = { x: width / 2, y: height / 2, radius: 34 };
      state.misses = 0;
    } else if (game === 'tetris') {
      state.board = Array.from({ length: 20 }, function () { return Array(10).fill(0); });
      state.piece = null;
      state.nextPiece = Math.floor(Math.random() * pieceShapes.length);
      state.dropTimer = 0;
      state.lines = 0;
      state.lives = 0;
      spawnPiece(state);
    } else if (game === 'snake') {
      state.direction = { x: 1, y: 0 };
      state.nextDirection = { x: 1, y: 0 };
      state.snake = [{ x: 11, y: 9 }, { x: 10, y: 9 }, { x: 9, y: 9 }];
      state.food = { x: 17, y: 9 };
      state.lives = 1;
    } else if (game === 'pong') {
      state.playerX = width / 2;
      state.cpuX = width / 2;
      state.ball = { x: width / 2, y: height / 2, vx: 300, vy: 290 };
      state.lives = 5;
    }
    return state;
  }

  function selectGame(game) {
    if (!games[game]) return;
    selectedGame = game;
    menuButtons.forEach(function (button) {
      button.setAttribute('aria-pressed', button.dataset.game === game ? 'true' : 'false');
    });
    setTitle(games[game].title);
    document.body.dataset.pageTitle = game === 'starfall' ? 'arcade' : game;
    document.body.dataset.activeGame = game;
    document.body.classList.toggle('mini-game-active', game !== 'starfall');
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    pointerStart = null;

    if (game === 'starfall') {
      miniGame = null;
      scoreLabel.textContent = 'score';
      livesLabel.textContent = 'lives';
      mobileHint.textContent = 'tap start · drag to steer · hold fire · pause above';
      status.textContent = 'click the game to start.';
      window.dispatchEvent(new CustomEvent('arcade:select', { detail: { game: game } }));
      updatePauseButton();
      return;
    }

    window.dispatchEvent(new CustomEvent('arcade:select', { detail: { game: game } }));
    miniGame = makeGameState(game);
    scoreLabel.textContent = game === 'aim' ? 'hits' : game === 'tetris' ? 'score' : 'score';
    livesLabel.textContent = game === 'aim' ? 'time' : game === 'tetris' ? 'lines' : game === 'pong' ? 'lives' : 'length';
    mobileHint.textContent = game === 'aim'
      ? 'tap the targets · score as many hits as you can'
      : game === 'tetris'
        ? 'use arrows or buttons · rotate and drop blocks'
        : game === 'snake'
          ? 'swipe to steer · use arrows or direction buttons'
          : 'move the paddle · return the ball to the machine';
    status.textContent = games[game].description + '. click or tap the field to start.' + (storageWarning ? ' ' + storageWarning : '');
    if (game === 'snake') livesOutput.textContent = '—';
    draw();
    updateHud();
    updatePauseButton();
  }

  function setScore(value) {
    if (!miniGame) return;
    miniGame.score = value;
    updateBest();
    updateHud();
  }

  function finishGame(message) {
    if (!miniGame) return;
    miniGame.state = 'over';
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    status.textContent = message || 'run over. final score: ' + miniGame.score + '.';
    updateHud();
    updatePauseButton();
    draw();
  }

  function startGame() {
    if (!miniGame || miniGame.state === 'running') return;
    if (miniGame.state === 'over') miniGame = makeGameState(selectedGame);
    miniGame.state = 'running';
    miniGame.lastFrame = performance.now();
    status.textContent = games[selectedGame].description + '. ' + games[selectedGame].controls + ' press escape to pause.';
    updatePauseButton();
    draw();
    animationFrame = requestAnimationFrame(loop);
  }

  function togglePause() {
    if (selectedGame === 'starfall' || !miniGame) return;
    if (miniGame.state === 'running') {
      miniGame.state = 'paused';
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      status.textContent = 'game paused.';
      updatePauseButton();
      draw();
    } else if (miniGame.state === 'paused') {
      miniGame.state = 'running';
      miniGame.lastFrame = performance.now();
      status.textContent = games[selectedGame].description + '. ' + games[selectedGame].controls + ' press escape to pause.';
      updatePauseButton();
      animationFrame = requestAnimationFrame(loop);
    }
  }

  function drawBackground() {
    context.fillStyle = '#050607';
    context.fillRect(0, 0, width, height);
    stars.forEach(function (star) {
      context.fillStyle = 'rgba(220, 220, 220, ' + star.alpha + ')';
      context.fillRect(star.x, star.y, 2, 2);
    });
    context.strokeStyle = 'rgba(210, 210, 210, 0.035)';
    context.lineWidth = 1;
    for (let x = 0; x < width; x += 80) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
  }

  function drawText(text, x, y, size, color) {
    context.fillStyle = color || '#d7d7d7';
    context.font = '500 ' + size + 'px "JetBrains Mono", monospace';
    context.textAlign = 'center';
    context.fillText(text, x, y);
  }

  function drawOverlay() {
    if (!miniGame || miniGame.state === 'running') return;
    context.fillStyle = 'rgba(4, 5, 7, 0.76)';
    context.fillRect(0, 0, width, height);
    const heading = miniGame.state === 'ready' ? games[selectedGame].title : miniGame.state === 'paused' ? 'paused' : 'signal lost';
    drawText(heading, width / 2, height / 2 - 10, 28, '#e6e6e6');
    const hint = miniGame.state === 'ready' ? 'click or tap to start' : miniGame.state === 'paused' ? 'press esc or resume' : 'click or tap to play again';
    drawText(hint, width / 2, height / 2 + 28, 15, '#a4a4a4');
  }

  function drawAim() {
    const target = miniGame.target;
    context.beginPath();
    context.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
    context.strokeStyle = '#dedede';
    context.lineWidth = 3;
    context.stroke();
    context.beginPath();
    context.arc(target.x, target.y, target.radius * 0.62, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(220, 220, 220, 0.58)';
    context.lineWidth = 2;
    context.stroke();
    context.beginPath();
    context.arc(target.x, target.y, 3, 0, Math.PI * 2);
    context.fillStyle = '#ededed';
    context.fill();
    context.strokeStyle = 'rgba(230, 230, 230, 0.35)';
    context.beginPath();
    context.moveTo(target.x - target.radius - 12, target.y);
    context.lineTo(target.x + target.radius + 12, target.y);
    context.moveTo(target.x, target.y - target.radius - 12);
    context.lineTo(target.x, target.y + target.radius + 12);
    context.stroke();
    drawText(miniGame.state === 'running' ? String(Math.ceil(miniGame.lives)) + ' SEC' : '30 SEC', width / 2, 54, 17, '#bdbdbd');
  }

  function drawTetris() {
    const cell = 27;
    const boardWidth = cell * 10;
    const boardHeight = cell * 20;
    const left = 350;
    const top = (height - boardHeight) / 2;
    context.strokeStyle = 'rgba(220, 220, 220, 0.055)';
    context.lineWidth = 1;
    miniGame.board.forEach(function (row, y) {
      row.forEach(function (value, x) {
        const px = left + x * cell;
        const py = top + y * cell;
        context.strokeRect(px, py, cell, cell);
        if (value) drawBlock(px, py, cell, colors[value - 1]);
      });
    });
    if (miniGame.piece) {
      miniGame.piece.shape.forEach(function (row, y) {
        row.forEach(function (value, x) {
          if (value) drawBlock(left + (miniGame.piece.x + x) * cell, top + (miniGame.piece.y + y) * cell, cell, colors[miniGame.piece.color]);
        });
      });
    }
    context.strokeStyle = 'rgba(230, 230, 230, 0.28)';
    context.strokeRect(left, top, boardWidth, boardHeight);
    drawText('NEXT', left + boardWidth + 120, top + 45, 15, '#a4a4a4');
    drawPreview(miniGame.nextPiece, left + boardWidth + 70, top + 68, 24);
    drawText('LINES ' + miniGame.lines, left + boardWidth + 118, top + 220, 15, '#bdbdbd');
  }

  function drawBlock(x, y, size, color) {
    context.fillStyle = color;
    context.fillRect(x + 2, y + 2, size - 4, size - 4);
    context.strokeStyle = 'rgba(255, 255, 255, 0.24)';
    context.strokeRect(x + 2, y + 2, size - 4, size - 4);
  }

  function drawPreview(shapeIndex, x, y, cell) {
    pieceShapes[shapeIndex].forEach(function (row, rowIndex) {
      row.forEach(function (value, columnIndex) {
        if (value) drawBlock(x + columnIndex * cell, y + rowIndex * cell, cell, colors[shapeIndex]);
      });
    });
  }

  function drawSnake() {
    const cell = 24;
    const columns = 25;
    const rows = 18;
    const left = (width - columns * cell) / 2;
    const top = (height - rows * cell) / 2;
    context.strokeStyle = 'rgba(220, 220, 220, 0.05)';
    for (let x = 0; x <= columns; x++) {
      context.beginPath();
      context.moveTo(left + x * cell, top);
      context.lineTo(left + x * cell, top + rows * cell);
      context.stroke();
    }
    for (let y = 0; y <= rows; y++) {
      context.beginPath();
      context.moveTo(left, top + y * cell);
      context.lineTo(left + columns * cell, top + y * cell);
      context.stroke();
    }
    miniGame.snake.forEach(function (segment, index) {
      drawBlock(left + segment.x * cell, top + segment.y * cell, cell, index === 0 ? '#e1e1e1' : '#929292');
    });
    context.fillStyle = '#ededed';
    context.fillRect(left + miniGame.food.x * cell + 6, top + miniGame.food.y * cell + 6, cell - 12, cell - 12);
  }

  function drawPong() {
    const left = 210;
    const right = 990;
    const paddleWidth = 145;
    context.setLineDash([12, 16]);
    context.strokeStyle = 'rgba(220, 220, 220, 0.32)';
    context.beginPath();
    context.moveTo(left, height / 2);
    context.lineTo(right, height / 2);
    context.stroke();
    context.setLineDash([]);
    context.strokeStyle = 'rgba(220, 220, 220, 0.25)';
    context.strokeRect(left, 44, right - left, height - 88);
    context.fillStyle = '#cfcfcf';
    context.fillRect(miniGame.cpuX - paddleWidth / 2, 75, paddleWidth, 14);
    context.fillRect(miniGame.playerX - paddleWidth / 2, height - 89, paddleWidth, 14);
    context.fillRect(miniGame.ball.x - 8, miniGame.ball.y - 8, 16, 16);
    drawText(String(miniGame.score), width / 2, height / 2 - 22, 24, '#bdbdbd');
  }

  function draw() {
    if (selectedGame === 'starfall' || !miniGame) return;
    drawBackground();
    if (selectedGame === 'aim') drawAim();
    else if (selectedGame === 'tetris') drawTetris();
    else if (selectedGame === 'snake') drawSnake();
    else if (selectedGame === 'pong') drawPong();
    drawOverlay();
  }

  function loop(now) {
    if (!miniGame || miniGame.state !== 'running') return;
    const elapsed = Math.min((now - miniGame.lastFrame) / 1000, 0.05);
    if (now - miniGame.lastFrame < frameInterval - 1) {
      animationFrame = requestAnimationFrame(loop);
      return;
    }
    miniGame.lastFrame = now;
    updateGame(elapsed);
    if (miniGame && miniGame.state === 'running') {
      draw();
      updateHud();
      animationFrame = requestAnimationFrame(loop);
    }
  }

  function updateGame(delta) {
    if (selectedGame === 'aim') {
      miniGame.lives = Math.max(0, miniGame.lives - delta);
      if (miniGame.lives <= 0) finishGame('time. final score: ' + miniGame.score + ' hits.');
    } else if (selectedGame === 'tetris') {
      miniGame.dropTimer += delta;
      const speed = Math.max(0.12, 0.72 - miniGame.lines * 0.018);
      if (miniGame.dropTimer >= speed) {
        miniGame.dropTimer = 0;
        if (!movePiece(0, 1)) lockPiece();
      }
    } else if (selectedGame === 'snake') {
      miniGame.accumulator += delta;
      if (miniGame.accumulator >= 0.115) {
        miniGame.accumulator = 0;
        moveSnake();
      }
    } else if (selectedGame === 'pong') {
      movePong(delta);
    }
  }

  function randomTarget() {
    miniGame.target.x = 65 + Math.random() * (width - 130);
    miniGame.target.y = 80 + Math.random() * (height - 160);
  }

  function randomFood() {
    let position;
    do {
      position = { x: Math.floor(Math.random() * 25), y: Math.floor(Math.random() * 18) };
    } while (miniGame.snake.some(function (segment) { return segment.x === position.x && segment.y === position.y; }));
    miniGame.food = position;
  }

  function moveSnake() {
    miniGame.direction = miniGame.nextDirection;
    const head = miniGame.snake[0];
    const next = { x: head.x + miniGame.direction.x, y: head.y + miniGame.direction.y };
    const eats = next.x === miniGame.food.x && next.y === miniGame.food.y;
    if (next.x < 0 || next.x >= 25 || next.y < 0 || next.y >= 18 || miniGame.snake.some(function (segment, index) {
      return (eats || index < miniGame.snake.length - 1) && segment.x === next.x && segment.y === next.y;
    })) {
      finishGame('signal lost. final score: ' + miniGame.score + '.');
      return;
    }
    miniGame.snake.unshift(next);
    if (eats) {
      setScore(miniGame.score + 10);
      randomFood();
    } else {
      miniGame.snake.pop();
    }
  }

  function movePong(delta) {
    const ball = miniGame.ball;
    const left = 210;
    const right = 990;
    const paddleWidth = 145;
    miniGame.cpuX += (ball.x - miniGame.cpuX) * Math.min(1, delta * 1.7);
    miniGame.cpuX = Math.max(left + paddleWidth / 2, Math.min(right - paddleWidth / 2, miniGame.cpuX));
    ball.x += ball.vx * delta;
    ball.y += ball.vy * delta;
    if (ball.x < left + 8 || ball.x > right - 8) ball.vx *= -1;
    if (ball.y < 89 && ball.x > miniGame.cpuX - paddleWidth / 2 && ball.x < miniGame.cpuX + paddleWidth / 2 && ball.vy < 0) {
      ball.vy = Math.abs(ball.vy);
      ball.vx += (ball.x - miniGame.cpuX) * 1.2;
    }
    if (ball.y > height - 89 && ball.x > miniGame.playerX - paddleWidth / 2 && ball.x < miniGame.playerX + paddleWidth / 2 && ball.vy > 0) {
      ball.vy = -Math.abs(ball.vy);
      ball.vx += (ball.x - miniGame.playerX) * 1.2;
      setScore(miniGame.score + 10);
    }
    if (ball.y < 30) ball.vy = Math.abs(ball.vy);
    if (ball.y > height + 20) {
      miniGame.lives -= 1;
      if (miniGame.lives <= 0) finishGame('match over. final score: ' + miniGame.score + '.');
      else resetBall(-1);
    }
  }

  function resetBall(direction) {
    miniGame.ball = { x: width / 2, y: height / 2, vx: (Math.random() > 0.5 ? 1 : -1) * 260, vy: direction * 290 };
  }

  function spawnPiece(state) {
    const index = state.nextPiece;
    state.piece = { shape: pieceShapes[index].map(function (row) { return row.slice(); }), color: index, x: 3, y: 0 };
    state.nextPiece = Math.floor(Math.random() * pieceShapes.length);
    if (collides(state.piece, 0, 0, state.piece.shape, state.board)) finishGame('stack reached the top. final score: ' + state.score + '.');
  }

  function collides(piece, dx, dy, shape, board) {
    const currentBoard = board || (miniGame && miniGame.board);
    return shape.some(function (row, y) {
      return row.some(function (value, x) {
        if (!value) return false;
        const boardX = piece.x + x + dx;
        const boardY = piece.y + y + dy;
        return boardX < 0 || boardX >= 10 || boardY >= 20 || (boardY >= 0 && currentBoard && currentBoard[boardY][boardX]);
      });
    });
  }

  function movePiece(dx, dy) {
    if (!miniGame.piece || collides(miniGame.piece, dx, dy, miniGame.piece.shape)) return false;
    miniGame.piece.x += dx;
    miniGame.piece.y += dy;
    return true;
  }

  function rotatePiece() {
    if (!miniGame.piece) return;
    const shape = miniGame.piece.shape;
    const rotated = shape[0].map(function (_, index) {
      return shape.map(function (row) { return row[index]; }).reverse();
    });
    if (!collides(miniGame.piece, 0, 0, rotated)) miniGame.piece.shape = rotated;
  }

  function lockPiece() {
    const piece = miniGame.piece;
    piece.shape.forEach(function (row, y) {
      row.forEach(function (value, x) {
        if (value && piece.y + y >= 0) miniGame.board[piece.y + y][piece.x + x] = piece.color + 1;
      });
    });
    let cleared = 0;
    miniGame.board = miniGame.board.filter(function (row) {
      if (row.every(Boolean)) {
        cleared += 1;
        return false;
      }
      return true;
    });
    while (miniGame.board.length < 20) miniGame.board.unshift(Array(10).fill(0));
    if (cleared) {
      miniGame.lines += cleared;
      miniGame.lives = miniGame.lines;
      setScore(miniGame.score + [0, 100, 300, 500, 800][cleared]);
      updateHud();
    }
    spawnPiece(miniGame);
  }

  function hardDrop() {
    while (movePiece(0, 1)) {}
    lockPiece();
  }

  function action(key) {
    if (selectedGame === 'tetris') {
      if (key === 'left') movePiece(-1, 0);
      else if (key === 'right') movePiece(1, 0);
      else if (key === 'down') {
        if (!movePiece(0, 1)) lockPiece();
        else setScore(miniGame.score + 1);
      } else if (key === 'rotate') rotatePiece();
      else if (key === 'drop') hardDrop();
    } else if (selectedGame === 'snake') {
      const directions = {
        left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 }
      };
      const direction = directions[key];
      if (direction && (direction.x !== -miniGame.direction.x || direction.y !== -miniGame.direction.y)) miniGame.nextDirection = direction;
    } else if (selectedGame === 'pong') {
      if (key === 'left') miniGame.playerX -= 70;
      else if (key === 'right') miniGame.playerX += 70;
      miniGame.playerX = Math.max(285, Math.min(915, miniGame.playerX));
    }
    draw();
  }

  function pointerPosition(event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * width / bounds.width,
      y: (event.clientY - bounds.top) * height / bounds.height
    };
  }

  canvas.addEventListener('pointermove', function (event) {
    if (event.pointerType === 'touch' && !document.body.classList.contains('touch-device')) document.body.classList.add('touch-device');
    if (selectedGame === 'pong' && miniGame) miniGame.playerX = Math.max(285, Math.min(915, pointerPosition(event).x));
  });

  canvas.addEventListener('pointerdown', function (event) {
    if (selectedGame === 'starfall') return;
    event.preventDefault();
    if (event.pointerType === 'touch') document.body.classList.add('touch-device');
    canvas.focus({ preventScroll: true });
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    const point = pointerPosition(event);
    pointerStart = point;
    if (miniGame.state !== 'running') {
      startGame();
      return;
    }
    if (selectedGame === 'aim') {
      const target = miniGame.target;
      if (Math.hypot(point.x - target.x, point.y - target.y) <= target.radius) {
        setScore(miniGame.score + 1);
        randomTarget();
      }
    } else if (selectedGame === 'pong') {
      miniGame.playerX = Math.max(285, Math.min(915, point.x));
    }
    draw();
  });

  canvas.addEventListener('pointerup', function (event) {
    if (selectedGame !== 'snake' || !pointerStart || miniGame.state !== 'running') return;
    const point = pointerPosition(event);
    const dx = point.x - pointerStart.x;
    const dy = point.y - pointerStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) action(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    pointerStart = null;
  });

  canvas.addEventListener('pointercancel', function () {
    pointerStart = null;
  });

  window.addEventListener('keydown', function (event) {
    if (selectedGame === 'starfall') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!event.repeat) togglePause();
      return;
    }
    if (!miniGame || miniGame.state !== 'running') {
      if ((event.key === 'Enter' || event.key === ' ') && miniGame && miniGame.state !== 'paused') startGame();
      return;
    }
    const keys = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'rotate',
      a: 'left', d: 'right', s: 'down', w: 'rotate', ' ': 'drop'
    };
    if (keys[event.key]) {
      event.preventDefault();
      action(keys[event.key]);
    }
  });

  pauseButton.addEventListener('click', function () {
    if (selectedGame !== 'starfall') togglePause();
  });

  controlButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      if (selectedGame === 'starfall' || !miniGame) return;
      if (miniGame.state !== 'running') startGame();
      if (miniGame.state === 'running') action(button.dataset.gameAction);
    });
  });

  menuButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      selectGame(button.dataset.game);
    });
  });

  window.addEventListener('blur', function () {
    if (miniGame && miniGame.state === 'running') togglePause();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && miniGame && miniGame.state === 'running') togglePause();
  });

  pauseButton.disabled = true;
  setTitle(games.starfall.title);
})();
