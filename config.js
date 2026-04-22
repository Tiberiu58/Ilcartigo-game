export const ARENA_LAYOUTS = {
  switchyard: {
    // A compact arena with a recognizable center lane, looping side routes,
    // and staggered wall islands that act as fast cover.
    map: [
      "#################",
      "#...#.......#...#",
      "#.#.#.##.##.#.#.#",
      "#.#...#...#...#.#",
      "#...#..#.#..#...#",
      "###....#.#....###",
      "#...............#",
      "###....#.#....###",
      "#...#..#.#..#...#",
      "#.#...#...#...#.#",
      "#.#.#.##.##.#.#.#",
      "#...#.......#...#",
      "#################",
    ],
    playerSpawn: { x: 2.5, z: 6.5 },
    enemyRoutes: [
      [
        { x: 14.5, z: 1.5 },
        { x: 11.5, z: 1.5 },
        { x: 13.5, z: 4.5 },
      ],
      [
        { x: 8.5, z: 1.5 },
        { x: 5.5, z: 4.5 },
        { x: 11.5, z: 4.5 },
      ],
      [
        { x: 2.5, z: 11.5 },
        { x: 5.5, z: 9.5 },
        { x: 3.5, z: 8.5 },
      ],
      [
        { x: 14.5, z: 11.5 },
        { x: 11.5, z: 9.5 },
        { x: 13.5, z: 8.5 },
      ],
    ],
  },
}

const ACTIVE_ARENA = ARENA_LAYOUTS.switchyard

export const WORLD_CONFIG = {
  // Size of each walkable grid cell in world units.
  cellSize: 4,
  // Height of the indoor walls.
  wallHeight: 3.2,
  // Base floor height used by the level and collision code.
  floorY: 0,
  // Active arena key so layouts are easy to swap later.
  arenaKey: "switchyard",
  map: ACTIVE_ARENA.map,
  playerSpawn: ACTIVE_ARENA.playerSpawn,
  enemyRoutes: ACTIVE_ARENA.enemyRoutes,
}

export const GAMEPLAY_CONFIG = {
  loop: {
    // Score awarded for landing a non-lethal hit.
    hitScore: 10,
    // Score awarded for securing a kill.
    killScore: 100,
    // Score awarded when a wave is fully cleared.
    waveClearScore: 150,
    // Time window for chaining kills into a streak.
    comboWindow: 2.8,
    // Bonus added per extra chained kill.
    comboStepScore: 25,
    // Safety cap so combo bonuses stay readable and lightweight.
    comboMaxBonus: 150,
  },
  abilities: {
    teleport: {
      // Activation range in world units.
      range: 8.5,
      // Ignore tiny point-blank hops so the skill stays intentional.
      minRange: 1.2,
      // Telegraph the blink long enough to read in combat.
      castTime: 1.5,
      // Cooldown after a successful teleport.
      cooldown: 5.5,
      // Keep the preview slightly away from walls to avoid clipping.
      wallBuffer: 0.48,
      // Small extra clearance check around the player capsule.
      clearancePadding: 0.04,
      // Visual height of the targeting pillar.
      previewHeight: 1.2,
      // Brief completion pulse duration.
      completionPulseTime: 0.16,
    },
  },
  player: {
    collision: {
      // Capsule radius used for wall collision.
      radius: 0.34,
      // Full player height used for ceiling checks.
      height: 1.75,
      // Small inset to avoid sticky edge contact.
      collisionInset: 0.02,
      // Collision trace step size for smooth wall sliding.
      collisionStep: 0.05,
    },
    movement: {
      // Normal grounded move speed.
      walkSpeed: 9,
      // Sprint move speed.
      sprintSpeed: 13.1,
      // Ground acceleration toward the target velocity.
      groundAcceleration: 56,
      // Ground slowdown when movement input is released.
      groundDeceleration: 52,
      // Extra acceleration when reversing or hard turning.
      groundTurnAcceleration: 72,
      // Air acceleration applied while steering mid-jump.
      airAcceleration: 20,
      // How much existing air momentum can be redirected.
      airControl: 3.5,
      // Target speed used by air acceleration.
      airMoveSpeed: 9.1,
      // Hard cap on horizontal air speed.
      airSpeedCap: 13.8,
      // Base gravity strength.
      gravity: 40,
      // Extra gravity while falling to reduce floatiness.
      fallGravityMultiplier: 1.32,
      // Extra gravity when jump is released early.
      lowJumpGravityMultiplier: 1.78,
      // Initial upward jump force.
      jumpSpeed: 11.1,
      // Grace period after leaving ground where jump still works.
      coyoteTime: 0.08,
      // Input buffer so jump can trigger slightly before landing.
      jumpBufferTime: 0.1,
    },
    camera: {
      // Eye height relative to the player's feet position.
      eyeHeight: 1.58,
      // Mouse sensitivity multiplier.
      mouseSensitivity: 0.0021,
      // Flip vertical look when true.
      invertLookY: false,
      // Clamp huge pointer spikes from focus changes.
      maxLookDeltaPerFrame: 90,
      // Max up/down look angle in radians.
      maxPitch: 1.42,
      // Head bob frequency while moving.
      bobSpeed: 11.8,
      // Vertical bob amount.
      bobAmount: 0.009,
      // Smoothing used for bob visual easing.
      bobSmoothing: 14,
      // Side-to-side bob amount.
      bobSideAmount: 0.0055,
      // Small landing dip amount.
      landingImpactAmount: 0.016,
      // Landing impact recovery speed.
      landingImpactSmoothing: 18,
    },
    stats: {
      // Starting and maximum player health.
      maxHealth: 100,
    },
  },
  weapon: {
    ammo: {
      // Rounds per magazine.
      clipSize: 24,
      // Total reserve ammo at the start of a run.
      reserveAmmo: 96,
      // Total reload duration in seconds.
      reloadTime: 1.24,
    },
    combat: {
      // Delay between shots in seconds.
      fireInterval: 0.078,
      // Damage per hitscan shot.
      damage: 34,
      // Maximum rifle range.
      range: 120,
      // Base hip-fire spread.
      hipSpread: 0.0022,
      // Extra spread while moving.
      moveSpread: 0.0038,
      // Extra spread added by recoil.
      recoilSpread: 0.00065,
      // Upward recoil kick applied to the camera.
      recoilPitch: 0.0095,
      // Random horizontal recoil range.
      recoilYaw: 0.0028,
      // Speed that recoil settles back down.
      recoilRecover: 22,
      // Visual weapon kick on fire.
      visualKickStrength: 1.05,
    },
    feedback: {
      // Muzzle flash visibility time.
      muzzleFlashTime: 0.065,
      // Muzzle flash mesh scale.
      muzzleFlashSize: 1,
      // Base crosshair spacing.
      crosshairBaseGap: 9,
      // Extra crosshair spacing from movement.
      crosshairMoveGap: 12,
      // Extra crosshair spacing from recoil.
      crosshairRecoilGap: 2.7,
      // Extra spacing while reloading.
      crosshairReloadGap: 4,
    },
    viewmodel: {
      // How much the weapon bobs with camera movement.
      viewmodelBobAmount: 0.03,
      // Side drift while strafing.
      viewmodelStrafeAmount: 0.026,
      // Roll amount while strafing.
      viewmodelStrafeTilt: 0.05,
      // Viewmodel motion smoothing.
      viewmodelSmoothing: 16,
      // Backward positional recoil.
      recoilPositionKick: 0.1,
      // Rotational recoil amount.
      recoilRotationKick: 0.12,
    },
    reload: {
      // Fraction of the reload reserved for the start pull-down.
      startWindow: 0.24,
      // Fraction of the reload where the fresh magazine is seated.
      insertWindow: 0.68,
      // How far the weapon dips during the reload.
      weaponDrop: 0.15,
      // Side drift applied while reloading.
      weaponSideOffset: 0.045,
      // Forward pullback applied while reloading.
      weaponPullback: 0.1,
      // Downward tilt applied at the start and middle of the reload.
      weaponTiltPitch: 0.26,
      // Roll applied while the weapon is canted for reload readability.
      weaponTiltRoll: 0.2,
      // How far the magazine drops out during the middle beat.
      magazineDrop: 0.2,
      // Small completion snap when the reload finishes.
      completionKick: 0.045,
      // Speed of the completion settle so the weapon feels snappy again.
      completionRecover: 20,
    },
  },
  enemy: {
    movement: {
      // Collision radius for enemy movement.
      radius: 0.42,
      // Passive patrol speed.
      patrolSpeed: 2.9,
      // Chase speed once the player is spotted.
      chaseSpeed: 5.35,
      // Additional chase speed added each wave.
      speedPerWave: 0.15,
    },
    combat: {
      // Enemy health pool.
      health: 100,
      // Extra enemy health gained each wave.
      healthPerWave: 8,
      // Sight range used for detection.
      detectDistance: 26,
      // Range where enemies stop and attack.
      attackDistance: 1.55,
      // Damage dealt per enemy attack.
      attackDamage: 12,
      // Extra damage gained each wave.
      attackDamagePerWave: 1,
      // Time between enemy attacks.
      attackCooldown: 0.9,
      // Fastest allowed attack cooldown after scaling.
      attackCooldownFloor: 0.62,
      // How long enemies remember the player after losing sight.
      memoryTime: 2.2,
      // Duration of enemy hurt feedback flash.
      hurtFlashTime: 0.18,
    },
    waves: {
      // Delay before the next wave starts.
      waveDelay: 1.8,
      // Maximum number of active enemies at once.
      maxWaveSize: 4,
    },
    presentation: {
      // Slight scale boost for quick target readability.
      readableScale: 1.08,
    },
  },
}

export const WEAPON_LIBRARY = {
  rifle: {
    // Stable id used by menus now and lobbies later.
    id: "rifle",
    // User-facing label.
    name: "Rifle",
    // Short flavor text for the loadout screen.
    description: "Balanced automatic rifle with clean recoil and dependable damage.",
    // Procedural material colors for the shared lightweight viewmodel.
    colors: {
      body: "#384555",
      trim: "#5a7089",
      grip: "#1a1f27",
    },
    stats: {
      damage: 34,
      fireRate: 0.078,
      recoil: 1.05,
      reloadTime: 1.24,
      clipSize: 24,
      reserveAmmo: 96,
      hipSpread: 0.0022,
      moveSpread: 0.0038,
      recoilSpread: 0.00065,
      recoilPitch: 0.0095,
      recoilYaw: 0.0028,
    },
  },
  carbine: {
    id: "carbine",
    name: "Carbine",
    description: "Fast-handling option with softer recoil and a quicker reload.",
    colors: {
      body: "#304252",
      trim: "#7db9cf",
      grip: "#172029",
    },
    stats: {
      damage: 28,
      fireRate: 0.068,
      recoil: 0.82,
      reloadTime: 1.02,
      clipSize: 30,
      reserveAmmo: 120,
      hipSpread: 0.0025,
      moveSpread: 0.0041,
      recoilSpread: 0.00055,
      recoilPitch: 0.0082,
      recoilYaw: 0.0022,
    },
  },
  bruiser: {
    id: "bruiser",
    name: "Bruiser",
    description: "Harder-hitting heavy rifle with slower follow-up shots and a longer reload.",
    colors: {
      body: "#4a3d46",
      trim: "#d89c70",
      grip: "#211a1f",
    },
    stats: {
      damage: 42,
      fireRate: 0.11,
      recoil: 1.28,
      reloadTime: 1.4,
      clipSize: 18,
      reserveAmmo: 72,
      hipSpread: 0.002,
      moveSpread: 0.0034,
      recoilSpread: 0.00085,
      recoilPitch: 0.0108,
      recoilYaw: 0.0032,
    },
  },
}

export const LOADOUT_CONFIG = {
  // Default primary weapon when no menu choice has been made yet.
  defaultPrimaryWeaponId: "rifle",
  // Available primaries shown in the current single-player loadout screen.
  primaryWeaponIds: ["rifle", "carbine", "bruiser"],
}

export const PLAYER_CONFIG = {
  ...GAMEPLAY_CONFIG.player.collision,
  ...GAMEPLAY_CONFIG.player.movement,
  ...GAMEPLAY_CONFIG.player.camera,
  ...GAMEPLAY_CONFIG.player.stats,
}

export const LOOP_CONFIG = {
  ...GAMEPLAY_CONFIG.loop,
}

export const TELEPORT_CONFIG = {
  ...GAMEPLAY_CONFIG.abilities.teleport,
}

export const WEAPON_CONFIG = {
  ...GAMEPLAY_CONFIG.weapon.ammo,
  ...GAMEPLAY_CONFIG.weapon.combat,
  ...GAMEPLAY_CONFIG.weapon.feedback,
  ...GAMEPLAY_CONFIG.weapon.viewmodel,
  ...GAMEPLAY_CONFIG.weapon.reload,
}

export const ENEMY_CONFIG = {
  ...GAMEPLAY_CONFIG.enemy.movement,
  ...GAMEPLAY_CONFIG.enemy.combat,
  ...GAMEPLAY_CONFIG.enemy.waves,
  ...GAMEPLAY_CONFIG.enemy.presentation,
}

export function getWeaponDefinition(weaponId) {
  return WEAPON_LIBRARY[weaponId] || WEAPON_LIBRARY[LOADOUT_CONFIG.defaultPrimaryWeaponId]
}
