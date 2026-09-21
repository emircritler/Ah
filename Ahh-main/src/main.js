import Phaser from 'phaser';
import VirtualJoyStickPlugin from 'phaser3-rex-plugins/plugins/virtualjoystick-plugin.js';

const ASSET_BASE = import.meta.env.BASE_URL;

const FRAME_W = 64;
const FRAME_H = 64;
const ANIMAL_FRAME_W = 32;
const ANIMAL_FRAME_H = 32;
const ATTACK_COLUMNS = 8;
const ATTACK_ROWS = 4;
const ATTACK_FRAME_W = FRAME_W;
const ATTACK_FRAME_H = FRAME_H;
const ATTACK_ROW_BY_DIRECTION = {
  front: 0,
  side_left: 1,
  side_right: 2,
  back: 3
};
const SWORD_IDLE_COLUMNS = 12;
const SWORD_WALK_COLUMNS = 6;
const SWORD_RUN_COLUMNS = 8;
const STANDARD_DISPLAY_W = 64;
const STANDARD_DISPLAY_H = 64;
const STANDARD_HITBOX_W = 32;
const STANDARD_HITBOX_H = 48;
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 2000;
const PLAYER_SPEED = 150;
const RUN_SPEED = 240;
const MAX_PLAYER_HEALTH = 100;
const ANIMAL_DEFS = {
  fox: {
    actions: { idle: 4, walk: 6, run: 6, hurt: 4, death: 6 },
    atlasFiles: { idle: 'Fox_Idle.png', walk: 'Fox_walk.png', run: 'Fox_Run.png', hurt: 'Fox_Hurt.png', death: 'Fox_Death.png' },
    scale: 1.35,
    speed: 62
  },
  hare: {
    actions: { idle: 4, walk: 5, run: 6, hurt: 4, death: 6 },
    atlasFiles: { idle: 'Hare_Idle.png', walk: 'Hare_Walk.png', run: 'Hare_Run.png', hurt: 'Hare_Hurt.png', death: 'Hare_Death.png' },
    scale: 1.15,
    speed: 82
  },
  deer: {
    actions: { idle: 4, walk: 6, run: 6, hurt: 4, death: 7 },
    atlasFiles: { idle: 'Deer_Idle.png', walk: 'Deer_Walk.png', run: 'Deer_Run.png', hurt: 'Deer_Hurt.png', death: 'Deer_Death.png' },
    scale: 1.45,
    speed: 72
  },
  black_grouse: {
    actions: { idle: 4, walk: 6, run: 0, flight: 6, hurt: 4, death: 6 },
    atlasFiles: { idle: 'Black_grouse_Idle.png', walk: 'Black_grouse_Walk.png', flight: 'Black_grouse_Flight.png', hurt: 'Black_grouse_Hurt.png', death: 'Black_grouse_Death.png' },
    scale: 1.15,
    speed: 68
  },
  boar: {
    actions: { idle: 4, walk: 6, run: 5, attack: 5, hurt: 4, death: 6 },
    atlasFiles: { idle: 'Boar_Idle.png', walk: 'Boar_Walk.png', run: 'Boar_Run.png', attack: 'Boar_Attack.png', hurt: 'Boar_Hurt.png', death: 'Boar_Death.png' },
    scale: 1.35,
    speed: 64,
    attackDamage: 8
  }
};
const ANIMAL_DIRECTIONS = {
  front: 0,
  back: 1,
  side_left: 2,
  side_right: 3
};

class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene');
    this.currentWeapon = 'unarmed';
    this.isAttacking = false;
    this.lastDirection = 1;
    this.lastFacing = 'front';
    this.attackHitLock = false;
    this.attackRange = 90;
    this.attackTimer = null;
    this.animals = [];
    this.playerHealth = MAX_PLAYER_HEALTH;
    this.playerHurtTimer = null;
    this.playerLevel = 1;
    this.playerXp = 0;
    this.playerXpToNext = 100;
    this.displayedXpRatio = 0;
    this.xpProgressTween = null;
    this.inventoryOpen = false;
    this.killCount = 0;
  }

  preload() {
    this.load.on('loaderror', (file) => {
      console.warn('Asset load error:', file.key || file.src || 'unknown');
    });

    this.load.spritesheet('sword_attack_atlas', `${ASSET_BASE}assets/sword_attack_atlas.png`, {
      frameWidth: ATTACK_FRAME_W,
      frameHeight: ATTACK_FRAME_H
    });
    this.load.spritesheet('sword_idle_atlas', `${ASSET_BASE}assets/sword_idle_atlas.png`, {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H
    });
    this.load.spritesheet('sword_walk_atlas', `${ASSET_BASE}assets/sword_walk_atlas.png`, {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H
    });
    this.load.spritesheet('sword_run_atlas', `${ASSET_BASE}assets/sword_run_atlas.png`, {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H
    });
    this.load.spritesheet('unarmed_idle_atlas', `${ASSET_BASE}assets/unarmed_idle_atlas.png`, {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H
    });
    this.load.spritesheet('unarmed_walk_atlas', `${ASSET_BASE}assets/unarmed_walk_atlas.png`, {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H
    });
    this.load.spritesheet('unarmed_run_atlas', `${ASSET_BASE}assets/unarmed_run_atlas.png`, {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H
    });

    Object.entries(ANIMAL_DEFS).forEach(([species, definition]) => {
      Object.entries(definition.atlasFiles).forEach(([action, fileName]) => {
        if (!definition.actions[action]) {
          return;
        }

        this.load.spritesheet(
          `animal_${species}_${action}_atlas`,
          `${ASSET_BASE}assets/animal_${species}_${action}_atlas.png`,
          { frameWidth: ANIMAL_FRAME_W, frameHeight: ANIMAL_FRAME_H }
        );
      });
    });

    Object.keys(ANIMAL_DIRECTIONS).forEach((direction) => {
      this.load.spritesheet(
        `unarmed_hurt_${direction}`,
        `${ASSET_BASE}assets/unarmed_hurt_${direction}.png`,
        { frameWidth: FRAME_W, frameHeight: FRAME_H }
      );
    });
  }

  safePlayAnimation(target, animationKey, fallbackKey = 'idle_unarmed') {
    if (!target || !target.anims) {
      return false;
    }

    const resolvedAnimationKey = this.anims.exists(animationKey)
      ? animationKey
      : fallbackKey && this.anims.exists(fallbackKey)
        ? fallbackKey
        : null;

    if (resolvedAnimationKey) {
      target.setVisible(true);
      target.setAlpha(1);
      if (target.anims.currentAnim?.key !== resolvedAnimationKey || !target.anims.isPlaying) {
        target.anims.play(resolvedAnimationKey, true);
      }
      return true;
    }

    return false;
  }

  getDirectionKey(vx, vy) {
    if (Math.abs(vx) > Math.abs(vy)) {
      return vx >= 0 ? 'side_right' : 'side_left';
    }
    if (Math.abs(vy) > 0) {
      return vy >= 0 ? 'front' : 'back';
    }
    return this.lastFacing || 'front';
  }

  updateFacingFromVelocity(vx, vy) {
    this.lastFacing = this.getDirectionKey(vx, vy);
    this.player.setFlipX(false);
    this.player.setFlipY(false);
  }

  playMovementAnimation(vx, vy) {
    if (!this.player || !this.player.body) {
      return;
    }

    if (this.isAttacking || this.playerHurtTimer) {
      return;
    }

    const moveSpeed = Math.hypot(vx, vy);
    const weaponSuffix = this.currentWeapon === 'sword' ? 'sword' : 'unarmed';
    const directionKey = this.getDirectionKey(vx, vy);

    if (moveSpeed <= 8) {
      this.lastFacing = directionKey;
      const idleKey = `${weaponSuffix}_idle_${directionKey}`;
      this.safePlayAnimation(this.player, idleKey, `${weaponSuffix}_idle_front`);
      return;
    }

    this.updateFacingFromVelocity(vx, vy);

    const action = moveSpeed >= RUN_SPEED * 0.75 ? 'run' : 'walk';
    const animationKey = `${weaponSuffix}_${action}_${this.lastFacing}`;
    const fallbackKey = `${weaponSuffix}_idle_${this.lastFacing}`;
    this.safePlayAnimation(this.player, animationKey, fallbackKey);
  }

  playIdleAnimation() {
    if (this.isAttacking || this.playerHurtTimer) {
      return;
    }

    const weaponSuffix = this.currentWeapon === 'sword' ? 'sword' : 'unarmed';
    const directionKey = this.lastFacing || 'front';
    const idleKey = `${weaponSuffix}_idle_${directionKey}`;
    this.player.setFlipX(false);
    this.player.setFlipY(false);
    this.safePlayAnimation(this.player, idleKey, `${weaponSuffix}_idle_front`);
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.roundPixels = true;

    const ground = this.add.graphics();
    ground.fillStyle(0x3a8f5b, 1);
    ground.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    ground.setDepth(0);

    const grassPatch = this.add.graphics();
    grassPatch.fillStyle(0x4dbb6a, 0.2);

    for (let i = 0; i < 30; i += 1) {
      const x = Phaser.Math.Between(0, WORLD_WIDTH - 150);
      const y = Phaser.Math.Between(0, WORLD_HEIGHT - 150);
      grassPatch.fillRoundedRect(x, y, 120, 120, 12);
    }

    grassPatch.setDepth(1);

    this.createAnimations();

    this.lastFacing = 'front';
    this.player = this.physics.add.sprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 'unarmed_idle_front');
    this.player.setOrigin(0.5, 0.5);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    this.player.setScale(1.25);
    this.player.setDisplaySize(STANDARD_DISPLAY_W, STANDARD_DISPLAY_H);
    this.setPlayerHitbox();
    this.player.setVisible(true);
    this.player.setAlpha(1);
    this.player.body.setMaxVelocity(RUN_SPEED, RUN_SPEED);
    this.player.body.setBoundsRectangle(new Phaser.Geom.Rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT));

    this.createAnimals();

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);
    this.cameras.main.setZoom(1.25);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    });
    this.attackKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.uiCamera = this.cameras.add();
    this.uiCamera.setBackgroundColor('rgba(0,0,0,0)');
    this.uiCamera.setRoundPixels(true);
    this.uiCamera.setScroll(0, 0);
    this.uiCamera.setZoom(1);

    this.uiCamera.ignore(this.children.list);
    this.uiContainer = this.add.container();
    this.uiContainer.setScrollFactor(0);
    this.cameras.main.ignore(this.uiContainer);

    this.createMobileControls();
    this.createPremiumHud();
    this.createInventoryPanel();

    this.player.on('animationcomplete', (anim) => {
      if (anim.key && anim.key.startsWith('sword_attack_')) {
        this.finishAttack();
      }

      if (anim.key && anim.key.startsWith('unarmed_hurt_')) {
        this.playerHurtTimer = null;
        this.playIdleAnimation();
      }
    });

    this.lastFacing = 'front';
    this.player.setFlipX(false);
    this.player.setFlipY(false);
    this.safePlayAnimation(this.player, 'unarmed_idle_front', 'unarmed_idle_front');
    this.scale.on('resize', this.resizeUi, this);
    this.resizeUi();
  }

  createAnimations() {
    const animationDefs = [];

    const actionColumns = {
      idle: SWORD_IDLE_COLUMNS,
      walk: SWORD_WALK_COLUMNS,
      run: SWORD_RUN_COLUMNS
    };
    ['sword', 'unarmed'].forEach((weapon) => {
      ['idle', 'walk', 'run'].forEach((action) => {
        const textureKey = `${weapon}_${action}_atlas`;
        const frameRate = action === 'run' ? 12 : action === 'walk' ? 10 : 8;
        const columns = actionColumns[action];
        ['back', 'front', 'side_left', 'side_right'].forEach((direction) => {
          const row = ATTACK_ROW_BY_DIRECTION[direction];
          const key = `${weapon}_${action}_${direction}`;
          const start = row * columns;
          animationDefs.push([key, textureKey, start, start + columns - 1, frameRate, -1]);
        });
      });
    });

    ['back', 'front', 'side_left', 'side_right'].forEach((direction) => {
      const row = ATTACK_ROW_BY_DIRECTION[direction];
      const textureKey = 'sword_attack_atlas';
      const key = `sword_attack_${direction}`;
      if (!this.textures.exists(textureKey) || row === undefined) {
        return;
      }

      const start = row * ATTACK_COLUMNS;
      animationDefs.push([key, textureKey, start, start + ATTACK_COLUMNS - 1, 10, 0]);
    });

    animationDefs.forEach(([key, textureKey, start, end, frameRate, repeat]) => {
      if (!this.textures.exists(textureKey)) {
        return;
      }

      if (!this.anims.exists(key)) {
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(textureKey, { start, end }),
          frameRate,
          repeat
        });
      }
    });

    Object.entries(ANIMAL_DEFS).forEach(([species, definition]) => {
      Object.entries(definition.actions).forEach(([action, columns]) => {
        if (!columns) {
          return;
        }

        Object.keys(ANIMAL_DIRECTIONS).forEach((direction) => {
          const key = `animal_${species}_${action}_${direction}`;
          const textureKey = `animal_${species}_${action}_atlas`;
          const row = ANIMAL_DIRECTIONS[direction];
          if (!this.textures.exists(textureKey) || this.anims.exists(key)) {
            return;
          }

          this.anims.create({
            key,
            frames: this.anims.generateFrameNumbers(textureKey, {
              start: row * columns,
              end: row * columns + columns - 1
            }),
            frameRate: action === 'run' || action === 'flight' ? 12 : action === 'walk' ? 10 : 8,
            repeat: action === 'hurt' || action === 'death' || action === 'attack' ? 0 : -1
          });
        });
      });
    });

    Object.keys(ANIMAL_DIRECTIONS).forEach((direction) => {
      const key = `unarmed_hurt_${direction}`;
      if (!this.textures.exists(key) || this.anims.exists(key)) {
        return;
      }

      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: 3 }),
        frameRate: 10,
        repeat: 0
      });
    });
  }

  createAnimals() {
    const spawnPlan = [
      ['fox', 2],
      ['hare', 2],
      ['deer', 2],
      ['black_grouse', 2],
      ['boar', 2]
    ];

    spawnPlan.forEach(([species, count]) => {
      for (let index = 0; index < count; index += 1) {
        const definition = ANIMAL_DEFS[species];
        const sprite = this.physics.add.sprite(
          Phaser.Math.Between(180, WORLD_WIDTH - 180),
          Phaser.Math.Between(180, WORLD_HEIGHT - 180),
          `animal_${species}_idle_atlas`
        );
        const animal = {
          species,
          definition,
          sprite,
          health: species === 'boar' ? 45 : 25,
          maxHealth: species === 'boar' ? 45 : 25,
          direction: 'front',
          nextDecisionAt: 0,
          attackCooldownAt: 0,
          hurtUntil: 0,
          attacking: false,
          dead: false
        };

        const displaySize = STANDARD_DISPLAY_W * (definition.scale / 1.35);
        sprite.setDisplaySize(displaySize, displaySize);
        sprite.setDepth(5);
        sprite.body.setAllowGravity(false);
        sprite.body.setCollideWorldBounds(true);
        sprite.body.setSize(34, 38);
        sprite.body.setOffset(15, 20);
        sprite.setData('animal', animal);
        this.animals.push(animal);
        this.playAnimalAnimation(animal, 'idle');
        this.chooseAnimalDirection(animal, 0);
      }
    });
  }

  playAnimalAnimation(animal, action) {
    const key = `animal_${animal.species}_${action}_${animal.direction}`;
    const fallback = `animal_${animal.species}_idle_${animal.direction}`;
    this.safePlayAnimation(animal.sprite, key, fallback);
  }

  chooseAnimalDirection(animal, time) {
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const speed = animal.definition.speed * Phaser.Math.FloatBetween(0.8, 1.15);
    animal.sprite.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    animal.nextDecisionAt = time + Phaser.Math.Between(1400, 3600);
    animal.direction = this.getDirectionKey(animal.sprite.body.velocity.x, animal.sprite.body.velocity.y);
  }

  updateAnimalDirection(animal) {
    const { x, y } = animal.sprite.body.velocity;
    if (Math.abs(x) > 1 || Math.abs(y) > 1) {
      animal.direction = this.getDirectionKey(x, y);
    }
  }

  updateAnimals(time) {
    this.animals.forEach((animal) => {
      if (animal.dead) {
        return;
      }

      const sprite = animal.sprite;
      if (animal.hurtUntil > time) {
        sprite.setVelocity(0, 0);
        this.playAnimalAnimation(animal, 'hurt');
        return;
      }

      if (animal.attacking) {
        sprite.setVelocity(0, 0);
        return;
      }

      const distanceToPlayer = Phaser.Math.Distance.Between(sprite.x, sprite.y, this.player.x, this.player.y);
      if (animal.definition.attackDamage && distanceToPlayer < 120 && animal.attackCooldownAt <= time) {
        animal.attacking = true;
        animal.attackCooldownAt = time + 1800;
        this.playAnimalAnimation(animal, 'attack');
        this.time.delayedCall(380, () => {
          if (!animal.dead && Phaser.Math.Distance.Between(sprite.x, sprite.y, this.player.x, this.player.y) < 135) {
            this.takePlayerDamage(animal.definition.attackDamage);
          }
        });
        this.time.delayedCall(800, () => {
          animal.attacking = false;
          animal.nextDecisionAt = this.time.now;
        });
        return;
      }

      if (animal.nextDecisionAt <= time || sprite.body.speed < 1) {
        this.chooseAnimalDirection(animal, time);
      }

      this.updateAnimalDirection(animal);
      const action = sprite.body.speed > animal.definition.speed * 1.08 ? 'run' : 'walk';
      const resolvedAction = ANIMAL_DEFS[animal.species].actions[action] ? action : animal.species === 'black_grouse' && sprite.body.speed > 70 ? 'flight' : 'walk';
      this.playAnimalAnimation(animal, resolvedAction);
      sprite.setDepth(5 + sprite.y / WORLD_HEIGHT * 4);
    });
  }

  setPlayerHitbox() {
    if (!this.player?.body) {
      return;
    }

    this.player.body.setSize(STANDARD_HITBOX_W, STANDARD_HITBOX_H);
    this.player.body.setOffset(
      (this.player.width - STANDARD_HITBOX_W) / 2,
      (this.player.height - STANDARD_HITBOX_H) / 2
    );
  }

  finishAttack() {
    this.isAttacking = false;

    if (this.attackTimer) {
      this.attackTimer.remove(false);
      this.attackTimer = null;
    }

    this.playIdleAnimation();
    this.setPlayerHitbox();
  }

  createMobileControls() {
    const width = this.scale.width;
    const height = this.scale.height;

    const joystickBase = this.add.circle(0, 0, 72, 0x111111, 0.35).setStrokeStyle(4, 0xffffff, 0.85);
    const joystickThumb = this.add.circle(0, 0, 26, 0xffffff, 0.9);
    this.joystick = this.plugins.get('rexVirtualJoystick').add(this, {
      x: 120,
      y: height - 120,
      radius: 72,
      base: joystickBase,
      thumb: joystickThumb,
      fixed: true
    });

    this.uiContainer.add([joystickBase, joystickThumb]);

    this.attackButton = this.createActionButton('ATTACK', width - 118, height - 118, 48, 0x1f8fff, () => {
      this.triggerAttack();
    }, 'sword');

    this.inventoryButton = this.createActionButton('BAG', width - 48, 44, 26, 0x2a6174, () => {
      this.toggleInventory();
    }, 'bag');

    this.equipButton = this.createActionButton('EQUIP', width - 118, height - 210, 42, 0x7b4dff, () => {
      this.currentWeapon = this.currentWeapon === 'sword' ? 'unarmed' : 'sword';
      this.updateEquipButtonLabel();
      const idleKey = `${this.currentWeapon === 'sword' ? 'sword' : 'unarmed'}_idle_${this.lastFacing || 'front'}`;
      if (!this.isAttacking) {
        this.safePlayAnimation(this.player, idleKey, `${this.currentWeapon === 'sword' ? 'sword' : 'unarmed'}_idle_front`);
      }
    }, 'shield');

    this.updateEquipButtonLabel();
  }

  createActionButton(labelText, x, y, radius, color, onPress, iconType = labelText.toLowerCase()) {
    const container = this.add.container(x, y);
    const bg = this.add.circle(0, 0, radius, color, 0.85).setStrokeStyle(4, 0xffffff, 0.9);
    const icon = this.createButtonIcon(iconType, radius);
    const label = this.add.text(0, radius * 0.58, labelText === 'ATTACK' ? 'HIT' : labelText === 'EQUIP' ? 'GEAR' : '', {
      fontSize: radius > 38 ? '9px' : '8px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);

    container.add([bg, icon, label]);
    container.setScrollFactor(0);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      bg.setStrokeStyle(4, 0xffe6a1, 1);
      this.tweens.add({ targets: container, scale: 1.06, duration: 120, ease: 'Quad.easeOut' });
    });
    bg.on('pointerout', () => {
      bg.setStrokeStyle(4, 0xffffff, 0.9);
      this.tweens.add({ targets: container, scale: 1, duration: 120, ease: 'Quad.easeOut' });
    });
    bg.on('pointerdown', () => {
      this.tweens.add({ targets: container, scale: 0.9, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
      onPress();
    });
    bg.on('pointerup', () => {});

    this.uiContainer.add(container);
    this.cameras.main.ignore(container);
    return { container, bg, icon, label };
  }

  createButtonIcon(type, radius) {
    const icon = this.add.graphics();
    icon.lineStyle(Math.max(2, radius / 18), 0xffffff, 0.95);
    icon.fillStyle(0xffffff, 0.95);

    if (type === 'sword') {
      icon.lineBetween(-radius * 0.25, radius * 0.22, radius * 0.25, -radius * 0.28);
      icon.lineBetween(-radius * 0.34, radius * 0.1, -radius * 0.1, radius * 0.34);
      icon.lineBetween(-radius * 0.3, radius * 0.26, -radius * 0.12, radius * 0.42);
    } else if (type === 'bag') {
      icon.strokeRoundedRect(-radius * 0.32, -radius * 0.18, radius * 0.64, radius * 0.55, radius * 0.1);
      icon.arc(0, -radius * 0.16, radius * 0.2, 180, 360, false);
      icon.lineBetween(-radius * 0.18, radius * 0.04, radius * 0.18, radius * 0.04);
    } else if (type === 'x') {
      icon.lineBetween(-radius * 0.24, -radius * 0.24, radius * 0.24, radius * 0.24);
      icon.lineBetween(radius * 0.24, -radius * 0.24, -radius * 0.24, radius * 0.24);
    } else if (type === 'potion') {
      icon.fillRoundedRect(-radius * 0.2, -radius * 0.05, radius * 0.4, radius * 0.42, radius * 0.08);
      icon.fillRect(-radius * 0.12, -radius * 0.3, radius * 0.24, radius * 0.18);
    } else if (type === 'boots') {
      icon.fillRoundedRect(-radius * 0.2, -radius * 0.32, radius * 0.28, radius * 0.58, radius * 0.08);
      icon.fillRoundedRect(-radius * 0.02, radius * 0.08, radius * 0.42, radius * 0.2, radius * 0.08);
    } else if (type === 'mark') {
      icon.fillCircle(0, 0, radius * 0.28);
      icon.lineBetween(0, -radius * 0.45, 0, radius * 0.45);
      icon.lineBetween(-radius * 0.45, 0, radius * 0.45, 0);
    } else {
      icon.beginPath();
      icon.moveTo(0, -radius * 0.38);
      icon.lineTo(radius * 0.3, -radius * 0.18);
      icon.lineTo(radius * 0.24, radius * 0.22);
      icon.lineTo(0, radius * 0.38);
      icon.lineTo(-radius * 0.24, radius * 0.22);
      icon.lineTo(-radius * 0.3, -radius * 0.18);
      icon.closePath();
      icon.strokePath();
    }

    return icon;
  }

  updateEquipButtonLabel() {
    if (!this.equipButton) {
      return;
    }
    const text = this.currentWeapon === 'sword' ? 'UNEQUIP' : 'EQUIP';
    this.equipButton.label.setText(text);
  }

  createPremiumHud() {
    const panelWidth = Math.min(300, this.scale.width - 32);
    this.hudContainer = this.add.container(0, 0);
    this.uiContainer.add(this.hudContainer);

    const panel = this.add.graphics();
    panel.fillStyle(0x08111f, 0.94);
    panel.fillRoundedRect(16, 16, panelWidth, 116, 18);
    panel.lineStyle(1, 0x4f7898, 0.85);
    panel.strokeRoundedRect(16, 16, panelWidth, 116, 18);
    this.hudContainer.add(panel);

    this.levelBadge = this.add.graphics();
    this.levelBadge.fillStyle(0xf2b84b, 1);
    this.levelBadge.fillCircle(47, 51, 22);
    this.levelBadge.lineStyle(2, 0xffe8a3, 0.95);
    this.levelBadge.strokeCircle(47, 51, 22);
    this.hudContainer.add(this.levelBadge);

    this.levelText = this.add.text(47, 51, '1', {
      fontFamily: 'Georgia, serif',
      fontSize: '19px',
      color: '#251b09',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.hudContainer.add(this.levelText);

    this.rankText = this.add.text(78, 30, 'WANDERER', {
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
      color: '#d9e8f0',
      fontStyle: 'bold'
    });
    this.hudContainer.add(this.rankText);

    this.hpLabel = this.add.text(78, 52, '', {
      fontSize: '11px',
      color: '#b8cbd6'
    });
    this.hudContainer.add(this.hpLabel);
    this.hpBar = this.add.graphics();
    this.hudContainer.add(this.hpBar);

    this.xpLabel = this.add.text(78, 86, '', {
      fontSize: '11px',
      color: '#b8cbd6'
    });
    this.hudContainer.add(this.xpLabel);
    this.xpBar = this.add.graphics();
    this.hudContainer.add(this.xpBar);

    this.killText = this.add.text(78, 111, '', {
      fontSize: '10px',
      color: '#83a8b8'
    });
    this.hudContainer.add(this.killText);

    this.levelUpText = this.add.text(this.scale.width / 2, 146, '', {
      fontFamily: 'Georgia, serif',
      fontSize: '28px',
      color: '#ffe7a0',
      fontStyle: 'bold',
      stroke: '#3e2411',
      strokeThickness: 5
    }).setOrigin(0.5).setAlpha(0);
    this.uiContainer.add(this.levelUpText);
    this.updateHealthDisplay();
    this.updateXpDisplay();
  }

  drawProgressBar(graphics, x, y, width, height, progress, fillColor, glowColor) {
    graphics.clear();
    graphics.fillStyle(0x152433, 1);
    graphics.fillRoundedRect(x, y, width, height, height / 2);
    graphics.fillStyle(glowColor, 0.25);
    graphics.fillRoundedRect(x, y, width, height, height / 2);
    if (progress > 0) {
      graphics.fillStyle(fillColor, 1);
      graphics.fillRoundedRect(x, y, Math.max(3, width * progress), height, height / 2);
    }
  }

  updateHealthDisplay() {
    if (!this.hpBar) {
      return;
    }

    const healthRatio = Phaser.Math.Clamp(this.playerHealth / MAX_PLAYER_HEALTH, 0, 1);
    this.hpLabel.setText(`HP  ${Math.max(0, this.playerHealth)} / ${MAX_PLAYER_HEALTH}`);
    this.drawProgressBar(this.hpBar, 78, 68, 214, 10, healthRatio, 0x52d273, 0x52d273);
    this.killText.setText(`HUNTS  ${this.killCount}`);
  }

  updateXpDisplay() {
    if (!this.xpBar) {
      return;
    }

    const xpRatio = Phaser.Math.Clamp(this.playerXp / this.playerXpToNext, 0, 1);
    this.xpLabel.setText(`XP  ${this.playerXp} / ${this.playerXpToNext}`);
    if (this.xpProgressTween) {
      this.xpProgressTween.stop();
    }
    this.xpProgressTween = this.tweens.addCounter({
      from: this.displayedXpRatio,
      to: xpRatio,
      duration: 520,
      ease: 'Cubic.easeOut',
      onUpdate: (tween) => {
        this.displayedXpRatio = tween.getValue();
        this.drawProgressBar(this.xpBar, 78, 101, 214, 7, this.displayedXpRatio, 0x5fd9ef, 0x5fd9ef);
      },
      onComplete: () => {
        this.displayedXpRatio = xpRatio;
        this.xpProgressTween = null;
      }
    });
    this.levelText.setText(String(this.playerLevel));
  }

  createInventoryPanel() {
    const width = Math.min(320, this.scale.width - 28);
    const height = 276;
    const backdrop = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x020711, 0.58).setOrigin(0);
    backdrop.setInteractive();
    backdrop.on('pointerdown', () => this.toggleInventory());
    backdrop.setVisible(false);
    this.uiContainer.add(backdrop);
    this.inventoryBackdrop = backdrop;

    const panel = this.add.container(this.scale.width - width - 14, 76);
    const background = this.add.graphics();
    background.fillStyle(0x091522, 0.98);
    background.fillRoundedRect(0, 0, width, height, 18);
    background.lineStyle(1, 0x517b92, 0.9);
    background.strokeRoundedRect(0, 0, width, height, 18);
    panel.add(background);

    const title = this.add.text(22, 18, 'INVENTORY', {
      fontFamily: 'Georgia, serif',
      fontSize: '18px',
      color: '#e7f4f7',
      fontStyle: 'bold'
    });
    panel.add(title);
    const subtitle = this.add.text(22, 43, 'FIELD LOADOUT', {
      fontSize: '10px',
      color: '#6f9bae'
    });
    panel.add(subtitle);

    const items = [
      ['SWORD', 'ATK 20', 0xf2b84b, 'sword'],
      ['POTION', 'HP +25', 0xe87979, 'potion'],
      ['BOOTS', 'SPD +5', 0x77b9d8, 'boots'],
      ['MARK', 'XP +10%', 0xb48cf2, 'mark']
    ];
    items.forEach(([name, detail, color, iconType], index) => {
      const x = 20 + (index % 2) * ((width - 52) / 2 + 12);
      const y = 76 + Math.floor(index / 2) * 76;
      const slot = this.add.graphics();
      slot.fillStyle(0x112436, 1);
      slot.fillRoundedRect(x, y, (width - 52) / 2, 60, 12);
      slot.lineStyle(1, 0x27475c, 1);
      slot.strokeRoundedRect(x, y, (width - 52) / 2, 60, 12);
      slot.fillStyle(color, 1);
      slot.fillCircle(x + 25, y + 30, 13);
      panel.add(slot);
      const itemIcon = this.createButtonIcon(iconType, 13);
      itemIcon.setPosition(x + 25, y + 30);
      panel.add(itemIcon);
      panel.add(this.add.text(x + 46, y + 15, name, {
        fontSize: '10px',
        color: '#e3f0f2',
        fontStyle: 'bold'
      }));
      panel.add(this.add.text(x + 46, y + 32, detail, {
        fontSize: '9px',
        color: '#7fa8b8'
      }));
    });

    panel.setVisible(false);
    this.uiContainer.add(panel);
    this.inventoryPanel = panel;
    this.inventoryPanelWidth = width;
    this.inventoryCloseButton = this.createActionButton('', this.scale.width - 44, 98, 17, 0x18364a, () => {
      this.toggleInventory();
    }, 'x');
    this.inventoryCloseButton.container.setVisible(false);
  }

  toggleInventory() {
    this.inventoryOpen = !this.inventoryOpen;
    this.inventoryBackdrop.setVisible(this.inventoryOpen);
    this.inventoryPanel.setVisible(this.inventoryOpen);
    this.inventoryCloseButton.container.setVisible(this.inventoryOpen);
  }

  awardExperience(animal) {
    const rewards = { fox: 28, hare: 24, deer: 42, black_grouse: 30, boar: 65 };
    let gained = rewards[animal.species] || 25;
    this.playerXp += gained;
    this.killCount += 1;

    while (this.playerXp >= this.playerXpToNext) {
      this.playerXp -= this.playerXpToNext;
      this.playerLevel += 1;
      this.playerXpToNext = Math.round(this.playerXpToNext * 1.28);
      this.showLevelUp();
    }

    this.updateHealthDisplay();
    this.updateXpDisplay();
    this.tweens.add({
      targets: this.xpBar,
      alpha: 0.45,
      duration: 120,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut'
    });
    const rewardText = this.add.text(this.player.x, this.player.y - 54, `+${gained} XP`, {
      fontSize: '14px',
      color: '#80e4f3',
      fontStyle: 'bold',
      stroke: '#08202c',
      strokeThickness: 3
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({
      targets: rewardText,
      y: rewardText.y - 34,
      alpha: 0,
      duration: 900,
      onComplete: () => rewardText.destroy()
    });
  }

  showLevelUp() {
    this.levelUpText.setText(`LEVEL ${this.playerLevel}`);
    this.levelUpText.setPosition(this.scale.width / 2, 146);
    this.levelUpText.setAlpha(1);
    this.levelUpText.setScale(0.65);
    this.tweens.add({
      targets: this.levelUpText,
      scale: 1,
      alpha: 0,
      y: 120,
      duration: 1300,
      ease: 'Cubic.easeOut'
    });
    this.tweens.add({
      targets: this.levelBadge,
      scale: 1.25,
      yoyo: true,
      duration: 180,
      repeat: 2,
      ease: 'Sine.easeInOut'
    });
  }

  resizeUi() {
    const width = this.scale.width;
    const height = this.scale.height;

    if (this.joystick) {
      this.joystick.setPosition(120, height - 120);
    }

    if (this.attackButton) {
      this.attackButton.container.setPosition(width - 118, height - 118);
    }

    if (this.equipButton) {
      this.equipButton.container.setPosition(width - 118, height - 210);
    }

    if (this.inventoryButton) {
      this.inventoryButton.container.setPosition(width - 48, 44);
    }

    if (this.inventoryPanel) {
      this.inventoryPanel.setPosition(width - this.inventoryPanelWidth - 14, 76);
    }

    if (this.inventoryBackdrop) {
      this.inventoryBackdrop.setSize(width, height);
    }

    if (this.inventoryCloseButton) {
      this.inventoryCloseButton.container.setPosition(width - 44, 98);
    }

    if (this.levelUpText) {
      this.levelUpText.setPosition(width / 2, 146);
    }

    if (this.uiCamera) {
      this.uiCamera.setViewport(0, 0, width, height);
    }
  }

  triggerAttack() {
    if (this.isAttacking) {
      return;
    }

    if (this.currentWeapon !== 'sword') {
      return;
    }

    this.isAttacking = true;
    this.attackHitLock = false;
    this.pulseActionButton(this.attackButton);
    this.player.setVisible(true);
    this.player.setAlpha(1);
    this.player.setOrigin(0.5, 0.5);
    this.setPlayerHitbox();
    const attackDirection = this.lastFacing || 'front';
    const attackKey = `sword_attack_${attackDirection}`;
    const fallbackKey = 'sword_attack_front';
    const attackStarted = this.safePlayAnimation(this.player, attackKey, fallbackKey);

    if (!attackStarted) {
      this.finishAttack();
      return;
    }

    this.attackTimer = this.time.delayedCall(1200, () => {
      if (this.isAttacking) {
        this.finishAttack();
      }
    });
  }

  checkAttackHit() {
    if (this.attackHitLock || !this.animals.length) {
      return;
    }

    const target = this.animals.find((animal) => {
      if (animal.dead) {
        return false;
      }
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, animal.sprite.x, animal.sprite.y);
      return distance <= this.attackRange;
    });

    if (target) {
      this.attackHitLock = true;
      this.damageAnimal(target, 20);
    }
  }

  damageAnimal(animal, amount) {
    if (animal.dead) {
      return;
    }

    animal.health -= amount;
    animal.hurtUntil = this.time.now + 450;
    animal.sprite.setVelocity(0, 0);
    animal.sprite.setTint(0xff7777);
    this.playAnimalAnimation(animal, animal.health <= 0 ? 'death' : 'hurt');
    this.cameras.main.shake(90, 0.0025);
    const damageText = this.add.text(animal.sprite.x, animal.sprite.y - 42, `-${amount}`, {
      fontSize: '15px',
      color: '#ff9b8e',
      fontStyle: 'bold',
      stroke: '#34141a',
      strokeThickness: 3
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({
      targets: damageText,
      y: damageText.y - 28,
      alpha: 0,
      duration: 620,
      onComplete: () => damageText.destroy()
    });

    this.time.delayedCall(120, () => {
      animal.sprite.clearTint();
    });

    if (animal.health <= 0) {
      animal.dead = true;
      animal.attacking = false;
      animal.sprite.body.enable = false;
      this.awardExperience(animal);
      this.time.delayedCall(700, () => {
        animal.sprite.setVisible(false);
      });
      this.time.delayedCall(6000, () => {
        animal.health = animal.maxHealth;
        animal.dead = false;
        animal.hurtUntil = 0;
        animal.sprite.setVisible(true);
        animal.sprite.body.enable = true;
        animal.sprite.setPosition(
          Phaser.Math.Between(180, WORLD_WIDTH - 180),
          Phaser.Math.Between(180, WORLD_HEIGHT - 180)
        );
        this.chooseAnimalDirection(animal, this.time.now);
      });
    }
  }

  pulseActionButton(button) {
    if (!button?.container) {
      return;
    }

    this.tweens.add({
      targets: button.container,
      scale: 1.16,
      duration: 110,
      yoyo: true,
      ease: 'Quad.easeOut'
    });
    this.tweens.add({
      targets: button.bg,
      alpha: 0.55,
      duration: 90,
      yoyo: true,
      repeat: 2
    });
  }

  takePlayerDamage(amount) {
    if (this.playerHurtTimer || this.isAttacking) {
      return;
    }

    this.playerHealth = Math.max(0, this.playerHealth - amount);
    this.updateHealthDisplay();
    this.playerHurtTimer = this.time.delayedCall(550, () => {
      this.playerHurtTimer = null;
      this.playIdleAnimation();
    });
    this.player.setTint(0xff5555);
    this.safePlayAnimation(this.player, `unarmed_hurt_${this.lastFacing}`, 'unarmed_hurt_front');
    this.time.delayedCall(180, () => this.player.clearTint());

    if (this.playerHealth <= 0) {
      this.playerHealth = MAX_PLAYER_HEALTH;
      this.updateHealthDisplay();
      this.player.setPosition(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    }
  }

  update() {
    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;

    const keyboardDx = (right ? 1 : 0) - (left ? 1 : 0);
    const keyboardDy = (down ? 1 : 0) - (up ? 1 : 0);

    if (Phaser.Input.Keyboard.JustDown(this.attackKey)) {
      this.triggerAttack();
    }

    this.updateAnimals(this.time.now);

    if (this.playerHurtTimer) {
      this.player.setVelocity(0, 0);
      return;
    }

    let vx = 0;
    let vy = 0;
    let moveSpeed = PLAYER_SPEED;
    let usingJoystick = false;

    if (this.joystick && this.joystick.force > 5) {
      const force = this.joystick.force;
      const magnitude = Phaser.Math.Clamp(force / this.joystick.radius, 0, 1);
      const nx = this.joystick.forceX / Math.max(1, force);
      const ny = this.joystick.forceY / Math.max(1, force);
      vx = nx * (magnitude > 0.7 ? RUN_SPEED : PLAYER_SPEED);
      vy = ny * (magnitude > 0.7 ? RUN_SPEED : PLAYER_SPEED);
      moveSpeed = magnitude > 0.7 ? RUN_SPEED : PLAYER_SPEED;
      usingJoystick = true;
    } else if (keyboardDx !== 0 || keyboardDy !== 0) {
      const keyboardMagnitude = Math.hypot(keyboardDx, keyboardDy);
      vx = (keyboardDx / keyboardMagnitude) * PLAYER_SPEED;
      vy = (keyboardDy / keyboardMagnitude) * PLAYER_SPEED;
      moveSpeed = PLAYER_SPEED;
    }

    if (this.isAttacking) {
      this.player.setVelocity(0, 0);
      const frameIndex = this.player.anims.currentFrame ? this.player.anims.currentFrame.index % ATTACK_COLUMNS : 0;
      if (frameIndex >= 3 && frameIndex <= 5 && !this.attackHitLock) {
        this.checkAttackHit();
      }
      return;
    }

    if (Math.abs(vx) > 0 || Math.abs(vy) > 0) {
      this.player.setVelocity(vx, vy);
      this.playMovementAnimation(vx, vy);
      return;
    }

    this.player.setVelocity(0, 0);

    if (usingJoystick && this.joystick.force <= 5) {
      this.playIdleAnimation();
      return;
    }

    this.playIdleAnimation();
  }
}

const config = {
  type: Phaser.WEBGL,
  parent: 'app',
  backgroundColor: '#0b2414',
  pixelArt: true,
  render: {
    antialias: false,
    roundPixels: true
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      gravity: { y: 0 }
    }
  },
  scale: {
    width: window.innerWidth,
    height: window.innerHeight,
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  fps: {
    target: 60,
    forceSetTimeOut: false
  },
  plugins: {
    global: [{ key: 'rexVirtualJoystick', plugin: VirtualJoyStickPlugin, start: true }]
  },
  scene: [MainScene]
};

window.addEventListener('resize', () => {
  if (window.__phaserGame) {
    window.__phaserGame.scale.resize(window.innerWidth, window.innerHeight);
  }
});

window.__phaserGame = new Phaser.Game(config);
