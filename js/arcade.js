(function () {
  const canvas = document.getElementById('game-canvas');
  const context = canvas && canvas.getContext('2d');
  const status = document.getElementById('game-status');
  const scoreOutput = document.getElementById('game-score');
  const livesOutput = document.getElementById('game-lives');
  const bestOutput = document.getElementById('game-best');
  const scoreLabel = document.getElementById('game-score-label');
  const livesLabel = document.getElementById('game-lives-label');
  const levelGroup = document.getElementById('game-level-group');
  const levelOutput = document.getElementById('game-level');
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
    aim: { title: 'aim lab', description: 'precision practice', controls: 'hit eight targets to level up before time runs out.' },
    tetris: { title: 'blockfall', description: 'stack the signal', controls: 'arrows move · up rotates · space drops.' },
    snake: { title: 'snake', description: 'collect & survive', controls: 'use arrows or wasd to steer.' },
    breakout: { title: 'breakout', description: 'crack the wall', controls: 'move with left/right or follow with the pointer.' },
    invaders: { title: 'void patrol', description: 'defend the signal', controls: 'move with left/right and fire with space.' },
    'deep-echo': { title: 'deep echo', description: 'sonar memory', controls: 'listen to the sonar, then repeat the sequence with the arrow keys or buttons.' }
  };
  const touchActions = {
    starfall: [],
    aim: [],
    tetris: ['left', 'right', 'rotate', 'down', 'drop'],
    snake: ['left', 'up', 'down', 'right'],
    breakout: ['left', 'right'],
    invaders: ['left', 'right', 'fire'],
    'deep-echo': ['left', 'up', 'down', 'right']
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
  const aimColors = ['#f7f7f7', '#08090b'];
  let selectedGame = 'starfall';
  let miniGame = null;
  let animationFrame = 0;
  let pointerStart = null;
  let storageWarning = '';
  const heldKeys = new Set();

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
    const value = selectedGame === 'snake'
      ? miniGame.snake.length
      : selectedGame === 'tetris'
        ? miniGame.lines
        : selectedGame === 'aim'
          ? Math.ceil(miniGame.lives)
          : miniGame.lives;
    livesOutput.textContent = String(value);
    bestOutput.textContent = String(miniGame.best);
    if (levelGroup && levelOutput) {
      levelGroup.hidden = selectedGame !== 'aim';
      if (selectedGame === 'aim') levelOutput.textContent = String(miniGame.level);
    }
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
    const state = { state: 'ready', score: 0, lives: 3, best: best, level: 1, lastFrame: 0, elapsed: 0, accumulator: 0 };
    if (game === 'aim') {
      state.lives = 45;
      state.levelHits = 0;
      state.target = { x: width / 2, y: height / 2, radius: 32, color: aimColors[0] };
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
      state.turnQueue = [];
      state.snake = [{ x: 11, y: 9 }, { x: 10, y: 9 }, { x: 9, y: 9 }];
      state.food = { x: 17, y: 9 };
      state.lives = 1;
    } else if (game === 'breakout') {
      state.playerX = width / 2;
      state.ball = { x: width / 2, y: height - 110, vx: 270, vy: -340, radius: 9 };
      state.bricks = createBricks(state.level);
    } else if (game === 'invaders') {
      state.playerX = width / 2;
      state.invaders = [];
      state.bullets = [];
      state.enemyBullets = [];
      state.enemyDirection = 1;
      state.enemyFireTimer = 1;
      state.fireCooldown = 0;
      state.playerHitTimer = 0;
      state.lives = 3;
      spawnInvaders(state);
    } else if (game === 'deep-echo') {
      state.sequence = Array.from({ length: 3 }, function () { return Math.floor(Math.random() * 4); });
      state.round = 1;
      state.inputIndex = 0;
      state.playbackIndex = 0;
      state.echoTimer = 0.45;
      state.activeEcho = -1;
      state.inputLocked = true;
      state.feedbackDirection = -1;
      state.feedbackTimer = 0;
      state.feedbackCorrect = false;
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
    controlButtons.forEach(function (button) {
      button.hidden = !touchActions[game].includes(button.dataset.gameAction);
    });
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    pointerStart = null;
    heldKeys.clear();
    miniGame = null;

    if (game === 'starfall') {
      miniGame = null;
      scoreLabel.textContent = 'score';
      livesLabel.textContent = 'lives';
      if (levelGroup) levelGroup.hidden = true;
      mobileHint.textContent = 'tap start · drag to steer · hold fire · pause above';
      status.textContent = 'click the game to start.';
      window.dispatchEvent(new CustomEvent('arcade:select', { detail: { game: game } }));
      updatePauseButton();
      return;
    }

    window.dispatchEvent(new CustomEvent('arcade:select', { detail: { game: game } }));
    miniGame = makeGameState(game);
    scoreLabel.textContent = game === 'aim' ? 'hits' : 'score';
    livesLabel.textContent = game === 'aim' ? 'time' : game === 'tetris' ? 'lines' : game === 'snake' ? 'length' : 'lives';
    mobileHint.textContent = game === 'aim'
      ? 'tap the color target · hit 8 to level up'
      : game === 'tetris'
        ? 'use arrows or buttons · rotate and drop blocks'
        : game === 'snake'
          ? 'swipe to steer · use arrows or direction buttons'
          : game === 'breakout'
            ? 'move the paddle · clear every block'
            : game === 'invaders'
              ? 'move and fire · protect the signal'
              : 'listen to the sonar, then repeat its pattern';
    status.textContent = games[game].description + '. click or tap the field to start.' + (storageWarning ? ' ' + storageWarning : '');
    canvas.focus({ preventScroll: true });
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
    const heading = miniGame.state === 'ready'
      ? games[selectedGame].title
      : miniGame.state === 'paused'
        ? 'paused'
        : selectedGame === 'deep-echo' ? 'echo faded' : 'signal lost';
    drawText(heading, width / 2, height / 2 - 10, 28, '#e6e6e6');
    const hint = miniGame.state === 'ready' ? 'click or tap to start' : miniGame.state === 'paused' ? 'press esc or resume' : 'click or tap to play again';
    drawText(hint, width / 2, height / 2 + 28, 15, '#a4a4a4');
  }

  function drawAim() {
    const target = miniGame.target;
    context.beginPath();
    context.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
    context.fillStyle = target.color;
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 3;
    context.shadowColor = '#ffffff';
    context.shadowBlur = 10;
    context.stroke();
    context.shadowBlur = 0;
    drawText(miniGame.state === 'running' ? String(Math.ceil(miniGame.lives)) + ' SEC' : '45 SEC', width / 2, 54, 17, '#bdbdbd');
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

  function spawnInvaders(state) {
    state.invaders = [];
    for (let row = 0; row < 4; row++) {
      for (let column = 0; column < 10; column++) {
        state.invaders.push({ x: 185 + column * 86, y: 90 + row * 48, row: row, alive: true });
      }
    }
  }

  function drawDeepEcho() {
    const nodes = echoNodes();
    context.beginPath();
    context.arc(width / 2, height / 2, 206, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(190, 193, 195, 0.13)';
    context.lineWidth = 1;
    context.stroke();
    context.beginPath();
    context.arc(width / 2, height / 2, 41, 0, Math.PI * 2);
    context.fillStyle = 'rgba(255, 255, 255, 0.035)';
    context.fill();
    context.strokeStyle = 'rgba(190, 193, 195, 0.22)';
    context.stroke();
    nodes.forEach(function (node, index) {
      const playback = miniGame.activeEcho === index;
      const feedback = miniGame.feedbackDirection === index && miniGame.feedbackTimer > 0;
      const pulse = feedback ? miniGame.feedbackTimer / 0.3 : 0;
      const active = playback || feedback;
      const radius = playback ? 56 : feedback ? 49 + 8 * pulse : 49;
      context.beginPath();
      context.arc(node.x, node.y, radius, 0, Math.PI * 2);
      context.fillStyle = playback ? '#f1f1ef' : feedback && miniGame.feedbackCorrect ? '#e5e5e3' : '#111315';
      context.fill();
      context.strokeStyle = playback || feedback && miniGame.feedbackCorrect ? '#ffffff' : '#777b7e';
      context.lineWidth = active ? 3 : 2;
      context.stroke();
      drawText(['↑', '→', '↓', '←'][index], node.x, node.y + 10, 30, playback || feedback && miniGame.feedbackCorrect ? '#101214' : '#bcbfc1');
    });
    drawText('SONAR ECHO', width / 2, 47, 13, '#aeb1b3');
    drawText('ROUND ' + String(miniGame.round).padStart(2, '0'), width / 2, height / 2 + 5, 12, '#c4c6c8');
    if (!miniGame.inputLocked) {
      drawText('REPEAT THE SIGNAL', width / 2, height - 58, 13, '#929699');
    }
  }

  function echoNodes() {
    const centerX = width / 2;
    const centerY = height / 2;
    const spacing = 150;
    return [
      { x: centerX, y: centerY - spacing },
      { x: centerX + spacing, y: centerY },
      { x: centerX, y: centerY + spacing },
      { x: centerX - spacing, y: centerY }
    ];
  }

  function drawBreakout() {
    miniGame.bricks.forEach(function (brick) {
      if (!brick.active) return;
      context.fillStyle = brick.color;
      context.globalAlpha = 0.82;
      context.fillRect(brick.x, brick.y, 82, 22);
      context.globalAlpha = 1;
      context.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      context.strokeRect(brick.x, brick.y, 82, 22);
    });
    context.fillStyle = '#cfcfcf';
    context.fillRect(miniGame.playerX - 72, height - 70, 144, 13);
    context.fillStyle = '#ededed';
    context.beginPath();
    context.arc(miniGame.ball.x, miniGame.ball.y, miniGame.ball.radius, 0, Math.PI * 2);
    context.fill();
    drawText('BRICKS ' + miniGame.bricks.filter(function (brick) { return brick.active; }).length, width / 2, height - 28, 14, '#a4a4a4');
  }

  function fireInvaderBullet() {
    if (!miniGame || selectedGame !== 'invaders' || miniGame.fireCooldown > 0) return;
    miniGame.bullets.push({ x: miniGame.playerX, y: height - 90 });
    miniGame.fireCooldown = 0.24;
  }

  function drawInvaders() {
    miniGame.invaders.forEach(function (enemy) {
      if (!enemy.alive) return;
      context.fillStyle = colors[enemy.row % colors.length];
      context.fillRect(enemy.x - 18, enemy.y - 12, 36, 24);
      context.fillStyle = '#050607';
      context.fillRect(enemy.x - 11, enemy.y - 4, 5, 5);
      context.fillRect(enemy.x + 6, enemy.y - 4, 5, 5);
    });
    miniGame.bullets.forEach(function (bullet) { drawBullet(bullet.x, bullet.y, '#ededed'); });
    miniGame.enemyBullets.forEach(function (bullet) { drawBullet(bullet.x, bullet.y, '#969696'); });
    context.fillStyle = '#d5d5d5';
    context.beginPath();
    context.moveTo(miniGame.playerX, height - 68);
    context.lineTo(miniGame.playerX - 22, height - 34);
    context.lineTo(miniGame.playerX + 22, height - 34);
    context.closePath();
    context.fill();
  }

  function drawBullet(x, y, color) {
    context.fillStyle = color;
    context.fillRect(x - 3, y - 10, 6, 20);
  }

  function moveBreakout(delta) {
    const playerX = miniGame.playerX;
    miniGame.playerX = Math.max(82, Math.min(width - 82, playerX + heldAxis() * 520 * delta));
    const ball = miniGame.ball;
    ball.x += ball.vx * delta;
    ball.y += ball.vy * delta;
    if (ball.x < ball.radius || ball.x > width - ball.radius) ball.vx *= -1;
    if (ball.y < ball.radius) ball.vy = Math.abs(ball.vy);
    if (ball.vy > 0 && ball.y + ball.radius >= height - 70 && ball.y < height - 50 &&
      ball.x >= miniGame.playerX - 82 && ball.x <= miniGame.playerX + 82) {
      const offset = (ball.x - miniGame.playerX) / 82;
      ball.vx = offset * 430;
      ball.vy = -Math.max(280, Math.abs(ball.vy));
    }
    miniGame.bricks.forEach(function (brick) {
      if (!brick.active || ball.x + ball.radius < brick.x || ball.x - ball.radius > brick.x + 82 ||
        ball.y + ball.radius < brick.y || ball.y - ball.radius > brick.y + 22) return;
      brick.active = false;
      ball.vy *= -1;
      setScore(miniGame.score + 10);
    });
    if (!miniGame.bricks.some(function (brick) { return brick.active; })) {
      miniGame.level += 1;
      resetBricks();
      status.textContent = 'wall cleared. level ' + miniGame.level + '.';
    }
    if (ball.y > height + ball.radius) {
      miniGame.lives -= 1;
      if (miniGame.lives <= 0) finishGame('run over. final score: ' + miniGame.score + '.');
      else {
        ball.x = miniGame.playerX;
        ball.y = height - 110;
        ball.vx = 260;
        ball.vy = -330;
      }
    }
  }

  function moveInvaders(delta) {
    miniGame.playerX = Math.max(32, Math.min(width - 32, miniGame.playerX + heldAxis() * 440 * delta));
    miniGame.fireCooldown = Math.max(0, miniGame.fireCooldown - delta);
    if (heldKeys.has(' ') || heldKeys.has('space')) fireInvaderBullet();
    miniGame.invaders.forEach(function (enemy) { enemy.x += miniGame.enemyDirection * (100 + miniGame.level * 18) * delta; });
    const living = miniGame.invaders.filter(function (enemy) { return enemy.alive; });
    if (living.some(function (enemy) { return enemy.x < 35 || enemy.x > width - 35; })) {
      miniGame.enemyDirection *= -1;
      living.forEach(function (enemy) { enemy.y += 22; });
      if (living.some(function (enemy) { return enemy.y >= height - 115; })) finishGame('the signal was overrun. final score: ' + miniGame.score + '.');
    }
    miniGame.bullets.forEach(function (bullet) { bullet.y -= 560 * delta; });
    miniGame.bullets = miniGame.bullets.filter(function (bullet) {
      const target = miniGame.invaders.find(function (enemy) {
        return enemy.alive && Math.abs(enemy.x - bullet.x) < 23 && Math.abs(enemy.y - bullet.y) < 20;
      });
      if (target) {
        target.alive = false;
        setScore(miniGame.score + 10);
        return false;
      }
      return bullet.y > 0;
    });
    miniGame.enemyFireTimer -= delta;
    if (miniGame.enemyFireTimer <= 0 && living.length) {
      const shooter = living[Math.floor(Math.random() * living.length)];
      miniGame.enemyBullets.push({ x: shooter.x, y: shooter.y + 18 });
      miniGame.enemyFireTimer = Math.max(0.38, 1.05 - miniGame.level * 0.04);
    }
    miniGame.enemyBullets.forEach(function (bullet) { bullet.y += (190 + miniGame.level * 16) * delta; });
    miniGame.enemyBullets = miniGame.enemyBullets.filter(function (bullet) {
      if (bullet.y >= height - 78 && Math.abs(bullet.x - miniGame.playerX) < 28 && miniGame.playerHitTimer <= 0) {
        miniGame.lives -= 1;
        miniGame.playerHitTimer = 1;
        if (miniGame.lives <= 0) finishGame('defense failed. final score: ' + miniGame.score + '.');
        return false;
      }
      return bullet.y < height;
    });
    miniGame.playerHitTimer = Math.max(0, miniGame.playerHitTimer - delta);
    if (!living.length) {
      miniGame.level += 1;
      spawnInvaders(miniGame);
      status.textContent = 'wave cleared. wave ' + miniGame.level + ' incoming.';
    }
  }

  function beginEchoRound() {
    miniGame.inputIndex = 0;
    miniGame.playbackIndex = 0;
    miniGame.echoTimer = 0.45;
    miniGame.activeEcho = -1;
    miniGame.inputLocked = true;
    status.textContent = 'listen to the sonar pattern.';
  }

  function updateEcho(delta) {
    miniGame.feedbackTimer = Math.max(0, miniGame.feedbackTimer - delta);
    if (!miniGame.inputLocked) return;
    miniGame.echoTimer -= delta;
    if (miniGame.echoTimer > 0) return;
    if (miniGame.activeEcho !== -1) {
      miniGame.activeEcho = -1;
      miniGame.playbackIndex += 1;
      miniGame.echoTimer = 0.22;
    } else if (miniGame.playbackIndex < miniGame.sequence.length) {
      miniGame.activeEcho = miniGame.sequence[miniGame.playbackIndex];
      miniGame.echoTimer = 0.42;
    } else {
      miniGame.inputLocked = false;
      status.textContent = 'repeat the sonar pattern with the arrows.';
    }
  }

  function echoInput(direction) {
    miniGame.feedbackDirection = direction;
    miniGame.feedbackTimer = 0.3;
    miniGame.feedbackCorrect = !miniGame.inputLocked && miniGame.sequence[miniGame.inputIndex] === direction;
    if (miniGame.inputLocked) return;
    if (miniGame.sequence[miniGame.inputIndex] !== direction) {
      miniGame.lives -= 1;
      if (miniGame.lives <= 0) {
        finishGame('the sonar faded. final score: ' + miniGame.score + '.');
        return;
      }
      status.textContent = 'signal slipped. listen again.';
      beginEchoRound();
      return;
    }
    miniGame.inputIndex += 1;
    if (miniGame.inputIndex >= miniGame.sequence.length) {
      setScore(miniGame.score + miniGame.round * 100);
      miniGame.round += 1;
      miniGame.sequence.push(Math.floor(Math.random() * 4));
      beginEchoRound();
    }
  }

  function heldAxis() {
    return (heldKeys.has('arrowright') || heldKeys.has('d') ? 1 : 0) - (heldKeys.has('arrowleft') || heldKeys.has('a') ? 1 : 0);
  }

  function resetBricks() {
    miniGame.bricks = createBricks(miniGame.level);
    miniGame.ball.x = miniGame.playerX;
    miniGame.ball.y = height - 110;
    miniGame.ball.vx = 270 + miniGame.level * 18;
    miniGame.ball.vy = -(340 + miniGame.level * 18);
  }

  function createBricks(level) {
    return Array.from({ length: 5 }, function (_, row) {
      return Array.from({ length: 10 }, function (_, column) {
        return { x: 108 + column * 100, y: 105 + row * 37, active: true, color: colors[(row + column + level) % colors.length] };
      });
    }).flat();
  }

  function draw() {
    if (selectedGame === 'starfall' || !miniGame) return;
    drawBackground();
    if (selectedGame === 'aim') drawAim();
    else if (selectedGame === 'tetris') drawTetris();
    else if (selectedGame === 'snake') drawSnake();
    else if (selectedGame === 'breakout') drawBreakout();
    else if (selectedGame === 'invaders') drawInvaders();
    else if (selectedGame === 'deep-echo') drawDeepEcho();
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
    } else if (selectedGame === 'breakout') {
      moveBreakout(delta);
    } else if (selectedGame === 'invaders') {
      moveInvaders(delta);
    } else if (selectedGame === 'deep-echo') {
      updateEcho(delta);
    }
  }

  function randomTarget() {
    miniGame.target.radius = Math.max(14, 32 - (miniGame.level - 1) * 3);
    miniGame.target.x = miniGame.target.radius + 28 + Math.random() * (width - (miniGame.target.radius + 28) * 2);
    miniGame.target.y = miniGame.target.radius + 70 + Math.random() * (height - (miniGame.target.radius + 70) * 2);
    miniGame.target.color = aimColors[(miniGame.level - 1) % aimColors.length];
  }

  function hitAimTarget() {
    setScore(miniGame.score + 1);
    miniGame.levelHits += 1;
    if (miniGame.levelHits >= 8) {
      miniGame.level += 1;
      miniGame.levelHits = 0;
      miniGame.lives = Math.min(60, miniGame.lives + 5);
      status.textContent = 'level ' + miniGame.level + '. targets are smaller.';
    }
    randomTarget();
    updateHud();
  }

  function randomFood() {
    let position;
    do {
      position = { x: Math.floor(Math.random() * 25), y: Math.floor(Math.random() * 18) };
    } while (miniGame.snake.some(function (segment) { return segment.x === position.x && segment.y === position.y; }));
    miniGame.food = position;
  }

  function moveSnake() {
    if (miniGame.turnQueue.length) miniGame.direction = miniGame.turnQueue.shift();
    miniGame.nextDirection = miniGame.turnQueue.length
      ? miniGame.turnQueue[miniGame.turnQueue.length - 1]
      : miniGame.direction;
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
      const queued = miniGame.turnQueue[miniGame.turnQueue.length - 1];
      const reversesCurrent = direction && direction.x === -miniGame.direction.x && direction.y === -miniGame.direction.y;
      const repeatsQueued = direction && queued && direction.x === queued.x && direction.y === queued.y;
      const cancelsQueuedTurn = direction && queued && direction.x === -queued.x && direction.y === -queued.y;
      if (direction && !reversesCurrent && !repeatsQueued) {
        if (cancelsQueuedTurn) miniGame.turnQueue[miniGame.turnQueue.length - 1] = direction;
        else if (miniGame.turnQueue.length < 2) miniGame.turnQueue.push(direction);
      }
    } else if (selectedGame === 'breakout') {
      if (key === 'left') miniGame.playerX -= 55;
      else if (key === 'right') miniGame.playerX += 55;
      miniGame.playerX = Math.max(82, Math.min(width - 82, miniGame.playerX));
    } else if (selectedGame === 'invaders') {
      if (key === 'left') miniGame.playerX -= 45;
      else if (key === 'right') miniGame.playerX += 45;
      else if (key === 'fire') fireInvaderBullet();
      miniGame.playerX = Math.max(32, Math.min(width - 32, miniGame.playerX));
    } else if (selectedGame === 'deep-echo') {
      const directions = { up: 0, right: 1, down: 2, left: 3 };
      if (Object.prototype.hasOwnProperty.call(directions, key)) echoInput(directions[key]);
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
    if (!miniGame || miniGame.state !== 'running') return;
    if (selectedGame === 'breakout' || selectedGame === 'invaders') {
      miniGame.playerX = Math.max(32, Math.min(width - 32, pointerPosition(event).x));
    }
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
        hitAimTarget();
      }
    } else if (selectedGame === 'breakout' || selectedGame === 'invaders') {
      miniGame.playerX = Math.max(32, Math.min(width - 32, point.x));
      if (selectedGame === 'invaders') fireInvaderBullet();
    } else if (selectedGame === 'deep-echo') {
      const dx = point.x - width / 2;
      const dy = point.y - 350;
      echoInput(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
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
    const key = event.key.toLowerCase();
    const code = event.code.toLowerCase();
    if (key === 'escape') {
      event.preventDefault();
      if (!event.repeat) togglePause();
      return;
    }
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's', ' '].includes(key)) {
      event.preventDefault();
      heldKeys.add(key === ' ' ? 'space' : key);
    }
    if (!miniGame || miniGame.state !== 'running') {
      if ((key === 'enter' || key === ' ') && miniGame && miniGame.state !== 'paused') startGame();
      return;
    }
    if (event.repeat) return;
    const snakeKeys = {
      arrowleft: 'left', arrowright: 'right', arrowup: 'up', arrowdown: 'down',
      a: 'left', d: 'right', w: 'up', s: 'down'
    };
    const gameKeys = {
      arrowleft: 'left', arrowright: 'right', arrowdown: 'down',
      a: 'left', d: 'right', s: 'down'
    };
    const echoKeys = { arrowup: 'up', w: 'up', arrowright: 'right', d: 'right', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left' };
    if (selectedGame === 'snake' && snakeKeys[key]) action(snakeKeys[key]);
    else if (selectedGame === 'tetris' && (key === 'arrowup' || key === 'w')) action('rotate');
    else if (selectedGame === 'deep-echo' && echoKeys[key]) action(echoKeys[key]);
    else if (gameKeys[key]) action(gameKeys[key]);
    else if (selectedGame === 'invaders' && (key === ' ' || code === 'space')) action('fire');
    else if (selectedGame === 'tetris' && (key === ' ' || code === 'space')) action('drop');
  });

  window.addEventListener('keyup', function (event) {
    heldKeys.delete(event.key === ' ' ? 'space' : event.key.toLowerCase());
  });

  pauseButton.addEventListener('click', function () {
    if (selectedGame !== 'starfall') togglePause();
  });

  controlButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      if (selectedGame === 'starfall' || !miniGame) return;
      if (miniGame.state !== 'running') startGame();
      if (miniGame.state === 'running') {
        if (selectedGame === 'invaders' && button.dataset.gameAction === 'fire') action('fire');
        else action(button.dataset.gameAction);
      }
    });
  });

  menuButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      selectGame(button.dataset.game);
    });
  });

  window.addEventListener('blur', function () {
    heldKeys.clear();
    if (miniGame && miniGame.state === 'running') togglePause();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && miniGame && miniGame.state === 'running') togglePause();
  });

  pauseButton.disabled = true;
  setTitle(games.starfall.title);
})();
