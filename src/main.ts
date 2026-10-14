import Phaser from 'phaser';
import './style.css';

class AudioManager {
  private context: AudioContext | null = null;
  private enabled = true;

  init(): void {
    if (!this.context) {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtor) {
        this.context = new AudioCtor();
      }
    }
    if (this.context && this.context.state === 'suspended') {
      void this.context.resume();
    }
  }

  toggle(): void {
    this.enabled = !this.enabled;
    if (this.context && this.enabled && this.context.state === 'suspended') {
      void this.context.resume();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private playTone(frequency: number, duration: number, volume: number, type: OscillatorType, slideTo?: number): void {
    if (!this.context || !this.enabled) return;

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (slideTo) {
      oscillator.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    oscillator.connect(gain);
    gain.connect(this.context.destination);

    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  playJump(): void {
    this.playTone(320, 0.12, 0.07, 'square', 175);
  }

  playCollect(): void {
    this.playTone(540, 0.1, 0.08, 'triangle', 760);
    setTimeout(() => this.playTone(820, 0.08, 0.05, 'triangle', 960), 60);
  }

  playHit(): void {
    this.playTone(120, 0.18, 0.08, 'sawtooth', 55);
  }
}

const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: 960,
  height: 540,
  backgroundColor: '#050b16',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 900 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 540,
  },
  render: {
    pixelArt: true,
    roundPixels: true,
  },
  scene: [],
};

class TitleScene extends Phaser.Scene {
  private audio = new AudioManager();

  constructor() {
    super('TitleScene');
  }

  create(): void {
    this.audio.init();

    const graphics = this.make.graphics({ x: 0, y: 0, add: false });
    graphics.fillStyle(0x081422, 1);
    graphics.fillRect(0, 0, 960, 540);
    graphics.fillStyle(0x132540, 1);
    for (let i = 0; i < 40; i += 1) {
      const x = (i * 67) % 960;
      const y = (i * 31) % 220;
      graphics.fillRect(x, y, 2, 2);
    }
    graphics.generateTexture('titleBg', 960, 540);

    this.add.image(480, 270, 'titleBg');

    const title = this.add.text(480, 150, 'WANDERERS HD', {
      fontFamily: 'Courier New',
      fontSize: '52px',
      color: '#f5e7a1',
      stroke: '#081422',
      strokeThickness: 6,
      align: 'center',
    });
    title.setOrigin(0.5);

    const subtitle = this.add.text(480, 215, 'A pixel frontier in the red dusk', {
      fontFamily: 'Courier New',
      fontSize: '20px',
      color: '#8be9fd',
      stroke: '#081422',
      strokeThickness: 4,
    });
    subtitle.setOrigin(0.5);

    const menu = this.add.text(480, 320, 'PRESS ENTER TO START\nM TO TOGGLE MUSIC', {
      fontFamily: 'Courier New',
      fontSize: '26px',
      color: '#f8fafc',
      stroke: '#081422',
      strokeThickness: 5,
      align: 'center',
      lineSpacing: 20,
    });
    menu.setOrigin(0.5);

    const controls = this.add.text(
      480,
      430,
      'A / D or ← / → = move\nSPACE / W = jump\nCollect relics and avoid the hunters',
      {
        fontFamily: 'Courier New',
        fontSize: '18px',
        color: '#d9f99d',
        stroke: '#081422',
        strokeThickness: 4,
        align: 'center',
        lineSpacing: 8,
      },
    );
    controls.setOrigin(0.5);

    this.input.keyboard.on('keydown-ENTER', () => {
      this.scene.start('GameScene');
    });

    this.input.keyboard.on('keydown-M', () => {
      this.audio.toggle();
    });
  }
}

class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private enemies!: Phaser.Physics.Arcade.Group;
  private collectibles!: Phaser.Physics.Arcade.Group;
  private scoreText!: Phaser.GameObjects.Text;
  private totalCrystals = 0;
  private score = 0;
  private audio = new AudioManager();
  private keyMap!: {
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    w: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
  };
  private levelWidth = 2600;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.audio.init();
    this.cameras.main.setBackgroundColor('#091421');
    this.physics.world.setBounds(0, 0, this.levelWidth, 540);
    this.cameras.main.setBounds(0, 0, this.levelWidth, 540);

    this.createTextures();
    this.createParallaxBackground();
    this.createLevel();
    this.createPlayer();
    this.createEnemies();
    this.createCollectibles();
    this.createHUD();

    this.keyMap = this.input.keyboard.addKeys({
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      w: Phaser.Input.Keyboard.KeyCodes.W,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    }) as typeof this.keyMap;

    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.overlap(this.player, this.collectibles, this.collectCrystal, undefined, this);
    this.physics.add.overlap(this.player, this.enemies, this.hitEnemy, undefined, this);

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
  }

  update(): void {
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    const movingLeft = this.keyMap.a.isDown || this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT).isDown;
    const movingRight = this.keyMap.d.isDown || this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT).isDown;
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.keyMap.w) || Phaser.Input.Keyboard.JustDown(this.keyMap.space);

    if (movingLeft) {
      playerBody.setVelocityX(-210);
      this.player.setFlipX(true);
    } else if (movingRight) {
      playerBody.setVelocityX(210);
      this.player.setFlipX(false);
    } else {
      playerBody.setVelocityX(0);
    }

    if (jumpPressed && playerBody.blocked.down) {
      playerBody.setVelocityY(-360);
      this.audio.playJump();
    }

    if (this.player.y > 620) {
      this.player.setPosition(90, 180);
      this.player.setVelocity(0, 0);
      this.audio.playHit();
    }

    this.enemies.getChildren().forEach((enemy) => {
      const sprite = enemy as Phaser.Physics.Arcade.Sprite;
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      const direction = sprite.getData('direction') as number;
      const minX = sprite.getData('minX') as number;
      const maxX = sprite.getData('maxX') as number;

      body.setVelocityX(direction * 80);

      if (sprite.x <= minX || body.blocked.left) {
        sprite.setData('direction', 1);
      }
      if (sprite.x >= maxX || body.blocked.right) {
        sprite.setData('direction', -1);
      }
    });
  }

  private createParallaxBackground(): void {
    const sky = this.add.tileSprite(0, 0, 960, 540, 'sky').setScrollFactor(0);
    const rear = this.add.tileSprite(0, 280, 960, 200, 'rearMountains').setScrollFactor(0.2);
    const front = this.add.tileSprite(0, 310, 960, 180, 'frontMountains').setScrollFactor(0.45);

    this.add.tween({
      targets: [rear, front],
      x: 20,
      duration: 5000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const fog = this.add.graphics();
    fog.fillStyle(0x7dd3fc, 0.08);
    fog.fillRect(0, 0, 960, 540);
    fog.setScrollFactor(0);
    this.time.addEvent({
      delay: 250,
      callback: () => {
        fog.clear();
        fog.fillStyle(0x7dd3fc, 0.06 + Math.random() * 0.08);
        fog.fillRect(Math.random() * 960, 80 + Math.random() * 200, 150, 40);
      },
      loop: true,
    });

    this.cameras.main.scrollX = 0;
    this.cameras.main.scrollY = 0;
    sky.setDepth(-10);
    rear.setDepth(-9);
    front.setDepth(-8);
  }

  private createTextures(): void {
    const skyG = this.make.graphics({ x: 0, y: 0, add: false });
    skyG.fillStyle(0x081422, 1);
    skyG.fillRect(0, 0, 960, 540);
    for (let i = 0; i < 120; i += 1) {
      const x = Math.random() * 960;
      const y = Math.random() * 220;
      const size = Math.random() > 0.75 ? 3 : 2;
      skyG.fillStyle(Math.random() > 0.5 ? 0xf5e7a1 : 0x7dd3fc, 1);
      skyG.fillRect(x, y, size, size);
    }
    skyG.generateTexture('sky', 960, 540);

    const rearG = this.make.graphics({ x: 0, y: 0, add: false });
    rearG.fillStyle(0x12263d, 1);
    rearG.fillRect(0, 0, 960, 200);
    for (let i = 0; i < 10; i += 1) {
      const x = i * 100;
      const h = 30 + (i % 4) * 22;
      rearG.fillStyle(0x1c3d55, 1);
      rearG.fillTriangle(x, 200, x + 60, 120 - h, x + 120, 200);
    }
    rearG.generateTexture('rearMountains', 960, 200);

    const frontG = this.make.graphics({ x: 0, y: 0, add: false });
    frontG.fillStyle(0x0d1c2d, 1);
    frontG.fillRect(0, 0, 960, 180);
    for (let i = 0; i < 12; i += 1) {
      const x = i * 90;
      const h = 55 + (i % 5) * 16;
      frontG.fillStyle(0x112f45, 1);
      frontG.fillTriangle(x, 180, x + 48, 180 - h, x + 96, 180);
    }
    frontG.generateTexture('frontMountains', 960, 180);

    const playerG = this.make.graphics({ x: 0, y: 0, add: false });
    playerG.fillStyle(0x8be9fd, 1);
    playerG.fillRect(2, 2, 12, 12);
    playerG.fillStyle(0x0f172a, 1);
    playerG.fillRect(4, 6, 2, 2);
    playerG.fillRect(10, 6, 2, 2);
    playerG.fillStyle(0xf8fafc, 1);
    playerG.fillRect(4, 10, 8, 2);
    playerG.generateTexture('player', 16, 16);

    const enemyG = this.make.graphics({ x: 0, y: 0, add: false });
    enemyG.fillStyle(0xff6b6b, 1);
    enemyG.fillRect(2, 3, 12, 10);
    enemyG.fillStyle(0x1a1a1a, 1);
    enemyG.fillRect(4, 6, 2, 2);
    enemyG.fillRect(10, 6, 2, 2);
    enemyG.generateTexture('enemy', 16, 16);

    const crystalG = this.make.graphics({ x: 0, y: 0, add: false });
    crystalG.fillStyle(0xfbbf24, 1);
    crystalG.fillTriangle(8, 0, 15, 14, 8, 24, 1, 14);
    crystalG.fillStyle(0xfee68a, 1);
    crystalG.fillTriangle(8, 0, 8, 24, 1, 14);
    crystalG.generateTexture('crystal', 16, 24);
  }

  private createLevel(): void {
    this.platforms = this.physics.add.staticGroup();

    const groundSegments = [
      { x: 180, y: 470, w: 360, h: 90 },
      { x: 690, y: 470, w: 420, h: 90 },
      { x: 1220, y: 470, w: 420, h: 90 },
      { x: 1760, y: 470, w: 420, h: 90 },
      { x: 2280, y: 470, w: 320, h: 90 },
    ];

    groundSegments.forEach((segment) => {
      const platform = this.add.rectangle(segment.x, segment.y, segment.w, segment.h, 0x1d3a5d);
      this.physics.add.existing(platform, true);
      this.platforms.add(platform);
    });

    const ledges = [
      [300, 380, 120],
      [560, 330, 100],
      [820, 290, 120],
      [1160, 345, 120],
      [1490, 300, 120],
      [1820, 330, 140],
      [2075, 380, 140],
      [2360, 325, 140],
    ] as const;

    ledges.forEach(([x, y, width]) => {
      const ledge = this.add.rectangle(x, y, width, 18, 0x274c77);
      this.physics.add.existing(ledge, true);
      this.platforms.add(ledge);
    });
  }

  private createPlayer(): void {
    this.player = this.physics.add.sprite(90, 340, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setBounce(0);
    this.player.setScale(1.8);
    this.player.setSize(12, 15);
  }

  private createEnemies(): void {
    this.enemies = this.physics.add.group({ allowGravity: true, immovable: false });

    const enemyPositions = [
      { x: 600, y: 430, minX: 500, maxX: 700 },
      { x: 1110, y: 430, minX: 980, maxX: 1250 },
      { x: 1710, y: 430, minX: 1560, maxX: 1830 },
      { x: 2150, y: 430, minX: 2050, maxX: 2325 },
    ];

    enemyPositions.forEach(({ x, y, minX, maxX }) => {
      const enemy = this.physics.add.sprite(x, y, 'enemy');
      enemy.setScale(1.8);
      enemy.setBounce(0);
      enemy.setData('direction', 1);
      enemy.setData('minX', minX);
      enemy.setData('maxX', maxX);
      enemy.setCollideWorldBounds(false);
      this.enemies.add(enemy);
    });
  }

  private createCollectibles(): void {
    this.collectibles = this.physics.add.group({ allowGravity: false, immovable: true });

    const crystalPositions = [
      { x: 280, y: 340 },
      { x: 640, y: 284 },
      { x: 890, y: 245 },
      { x: 1190, y: 300 },
      { x: 1520, y: 255 },
      { x: 1680, y: 295 },
      { x: 1870, y: 290 },
      { x: 2130, y: 336 },
      { x: 2390, y: 275 },
    ];

    crystalPositions.forEach(({ x, y }) => {
      const crystal = this.physics.add.sprite(x, y, 'crystal');
      crystal.setScale(1.2);
      crystal.setTint(0xfbbf24);
      crystal.setData('collected', false);
      this.totalCrystals += 1;
      this.collectibles.add(crystal);
    });
  }

  private createHUD(): void {
    this.scoreText = this.add.text(18, 18, `Relics: 0 / ${this.totalCrystals}`, {
      fontFamily: 'Courier New',
      fontSize: '20px',
      color: '#f5e7a1',
      stroke: '#081422',
      strokeThickness: 5,
    });
    this.scoreText.setScrollFactor(0);
  }

  private collectCrystal = (player: Phaser.GameObjects.GameObject, crystal: Phaser.GameObjects.GameObject): void => {
    const crystalSprite = crystal as Phaser.Physics.Arcade.Sprite;
    if (crystalSprite.getData('collected')) {
      return;
    }

    crystalSprite.setData('collected', true);
    crystalSprite.disableBody(true, true);
    this.score += 1;
    this.scoreText.setText(`Relics: ${this.score} / ${this.totalCrystals}`);
    this.audio.playCollect();

    if (this.score >= this.totalCrystals) {
      const winText = this.add.text(480, 170, 'THE FRONTIER IS YOURS', {
        fontFamily: 'Courier New',
        fontSize: '32px',
        color: '#8be9fd',
        stroke: '#081422',
        strokeThickness: 6,
      });
      winText.setOrigin(0.5);
      winText.setScrollFactor(0);
      this.time.delayedCall(2200, () => this.scene.start('TitleScene'));
    }
  };

  private hitEnemy = (player: Phaser.GameObjects.GameObject, enemy: Phaser.GameObjects.GameObject): void => {
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    if (playerBody && playerBody.velocity.y > 70 && this.player.y < (enemy as Phaser.Physics.Arcade.Sprite).y) {
      (enemy as Phaser.Physics.Arcade.Sprite).destroy();
      this.player.setVelocityY(-250);
      this.audio.playHit();
    } else {
      this.player.setPosition(90, 180);
      this.player.setVelocity(0, 0);
      this.audio.playHit();
    }
  };
}

const game = new Phaser.Game({
  ...gameConfig,
  scene: [TitleScene, GameScene],
});

export default game;
