(function () {
  const canvas = document.getElementById('game-canvas');
  const status = document.getElementById('game-status');
  const scoreOutput = document.getElementById('game-score');
  const livesOutput = document.getElementById('game-lives');
  const bestOutput = document.getElementById('game-best');
  const pauseButton = document.getElementById('game-pause');
  const gamePanel = canvas && canvas.closest('.game-panel');

  if (!canvas || !status || !scoreOutput || !livesOutput || !bestOutput || !pauseButton) return;

  const context = canvas.getContext('2d');
  if (!context) {
    status.textContent = 'this browser could not start the game canvas.';
    canvas.setAttribute('aria-disabled', 'true');
    return;
  }

  const width = 1200;
  const height = 700;
  const frameInterval = 1000 / 90;
  let touchControls = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const stars = Array.from({ length: 110 }, function (_, index) {
    return {
      x: (index * 137.5) % width,
      y: (index * 71.3) % height,
      size: index % 6 === 0 ? 2 : 1,
      alpha: 0.25 + (index % 5) * 0.12
    };
  });

  pauseButton.addEventListener('click', function () {
    togglePause();
  });

  let state = 'ready';
  let score = 0;
  let lives = 3;
  let best = 0;
  let playerX = width / 2;
  let firing = false;
  let asteroids = [];
  let shots = [];
  let boss = null;
  let bossBullets = [];
  let nextBossScore = 1000;
  let playerInvulnerability = 0;
  let spawnTimer = 0;
  let shotTimer = 0;
  let lastFrame = 0;
  let animationFrame = 0;
  let audioContext = null;
  let audioUnavailableReported = false;
  let shakeTimer = 0;

  function updateControlMode(isTouch) {
    touchControls = isTouch;
    document.body.classList.toggle('touch-device', touchControls);
    canvas.setAttribute('aria-label', touchControls
      ? 'asteroid arcade game. tap to start, drag to steer, hold to fire, use the pause button to pause or resume. bosses appear every 1000 points.'
      : 'asteroid arcade game. click to start, move the pointer to steer, click and hold to fire, press escape to pause or resume. bosses appear every 1000 points.');
    if (state === 'ready') {
      status.textContent = touchControls
        ? 'tap to start. drag to steer and hold to fire.'
        : 'click the game to start.';
    }
    draw();
  }

  function updatePauseButton() {
    pauseButton.disabled = state !== 'running' && state !== 'paused';
    pauseButton.textContent = state === 'paused' ? 'resume' : 'pause';
    pauseButton.setAttribute('aria-label', state === 'paused' ? 'resume game' : 'pause game');
  }

  try {
    best = Number(localStorage.getItem('ocean-arcade-best')) || 0;
  } catch (error) {
    console.error('could not read the arcade best score from local storage:', error);
    status.textContent = 'local high score is unavailable in this browser.';
  }

  bestOutput.textContent = String(best);

  function prepareAudio() {
    if (!AudioContextClass) {
      if (!audioUnavailableReported) {
        status.textContent = 'sound effects are unavailable in this browser.';
        audioUnavailableReported = true;
      }
      return false;
    }
    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(function (error) {
        console.error('could not enable arcade audio:', error);
        status.textContent = 'sound effects could not be enabled.';
      });
    }
    return true;
  }

  function playTone(startFrequency, endFrequency, duration, waveform, volume) {
    if (!prepareAudio()) return;
    const startTime = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(startFrequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + duration);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }

  function playShotSound() {
    playTone(740, 260, 0.075, 'square', 0.025);
  }

  function playLifeLostSound() {
    playTone(190, 58, 0.34, 'sawtooth', 0.055);
  }

  function shakeOnHit() {
    if (!gamePanel || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    clearTimeout(shakeTimer);
    gamePanel.classList.remove('hit-shake');
    void gamePanel.offsetWidth;
    gamePanel.classList.add('hit-shake');
    shakeTimer = setTimeout(function () {
      gamePanel.classList.remove('hit-shake');
    }, 280);
  }

  function saveBestScore() {
    try {
      localStorage.setItem('ocean-arcade-best', String(best));
    } catch (error) {
      console.error('could not save the arcade best score to local storage:', error);
      status.textContent = 'your score is safe for this run, but could not be saved.';
    }
  }

  function addScore(points) {
    score += points;
    scoreOutput.textContent = String(score);
    if (score > best) {
      best = score;
      bestOutput.textContent = String(best);
      saveBestScore();
    }
  }

  function startBoss() {
    boss = {
      x: width / 2,
      y: 105,
      hp: 14,
      maxHp: 14,
      direction: 1,
      speed: 190,
      shootTimer: 0.8,
      phase: 0
    };
    status.textContent = 'boss inbound. dodge its fire.';
  }

  function updateHud() {
    scoreOutput.textContent = String(score);
    livesOutput.textContent = String(lives);
  }

  function drawShip() {
    context.save();
    context.translate(playerX, height - 62);
    context.strokeStyle = '#e7e7e7';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, -17);
    context.lineTo(14, 13);
    context.lineTo(0, 7);
    context.lineTo(-14, 13);
    context.closePath();
    context.stroke();
    context.restore();
  }

  function drawAsteroid(asteroid) {
    context.save();
    context.translate(asteroid.x, asteroid.y);
    context.rotate(asteroid.rotation);
    context.strokeStyle = '#a6a6a6';
    context.lineWidth = 1.5;
    context.beginPath();
    asteroid.points.forEach(function (point, index) {
      const x = Math.cos(point.angle) * point.radius;
      const y = Math.sin(point.angle) * point.radius;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.stroke();
    context.restore();
  }

  function drawBoss() {
    if (!boss) return;
    context.save();
    context.translate(boss.x, boss.y);
    context.strokeStyle = '#ededed';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(-68, -4);
    context.lineTo(-42, -26);
    context.lineTo(-18, -20);
    context.lineTo(0, -34);
    context.lineTo(18, -20);
    context.lineTo(42, -26);
    context.lineTo(68, -4);
    context.lineTo(48, 22);
    context.lineTo(20, 15);
    context.lineTo(0, 30);
    context.lineTo(-20, 15);
    context.lineTo(-48, 22);
    context.closePath();
    context.stroke();
    context.fillStyle = '#d8d8d8';
    context.fillRect(-10, -5, 20, 10);
    context.restore();

    const barWidth = 180;
    const barX = width / 2 - barWidth / 2;
    const barY = 24;
    context.fillStyle = '#252525';
    context.fillRect(barX, barY, barWidth, 7);
    context.fillStyle = '#dedede';
    context.fillRect(barX, barY, barWidth * (boss.hp / boss.maxHp), 7);
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#d2d2d2';
    stars.forEach(function (star) {
      context.globalAlpha = star.alpha;
      context.fillRect(star.x, star.y, star.size, star.size);
    });
    context.globalAlpha = 1;

    asteroids.forEach(drawAsteroid);
    drawBoss();
    context.strokeStyle = '#e0e0e0';
    context.lineWidth = 2;
    shots.forEach(function (shot) {
      context.beginPath();
      context.moveTo(shot.x, shot.y);
      context.lineTo(shot.x, shot.y - 12);
      context.stroke();
    });
    context.strokeStyle = '#bcbcbc';
    context.lineWidth = 3;
    bossBullets.forEach(function (bullet) {
      context.beginPath();
      context.moveTo(bullet.x, bullet.y);
      context.lineTo(bullet.x - bullet.vx * 0.035, bullet.y - bullet.vy * 0.035);
      context.stroke();
    });
    if (playerInvulnerability <= 0 || Math.floor(performance.now() / 90) % 2 === 0) {
      drawShip();
    }

    if (state !== 'running') {
      context.fillStyle = 'rgba(4, 5, 7, 0.72)';
      context.fillRect(0, 0, width, height);
      context.textAlign = 'center';
      context.fillStyle = '#e6e6e6';
      context.font = '500 23px "JetBrains Mono", monospace';
      const message = state === 'ready' ? 'asteroid drift' : state === 'paused' ? 'paused' : 'signal lost';
      context.fillText(message, width / 2, height / 2 - 6);
      context.fillStyle = '#a4a4a4';
      context.font = '14px "JetBrains Mono", monospace';
      const action = touchControls ? 'tap' : 'click';
      const hint = state === 'ready'
        ? action + ' to start'
        : state === 'paused'
          ? (touchControls ? 'tap resume or use pause button' : 'click or press esc to resume')
          : action + ' to play again';
      context.fillText(hint, width / 2, height / 2 + 24);
    }
  }

  function createAsteroid() {
    const radius = 15 + Math.random() * 19;
    const pointCount = 8;
    const points = Array.from({ length: pointCount }, function (_, index) {
      return {
        angle: (Math.PI * 2 * index) / pointCount,
        radius: radius * (0.76 + Math.random() * 0.34)
      };
    });
    asteroids.push({
      x: radius + Math.random() * (width - radius * 2),
      y: -radius,
      radius: radius,
      speed: 70 + Math.random() * 65 + Math.min(score, 400) * 0.12,
      rotation: 0,
      spin: (Math.random() - 0.5) * 1.6,
      points: points
    });
  }

  function finishGame() {
    state = 'over';
    firing = false;
    status.textContent = 'run over. final score: ' + score + '.';
    updatePauseButton();
    draw();
  }

  function startGame() {
    score = 0;
    lives = 3;
    playerX = width / 2;
    asteroids = [];
    shots = [];
    boss = null;
    bossBullets = [];
    nextBossScore = 1000;
    playerInvulnerability = 0;
    spawnTimer = 0.35;
    shotTimer = 0;
    state = 'running';
    firing = false;
    status.textContent = touchControls
      ? 'game in progress. drag to steer and hold to fire.'
      : 'game in progress. press escape to pause.';
    updatePauseButton();
    updateHud();
    lastFrame = performance.now();
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(loop);
  }

  function loseLife() {
    if (playerInvulnerability > 0 || state !== 'running') return;
    lives -= 1;
    livesOutput.textContent = String(lives);
    playerInvulnerability = 1;
    firing = false;
    playLifeLostSound();
    shakeOnHit();
    if (lives <= 0) finishGame();
    else status.textContent = 'impact detected. ' + lives + ' lives remaining.';
  }

  function fireBossBullet() {
    const dx = playerX - boss.x;
    const dy = height - 62 - boss.y;
    const distance = Math.hypot(dx, dy) || 1;
    const speed = 230;
    bossBullets.push({
      x: boss.x,
      y: boss.y + 24,
      vx: (dx / distance) * speed,
      vy: (dy / distance) * speed
    });
  }

  function checkBossThreshold() {
    if (!boss && score >= nextBossScore) startBoss();
  }

  function togglePause() {
    if (state === 'running') {
      state = 'paused';
      firing = false;
      status.textContent = 'game paused.';
      updatePauseButton();
      cancelAnimationFrame(animationFrame);
      draw();
    } else if (state === 'paused') {
      state = 'running';
      status.textContent = touchControls
        ? 'game in progress. drag to steer and hold to fire.'
        : 'game in progress. press escape to pause.';
      updatePauseButton();
      lastFrame = performance.now();
      animationFrame = requestAnimationFrame(loop);
    }
  }

  function loop(now) {
    if (state !== 'running') return;
    const elapsed = now - lastFrame;
    if (elapsed < frameInterval - 1) {
      animationFrame = requestAnimationFrame(loop);
      return;
    }
    const delta = Math.min(elapsed / 1000, 0.04);
    lastFrame = now;
    playerInvulnerability = Math.max(0, playerInvulnerability - delta);

    playerX = Math.max(20, Math.min(width - 20, playerX));

    spawnTimer -= delta;
    if (spawnTimer <= 0) {
      createAsteroid();
      spawnTimer = (boss ? 1.05 : Math.max(0.34, 0.9 - score * 0.001)) + Math.random() * 0.35;
    }

    shotTimer -= delta;
    if (firing && shotTimer <= 0) {
      shots.push({ x: playerX, y: height - 80 });
      shotTimer = 0.22;
      playShotSound();
    }

    shots.forEach(function (shot) { shot.y -= 600 * delta; });
    shots = shots.filter(function (shot) { return shot.y > -14; });

    asteroids.forEach(function (asteroid) {
      asteroid.y += asteroid.speed * delta;
      asteroid.rotation += asteroid.spin * delta;
    });

    if (boss) {
      boss.x += boss.direction * boss.speed * delta;
      if (boss.x > width - 100 || boss.x < 100) boss.direction *= -1;
      boss.phase += delta;
      boss.y = 105 + Math.sin(boss.phase * 1.3) * 16;
      boss.shootTimer -= delta;
      if (boss.shootTimer <= 0) {
        fireBossBullet();
        boss.shootTimer = 1.05;
      }
    }

    shots.forEach(function (shot) {
      if (boss && Math.hypot(shot.x - boss.x, shot.y - boss.y) < 68) {
        boss.hp -= 1;
        shot.y = -100;
        if (boss.hp <= 0) {
          boss = null;
          nextBossScore += 1000;
          addScore(300);
          status.textContent = 'boss defeated. next boss at ' + nextBossScore + ' points.';
          checkBossThreshold();
        }
        return;
      }
      const hitIndex = asteroids.findIndex(function (asteroid) {
        return Math.hypot(shot.x - asteroid.x, shot.y - asteroid.y) < asteroid.radius;
      });
      if (hitIndex !== -1) {
        asteroids.splice(hitIndex, 1);
        shot.y = -100;
        addScore(10);
        checkBossThreshold();
      }
    });
    shots = shots.filter(function (shot) { return shot.y > -14; });

    bossBullets.forEach(function (bullet) {
      bullet.x += bullet.vx * delta;
      bullet.y += bullet.vy * delta;
    });
    bossBullets = bossBullets.filter(function (bullet) {
      if (bullet.x < -20 || bullet.x > width + 20 || bullet.y < -20 || bullet.y > height + 20) return false;
      if (Math.hypot(playerX - bullet.x, height - 62 - bullet.y) < 18) {
        loseLife();
        return false;
      }
      return true;
    });

    asteroids = asteroids.filter(function (asteroid) {
      if (asteroid.y - asteroid.radius > height) return false;
      if (Math.hypot(playerX - asteroid.x, height - 62 - asteroid.y) < asteroid.radius + 12 && playerInvulnerability <= 0) {
        loseLife();
        return false;
      }
      return true;
    });

    if (state !== 'running') return;
    draw();
    animationFrame = requestAnimationFrame(loop);
  }

  function updatePointer(event) {
    if (event.pointerType === 'touch' && !touchControls) updateControlMode(true);
    if (state !== 'running') return;
    setPlayerFromPointer(event);
  }

  function setPlayerFromPointer(event) {
    const bounds = canvas.getBoundingClientRect();
    const scale = width / bounds.width;
    playerX = Math.max(20, Math.min(width - 20, (event.clientX - bounds.left) * scale));
  }

  canvas.addEventListener('pointermove', updatePointer);
  canvas.addEventListener('pointerdown', function (event) {
    event.preventDefault();
    if (event.pointerType === 'touch' && !touchControls) updateControlMode(true);
    prepareAudio();
    if (state === 'paused') {
      togglePause();
      draw();
      return;
    }
    if (state !== 'running') {
      setPlayerFromPointer(event);
      startGame();
      draw();
      return;
    }
    updatePointer(event);
    firing = true;
    canvas.setPointerCapture(event.pointerId);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (eventName) {
    canvas.addEventListener(eventName, function () {
      firing = false;
    });
  });

  window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') event.preventDefault();
    if (event.key === 'Escape' && !event.repeat) {
      togglePause();
    }
  });

  window.addEventListener('blur', function () {
    firing = false;
    if (state === 'running') togglePause();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state === 'running') togglePause();
  });

  updatePauseButton();
  updateControlMode(touchControls);
  draw();
})();
