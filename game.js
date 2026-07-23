(() => {
  "use strict";

  const canvas = document.querySelector("#game-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const stage = document.querySelector("#game-stage");
  const message = document.querySelector("#game-message");
  const scoreEl = document.querySelector("#score");
  const highScoreEl = document.querySelector("#high-score");
  const lifeValueEl = document.querySelector("#life-value");
  const lifeHeartsEl = document.querySelector("#life-hearts");
  const startButton = document.querySelector("#start-game");
  const pauseButton = document.querySelector("#pause-game");
  const restartButton = document.querySelector("#restart-game");
  const grid = { columns: 24, rows: 16 };
  const maxLife = 100;
  const tickMs = 145;
  let worm;
  let food;
  let enemies;
  let heart;
  let direction;
  let queuedDirection;
  let score;
  let highScore = readHighScore();
  let life;
  let state = "ready";
  let loopId = null;
  let lastTick = 0;
  let elapsed = 0;
  let moveElapsed = 0;
  let enemyElapsed = 0;
  let nextHeartAt = 5000;
  let nextExplosionAt = 6000;
  let explosionUntil = 0;
  let explosionCenter = null;
  let respawnTimers = [];

  function readHighScore() {
    try { return Number(localStorage.getItem("worm-high-score")) || 0; } catch { return 0; }
  }

  function writeHighScore() {
    try { localStorage.setItem("worm-high-score", String(highScore)); } catch { /* storage is optional */ }
  }

  function resetGame() {
    clearLoop();
    respawnTimers.forEach((timer) => window.clearTimeout(timer));
    respawnTimers = [];
    worm = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
    direction = { x: 1, y: 0 };
    queuedDirection = { x: 1, y: 0 };
    enemies = [{ x: 17, y: 4, dx: 0, dy: 1 }, { x: 18, y: 12, dx: -1, dy: 0 }];
    food = randomOpenCell();
    heart = null;
    score = 0;
    life = maxLife;
    elapsed = 0;
    moveElapsed = 0;
    enemyElapsed = 0;
    nextHeartAt = randomBetween(4000, 8000);
    nextExplosionAt = 6000;
    explosionUntil = 0;
    explosionCenter = null;
    state = "ready";
    updateHud();
    setMessage("START // 방향키 또는 WASD로 이동");
    draw();
    updateButtons();
  }

  function startGame() {
    if (state === "gameover") resetGame();
    if (state === "running") return;
    state = "running";
    setMessage("RUNNING // 적과 폭발을 피하세요");
    updateButtons();
    startLoop();
  }

  function togglePause() {
    if (state === "running") {
      state = "paused";
      clearLoop();
      setMessage("PAUSED // Pause를 눌러 계속");
    } else if (state === "paused") {
      state = "running";
      setMessage("RUNNING // 계속 진행 중");
      startLoop();
    }
    updateButtons();
  }

  function startLoop() {
    clearLoop();
    lastTick = performance.now();
    loopId = window.setInterval(() => {
      const now = performance.now();
      const delta = Math.min(now - lastTick, 250);
      lastTick = now;
      update(delta);
      draw();
    }, 50);
  }

  function clearLoop() {
    if (loopId !== null) window.clearInterval(loopId);
    loopId = null;
  }

  function update(delta) {
    if (state !== "running") return;
    elapsed += delta;
    moveElapsed += delta;
    enemyElapsed += delta;
    if (moveElapsed >= tickMs) {
      moveElapsed = 0;
      moveWorm();
    }
    if (enemyElapsed >= 420) {
      enemyElapsed = 0;
      moveEnemies();
    }
    if (elapsed >= nextExplosionAt) triggerExplosion();
    if (!heart && elapsed >= nextHeartAt) spawnHeart();
    if (heart && elapsed >= heart.expiresAt) heart = null;
  }

  function moveWorm() {
    direction = queuedDirection;
    const head = { x: worm[0].x + direction.x, y: worm[0].y + direction.y };
    if (isOutside(head) || worm.some((part) => part.x === head.x && part.y === head.y)) {
      endGame("GAME OVER // 벽 또는 몸에 충돌");
      return;
    }
    const bombIndex = enemies.findIndex((enemy) => enemy.x === head.x && enemy.y === head.y);
    if (bombIndex >= 0) {
      detonateBomb(bombIndex, enemies[bombIndex], true);
      if (state === "gameover") return;
    }
    worm.unshift(head);
    if (food && head.x === food.x && head.y === food.y) {
      score += 10;
      if (score > highScore) { highScore = score; writeHighScore(); }
      food = randomOpenCell();
    } else {
      worm.pop();
    }
    if (heart && head.x === heart.x && head.y === heart.y) {
      life = Math.min(maxLife, life + 10);
      heart = null;
      setMessage("HEART COLLECTED // LIFE +10");
    }
    updateHud();
  }

  function moveEnemies() {
    enemies.forEach((enemy) => {
      const options = [{ x: enemy.dx, y: enemy.dy }, { x: -enemy.dy, y: enemy.dx }, { x: enemy.dy, y: -enemy.dx }];
      const choice = options[Math.floor(Math.random() * options.length)];
      const next = { x: enemy.x + choice.x, y: enemy.y + choice.y };
      if (!isOutside(next) && !worm.some((part) => part.x === next.x && part.y === next.y)) {
        enemy.x = next.x;
        enemy.y = next.y;
        enemy.dx = choice.x;
        enemy.dy = choice.y;
      } else {
        enemy.dx *= -1;
        enemy.dy *= -1;
      }
    });
  }

  function triggerExplosion() {
    nextExplosionAt += 6000;
    if (enemies.length === 0) return;
    const bombIndex = Math.floor(Math.random() * enemies.length);
    const bomb = enemies[bombIndex];
    const wormHit = worm.some((part) => part.x === bomb.x && part.y === bomb.y);
    detonateBomb(bombIndex, bomb, wormHit);
  }

  function detonateBomb(index, bomb, wormHit) {
    explosionCenter = { x: bomb.x, y: bomb.y };
    explosionUntil = performance.now() + 800;
    stage.classList.remove("is-exploding");
    void stage.offsetWidth;
    stage.classList.add("is-exploding");
    if (wormHit) {
      life = Math.max(0, life - 10);
      setMessage("WARNING // BOMB HIT -10 LIFE");
    } else {
      setMessage("EXPLOSION // SAFE DISTANCE");
    }
    enemies.splice(index, 1);
    const timer = window.setTimeout(() => {
      if (state !== "gameover" && enemies.length < 2) enemies.push(newEnemy());
      respawnTimers = respawnTimers.filter((item) => item !== timer);
    }, 2000);
    respawnTimers.push(timer);
    if (life <= 0) endGame("GAME OVER // LIFE ZERO");
    updateHud();
  }

  function spawnHeart() {
    heart = { ...randomOpenCell(), expiresAt: elapsed + 10000 };
    nextHeartAt = elapsed + randomBetween(6000, 10000);
    setMessage("HEART SIGNAL // +10 LIFE AVAILABLE");
  }

  function endGame(text) {
    state = "gameover";
    clearLoop();
    setMessage(text);
    updateButtons();
    draw();
  }

  function setDirection(next) {
    const vectors = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
    const candidate = vectors[next];
    if (!candidate || (candidate.x === -direction.x && candidate.y === -direction.y)) return;
    queuedDirection = candidate;
    if (state === "ready") startGame();
  }

  function randomOpenCell() {
    const occupied = [...worm, ...enemies, ...(food ? [food] : []), ...(heart ? [heart] : [])];
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = { x: Math.floor(Math.random() * grid.columns), y: Math.floor(Math.random() * grid.rows) };
      if (!occupied.some((item) => item.x === candidate.x && item.y === candidate.y)) return candidate;
    }
    return { x: 2, y: 2 };
  }

  function newEnemy() {
    const cell = randomOpenCell();
    return { ...cell, dx: Math.random() > 0.5 ? 1 : -1, dy: 0 };
  }

  function isOutside(cell) { return cell.x < 0 || cell.y < 0 || cell.x >= grid.columns || cell.y >= grid.rows; }
  function randomBetween(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  function updateHud() {
    scoreEl.textContent = String(score);
    highScoreEl.textContent = String(highScore);
    lifeValueEl.textContent = `라이프 ${life}`;
    lifeHeartsEl.textContent = "♥".repeat(Math.max(0, Math.ceil(life / 10)));
  }

  function updateButtons() {
    startButton.disabled = state === "running" || state === "paused";
    pauseButton.disabled = state !== "running" && state !== "paused";
    pauseButton.textContent = state === "paused" ? "Resume" : "Pause";
  }

  function setMessage(text) { message.textContent = text; }

  function drawCell(cell, color, cellWidth, cellHeight, padding) {
    if (!cell) return;
    const inset = Math.min(cellWidth, cellHeight) * padding;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = Math.min(cellWidth, cellHeight) * 0.7;
    ctx.fillRect(cell.x * cellWidth + inset, cell.y * cellHeight + inset, cellWidth - inset * 2, cellHeight - inset * 2);
    ctx.shadowBlur = 0;
  }

  function drawHeart(cell, color, cellWidth, cellHeight) {
    if (!cell) return;
    const centerX = (cell.x + 0.5) * cellWidth;
    const centerY = (cell.y + 0.55) * cellHeight;
    const size = Math.floor(Math.min(cellWidth, cellHeight) * 1.15);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = Math.min(cellWidth, cellHeight) * 0.8;
    ctx.font = `${size}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("♥", centerX, centerY);
    ctx.shadowBlur = 0;
  }

  function drawFood(cell, cellWidth, cellHeight) {
    if (!cell) return;
    const centerX = (cell.x + 0.5) * cellWidth;
    const centerY = (cell.y + 0.52) * cellHeight;
    const scale = Math.min(cellWidth, cellHeight) * 0.32;
    ctx.save();
    ctx.lineWidth = Math.max(2, scale * 0.12);
    ctx.strokeStyle = "#9b5a2e";
    ctx.fillStyle = "#e8a04f";
    ctx.shadowColor = "#ffbd4a";
    ctx.shadowBlur = Math.min(cellWidth, cellHeight) * 0.55;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, scale * 1.15, scale * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#e8a04f";
    ctx.lineCap = "round";
    for (const side of [-1, 1]) {
      for (const offset of [-0.42, 0, 0.42]) {
        ctx.beginPath();
        ctx.moveTo(centerX + side * scale * 0.55, centerY + offset * scale);
        ctx.lineTo(centerX + side * scale * 1.25, centerY + (offset - 0.2 * side) * scale);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = "#9b5a2e";
    ctx.beginPath();
    ctx.moveTo(centerX - scale * 0.35, centerY - scale * 0.55);
    ctx.lineTo(centerX - scale * 0.7, centerY - scale * 1.05);
    ctx.moveTo(centerX + scale * 0.35, centerY - scale * 0.55);
    ctx.lineTo(centerX + scale * 0.7, centerY - scale * 1.05);
    ctx.stroke();
    ctx.fillStyle = "#142218";
    ctx.beginPath();
    ctx.arc(centerX - scale * 0.38, centerY - scale * 0.2, scale * 0.12, 0, Math.PI * 2);
    ctx.arc(centerX + scale * 0.38, centerY - scale * 0.2, scale * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    const cellWidth = canvas.width / grid.columns;
    const cellHeight = canvas.height / grid.rows;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#03100a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(88, 255, 134, 0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= grid.columns; x += 1) { ctx.beginPath(); ctx.moveTo(x * cellWidth, 0); ctx.lineTo(x * cellWidth, canvas.height); ctx.stroke(); }
    for (let y = 0; y <= grid.rows; y += 1) { ctx.beginPath(); ctx.moveTo(0, y * cellHeight); ctx.lineTo(canvas.width, y * cellHeight); ctx.stroke(); }
    drawFood(food, cellWidth, cellHeight);
    if (heart) drawHeart(heart, "#ff4f77", cellWidth, cellHeight);
    enemies.forEach((enemy) => drawCell(enemy, "#ff754d", cellWidth, cellHeight, 0.2));
    worm.forEach((part, index) => drawCell(part, index === 0 ? "#d9ff73" : "#58ff86", cellWidth, cellHeight, 0.18));
    if (explosionCenter && performance.now() < explosionUntil) {
      const centerX = (explosionCenter.x + 0.5) * cellWidth;
      const centerY = (explosionCenter.y + 0.5) * cellHeight;
      ctx.fillStyle = "rgba(255, 190, 64, 0.24)";
      ctx.strokeStyle = "rgba(255, 190, 64, 0.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerX, centerY, Math.min(cellWidth, cellHeight) * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (explosionCenter) {
      explosionCenter = null;
    }
  }

  document.addEventListener("keydown", (event) => {
    const keys = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" };
    if (keys[event.key]) { event.preventDefault(); setDirection(keys[event.key]); }
    if (event.key === "p") togglePause();
  });
  document.querySelectorAll("[data-direction]").forEach((button) => button.addEventListener("click", () => setDirection(button.dataset.direction)));
  startButton.addEventListener("click", startGame);
  pauseButton.addEventListener("click", togglePause);
  restartButton.addEventListener("click", resetGame);
  resetGame();
})();
