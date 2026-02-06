
/* RUNNER - endless 3-lane runner (Subway Surfers feel)
   - 1 hit = game over
   - starts slow, ramps up
   - 3-lane paved road with dashed lane lines
   - desktop keys + mobile swipes
*/

const GAME_TITLE = "RUNNER";

class BootScene extends Phaser.Scene {
  constructor() { super("BootScene"); }
  preload() {
    this.load.image("token", "assets/token.png");
    this.load.image("barrier", "assets/barrier.png");
    this.load.image("overhead", "assets/overhead.png");
    this.load.spritesheet("runner", "assets/runner_sheet.png", { frameWidth: 128, frameHeight: 128 });

    this.load.audio("pickup", "assets/pickup.wav");
    this.load.audio("jump", "assets/jump.wav");
    this.load.audio("slide", "assets/slide.wav");
    this.load.audio("hit", "assets/hit.wav");
    this.load.audio("step", "assets/step.wav");

    // lightweight loading bar
    const { width: W, height: H } = this.scale;
    const barW = Math.min(W * 0.7, 520);
    const x = (W - barW) / 2;
    const y = H * 0.55;
    const box = this.add.rectangle(W/2, y, barW, 18, 0xffffff, 0.08).setStrokeStyle(2, 0xffffff, 0.25);
    const fill = this.add.rectangle(x, y, 4, 10, 0xffffff, 0.5).setOrigin(0, 0.5);

    this.load.on("progress", (p) => {
      fill.width = Math.max(4, barW * p);
    });

    this.load.on("complete", () => {
      box.destroy(); fill.destroy();
    });
  }
  create() {
    this.scene.start("GameScene");
  }
}

class GameScene extends Phaser.Scene {
  constructor() { super("GameScene"); }

  init() {
    this.state = "start"; // start | run | over
    this.score = 0;
    this.best = Number(localStorage.getItem("runner_best") || 0);

    // speed ramp
    this.baseSpeed = 520;
    this.speed = this.baseSpeed;
    this.speedMax = 1800;
    this.speedRampPerSec = 6.0;

    // spawn tuning
    this.spawnBaseMs = 1200;
    this.spawnMinMs = 520;
    this.spawnTimer = null;

    // lanes
    this.laneIndex = 1; // 0,1,2
    this.laneX = [];
    this.road = { lines: [] };
    this.isSliding = false;

    // audio
    this.sfx = {};
    this.stepAccumulator = 0;
    this.stepInterval = 0.34;
  }

  create() {
    const { width: W, height: H } = this.scale;

    // ---------- Road ----------
    const roadW = Math.min(W * 0.86, 680);
    const roadX = (W - roadW) / 2;

    // asphalt
    const asphalt = this.add.graphics();
    asphalt.fillStyle(0x0e0f11, 1);
    asphalt.fillRect(roadX, 0, roadW, H);

    // side vignette
    const vignette = this.add.graphics();
    vignette.fillStyle(0x000000, 1);
    vignette.fillRect(0, 0, roadX, H);
    vignette.fillRect(roadX + roadW, 0, W - (roadX + roadW), H);

    // lane centers
    const laneW = roadW / 3;
    this.laneX = [
      roadX + laneW * 0.5,
      roadX + laneW * 1.5,
      roadX + laneW * 2.5,
    ];

    // dashed dividers
    for (let divider = 1; divider <= 2; divider++) {
      const x = roadX + laneW * divider;
      const g = this.add.graphics();
      g.setDepth(5);
      this.road.lines.push({ g, x, offset: 0 });
    }

    // speed lines overlay
    this.speedLines = this.add.graphics().setDepth(50);

    // ---------- Player ----------
    this.player = this.physics.add.sprite(this.laneX[this.laneIndex], H * 0.78, "runner", 0);
    this.player.setDepth(10);
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(44, 92).setOffset(42, 28);

    // animation
    if (!this.anims.exists("run")) {
      this.anims.create({
        key: "run",
        frames: this.anims.generateFrameNumbers("runner", { start: 0, end: 7 }),
        frameRate: 14,
        repeat: -1,
      });
    }
    this.player.play("run");

    // ground
    this.groundY = H * 0.82;
    this.ground = this.add.rectangle(W/2, this.groundY + 24, W, 80, 0x000000, 0);
    this.physics.add.existing(this.ground, true);
    this.physics.add.collider(this.player, this.ground);

    // groups
    this.obstacles = this.physics.add.group({ immovable: true, allowGravity: false });
    this.tokens = this.physics.add.group({ immovable: true, allowGravity: false });

    this.physics.add.overlap(this.player, this.tokens, this.onToken, null, this);
    this.physics.add.overlap(this.player, this.obstacles, this.onHit, null, this);

    // input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("A,D,W,S,SPACE");

    // swipe
    this.swipe = { x0: 0, y0: 0, t0: 0 };
    this.input.on("pointerdown", (p) => {
      this.swipe.x0 = p.x; this.swipe.y0 = p.y; this.swipe.t0 = this.time.now;
    });
    this.input.on("pointerup", (p) => {
      const dx = p.x - this.swipe.x0;
      const dy = p.y - this.swipe.y0;
      const dt = this.time.now - this.swipe.t0;
      if (dt > 800) return;

      const ax = Math.abs(dx), ay = Math.abs(dy);
      const TH = 35;

      if (ax < TH && ay < TH) {
        if (this.state === "start") this.startRun();
        else this.tryJump();
        return;
      }
      if (ax > ay) {
        if (dx > 0) this.moveLane(1);
        else this.moveLane(-1);
      } else {
        if (dy < 0) this.tryJump();
        else this.trySlide();
      }
    });

    // UI
    this.titleText = this.add.text(W/2, H*0.26, GAME_TITLE, {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontSize: Math.floor(W*0.12) + "px",
      color: "#ffffff",
      fontStyle: "700",
    }).setOrigin(0.5).setAlpha(0.95);

    this.subtitleText = this.add.text(W/2, H*0.34, "tap / press space to run", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontSize: Math.floor(W*0.035) + "px",
      color: "#9aa0a6",
    }).setOrigin(0.5);

    this.scoreText = this.add.text(W/2, 52, "0", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontSize: Math.floor(W*0.06) + "px",
      color: "#ffffff",
    }).setOrigin(0.5).setAlpha(0.92).setDepth(60);

    // game over UI
    this.overGroup = this.add.container(0,0).setDepth(100).setVisible(false);
    const overlay = this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.72);
    const overTitle = this.add.text(W/2, H*0.35, "RUN ENDED", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontSize: Math.floor(W*0.09) + "px",
      color: "#ffffff",
      fontStyle: "800",
    }).setOrigin(0.5);

    this.finalScoreText = this.add.text(W/2, H*0.43, "", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontSize: Math.floor(W*0.05) + "px",
      color: "#ffffff",
    }).setOrigin(0.5);

    this.bestScoreText = this.add.text(W/2, H*0.48, "", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontSize: Math.floor(W*0.035) + "px",
      color: "#9aa0a6",
    }).setOrigin(0.5);

    const makeBtn = (y, label) => {
      const btn = this.add.rectangle(W/2, y, Math.min(W*0.68, 520), 84, 0xffffff, 0.10)
        .setStrokeStyle(2, 0xffffff, 0.35)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.text(W/2, y, label, {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        fontSize: Math.floor(W*0.04) + "px",
        color: "#ffffff",
        fontStyle: "700",
      }).setOrigin(0.5);
      return { btn, txt };
    };

    const restart = makeBtn(H*0.58, "RESTART");
    restart.btn.on("pointerdown", () => this.restart());

    const share = makeBtn(H*0.66, "SHARE SCORE");
    share.btn.on("pointerdown", () => this.shareScore());

    this.overGroup.add([overlay, overTitle, this.finalScoreText, this.bestScoreText, restart.btn, restart.txt, share.btn, share.txt]);

    // sfx
    this.sfx.pickup = this.sound.add("pickup", { volume: 0.7 });
    this.sfx.jump   = this.sound.add("jump",   { volume: 0.7 });
    this.sfx.slide  = this.sound.add("slide",  { volume: 0.65 });
    this.sfx.hit    = this.sound.add("hit",    { volume: 0.8 });
    this.sfx.step   = this.sound.add("step",   { volume: 0.10 });

    // keyboard
    this.input.keyboard.on("keydown-SPACE", () => {
      if (this.state === "start") this.startRun();
      else if (this.state === "run") this.tryJump();
      else if (this.state === "over") this.restart();
    });

    // camera follow (subway surfers vibe)
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08, 0, 220);
  }

  startRun() {
    this.state = "run";
    this.titleText.setVisible(false);
    this.subtitleText.setVisible(false);
    this.score = 0;
    this.speed = this.baseSpeed;

    if (this.spawnTimer) this.spawnTimer.remove(false);
    this.spawnTimer = this.time.addEvent({
      delay: this.spawnBaseMs,
      loop: true,
      callback: () => {
        if (this.state !== "run") return;
        this.spawnSomething();

        const t = Phaser.Math.Clamp((this.speed - this.baseSpeed) / (this.speedMax - this.baseSpeed), 0, 1);
        const nextDelay = Phaser.Math.Linear(this.spawnBaseMs, this.spawnMinMs, t);
        this.spawnTimer.delay = nextDelay;
      }
    });
  }

  moveLane(dir) {
    if (this.state !== "run") return;
    const next = Phaser.Math.Clamp(this.laneIndex + dir, 0, 2);
    if (next === this.laneIndex) return;
    this.laneIndex = next;

    this.tweens.add({
      targets: this.player,
      x: this.laneX[this.laneIndex],
      duration: 90,
      ease: "Sine.easeOut",
    });
  }

  tryJump() {
    if (this.state !== "run") return;
    const onGround = this.player.body.blocked.down || Math.abs(this.player.y - this.scale.height*0.78) < 8;
    if (!onGround || this.isSliding) return;

    this.player.setVelocityY(-1050);
    this.sfx.jump.play();
  }

  trySlide() {
    if (this.state !== "run") return;
    const onGround = this.player.body.blocked.down || Math.abs(this.player.y - this.scale.height*0.78) < 10;
    if (!onGround || this.isSliding) return;

    this.isSliding = true;
    this.sfx.slide.play();

    this.player.body.setSize(60, 60).setOffset(34, 58);

    this.time.delayedCall(420, () => {
      this.isSliding = false;
      this.player.body.setSize(44, 92).setOffset(42, 28);
    });
  }

  spawnSomething() {
    const spawnY = -120;

    const t = Phaser.Math.Clamp((this.speed - this.baseSpeed) / (this.speedMax - this.baseSpeed), 0, 1);
    const obstacleChance = Phaser.Math.Linear(0.55, 0.82, t);
    const roll = Math.random();
    const allowMulti = t > 0.35 && Math.random() < 0.22;

    if (roll < obstacleChance) {
      if (allowMulti) {
        const openLane = Phaser.Math.Between(0,2);
        for (let lane=0; lane<3; lane++) {
          if (lane === openLane) continue;
          this.spawnBarrier(lane, spawnY);
        }
      } else {
        const lane = Phaser.Math.Between(0,2);
        const typeRoll = Math.random();
        if (typeRoll < Phaser.Math.Linear(0.75, 0.55, t)) this.spawnBarrier(lane, spawnY);
        else this.spawnOverhead(lane, spawnY);
      }
    } else {
      const lane = Phaser.Math.Between(0,2);
      const count = Phaser.Math.Between(3, 6);
      for (let i=0; i<count; i++) {
        const tok = this.tokens.create(this.laneX[lane], spawnY - i*90, "token");
        tok.setDepth(12);
        tok.body.setCircle(18, 14, 14);
      }
    }
  }

  spawnBarrier(lane, y) {
    const b = this.obstacles.create(this.laneX[lane], y, "barrier");
    b.setDepth(11);
    b.body.setSize(70, 62).setOffset(13, 28);
  }

  spawnOverhead(lane, y) {
    const o = this.obstacles.create(this.laneX[lane], y, "overhead");
    o.setDepth(11);
    o.body.setSize(112, 30).setOffset(8, 20);
  }

  onToken(_, token) {
    token.destroy();
    this.score += 25;
    this.sfx.pickup.play();
  }

  onHit() {
    if (this.state !== "run") return;
    this.state = "over";

    this.cameras.main.flash(90, 255, 255, 255);
    this.cameras.main.shake(140, 0.006);
    this.sfx.hit.play();

    if (this.spawnTimer) this.spawnTimer.remove(false);

    this.time.delayedCall(180, () => {
      this.physics.pause();

      if (this.score > this.best) {
        this.best = this.score;
        localStorage.setItem("runner_best", String(this.best));
      }
      this.finalScoreText.setText(`SCORE: ${Math.floor(this.score)}`);
      this.bestScoreText.setText(`BEST: ${Math.floor(this.best)}`);
      this.overGroup.setVisible(true);
    });
  }

  restart() {
    this.physics.resume();
    this.obstacles.clear(true, true);
    this.tokens.clear(true, true);

    this.overGroup.setVisible(false);
    this.state = "start";
    this.score = 0;
    this.speed = this.baseSpeed;
    this.scoreText.setText("0");

    this.laneIndex = 1;
    this.player.setPosition(this.laneX[this.laneIndex], this.scale.height*0.78);
    this.player.setVelocity(0,0);
    this.player.play("run");

    this.titleText.setVisible(true);
    this.subtitleText.setVisible(true);

    this.spawnTimer = null;
    this.stepAccumulator = 0;
  }

  shareScore() {
    const score = Math.floor(this.score);
    const text = encodeURIComponent(`I ran ${score} in RUNNER 🏃‍♂️💨\nCan you beat it?`);
    const url = encodeURIComponent(window.location.href);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank");
  }

  update(_, dtMs) {
    const dt = dtMs / 1000;

    const drawLaneLines = (vy, alpha) => {
      for (const L of this.road.lines) {
        L.g.clear();
        L.offset = (L.offset + vy) % 90;
        L.g.lineStyle(6, 0xffffff, alpha);
        for (let y= -90 + L.offset; y < this.scale.height + 90; y += 90) {
          L.g.beginPath();
          L.g.moveTo(L.x, y);
          L.g.lineTo(L.x, y + 48);
          L.g.strokePath();
        }
      }
    };

    if (this.state === "run") {
      if (Phaser.Input.Keyboard.JustDown(this.cursors.left) || Phaser.Input.Keyboard.JustDown(this.keys.A)) this.moveLane(-1);
      if (Phaser.Input.Keyboard.JustDown(this.cursors.right) || Phaser.Input.Keyboard.JustDown(this.keys.D)) this.moveLane(1);
      if (Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.keys.W)) this.tryJump();
      if (Phaser.Input.Keyboard.JustDown(this.cursors.down) || Phaser.Input.Keyboard.JustDown(this.keys.S)) this.trySlide();

      this.speed = Math.min(this.speedMax, this.speed + this.speedRampPerSec * dt * 60);

      this.score += (this.speed * dt) * 0.03;
      this.scoreText.setText(String(Math.floor(this.score)));

      const vy = this.speed * dt;

      this.obstacles.children.iterate((o) => { if (!o) return; o.y += vy; if (o.y > this.scale.height + 200) o.destroy(); });
      this.tokens.children.iterate((t) => { if (!t) return; t.y += vy; if (t.y > this.scale.height + 200) t.destroy(); });

      drawLaneLines(vy, 0.35);

      // speed lines
      this.speedLines.clear();
      const t = Phaser.Math.Clamp((this.speed - this.baseSpeed) / (this.speedMax - this.baseSpeed), 0, 1);
      const alpha = Phaser.Math.Linear(0.0, 0.22, t);
      if (alpha > 0.02) {
        this.speedLines.lineStyle(2, 0xffffff, alpha);
        for (let i=0; i<10; i++) {
          const x = Phaser.Math.Between(40, this.scale.width-40);
          const y1 = Phaser.Math.Between(0, this.scale.height);
          const len = Phaser.Math.Between(120, 260);
          this.speedLines.beginPath();
          this.speedLines.moveTo(x, y1);
          this.speedLines.lineTo(x, y1 + len);
          this.speedLines.strokePath();
        }
      }

      // footsteps
      this.stepAccumulator += dt;
      const tt = Phaser.Math.Clamp((this.speed - this.baseSpeed) / (this.speedMax - this.baseSpeed), 0, 1);
      const stepRate = Phaser.Math.Linear(this.stepInterval, 0.18, tt);
      if (this.stepAccumulator >= stepRate) {
        this.stepAccumulator = 0;
        if (this.player.body.blocked.down && !this.isSliding) this.sfx.step.play();
      }
    } else if (this.state === "start") {
      drawLaneLines(220 * dt, 0.28);
    }
  }
}

const config = {
  type: Phaser.AUTO,
  parent: "game",
  width: 900,
  height: 1600,
  backgroundColor: "#000000",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: {
    default: "arcade",
    arcade: { gravity: { y: 2400 }, debug: false },
  },
  scene: [BootScene, GameScene],
};

new Phaser.Game(config);
