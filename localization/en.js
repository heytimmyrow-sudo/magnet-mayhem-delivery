export const STRINGS = {
  meta: {
    title: "Magnet Mayhem Delivery"
  },
  loading: {
    title: "Magnet Mayhem Delivery",
    status: "Preparing the factory...",
    ready: "Ready"
  },
  title: {
    eyebrow: "Arcade-puzzle factory runs",
    description: "Flip the room's polarity, herd a fragile metal package, and reach the delivery chute before the factory gets too spicy.",
    play: "Play",
    levels: "Levels",
    expansions: "Expansion Packs",
    fullscreen: "Toggle fullscreen",
    settings: "Settings",
    exportSave: "Export Save",
    importSave: "Import Save"
  },
  menu: {
    back: "Back",
    baseGame: "Base Game",
    levelSelect: "Level Select",
    updateSafe: "Update-safe content",
    expansions: "Expansion Packs",
    play: "Play",
    locked: "Locked",
    comingSoon: "Coming soon",
    noTime: "No time yet",
    target: "Target {time}s - {best}",
    levelSummary: "{count} levels - {percent}% - {earned}/{possible} stamps"
  },
  hud: {
    level: "Level {number}: {name}",
    time: "Time",
    durability: "Package durability",
    north: "NORTH",
    south: "SOUTH",
    skip: "Skip",
    restart: "Restart level",
    pause: "Pause game",
    polarity: "Flip polarity"
  },
  settings: {
    title: "Settings",
    sound: "Sound effects",
    music: "Music pulse",
    shake: "Screen shake",
    done: "Done",
    restore: "Restore Backup Save",
    reset: "Reset Progress",
    resetConfirm: "Reset all Magnet Mayhem Delivery progress on this browser? A backup will be kept before deleting.",
    restoreConfirm: "Restore the backup save for Magnet Mayhem Delivery? Current progress will be replaced after the backup is validated.",
    restoreSuccess: "Backup save restored.",
    restoreFailure: "The backup save could not be restored.",
    importSuccess: "Save imported.",
    importFailure: "That save file was not valid JSON progress."
  },
  overlay: {
    pausedTitle: "Paused",
    pausedBody: "Factory time is stopped. Your package is exactly as anxious as you left it.",
    resume: "Resume",
    restart: "Restart",
    levels: "Levels",
    deliveryComplete: "Delivery Complete",
    next: "Next",
    factoryResults: "Factory Results",
    finalTime: "Final time",
    targetTime: "Target time",
    previousBest: "Previous best",
    none: "None",
    newBest: "New best: {time}s",
    bestRemains: "Best remains: {time}s",
    packageDurability: "Package durability",
    runStamps: "Run stamps",
    bestStamps: "Best stamps",
    progress: "Progress",
    progressValue: "Level {current} of {total}",
    factoryCleared: "Factory Cleared",
    factoryClearedBody: "Every base-game delivery is complete. Future expansion slots are already wired in.",
    titleScreen: "Title"
  },
  game: {
    defaultMessage: "Deliver the robot and package to the green chute.",
    pickupTip: "Press E to pick up",
    carryTip: "Press E to toss or drop",
    polarityTip: "Press F to flip polarity",
    deliveryTip: "Reach the green SHIP chute",
    packageLineFailure: "The package line ate the delivery.",
    robotScrambled: "The robot got scrambled.",
    packageDestroyed: "Package destroyed by {reason}.",
    damageReasons: {
      hardImpact: "a hard impact",
      spikes: "spikes",
      electric: "electricity",
      crusher: "a crusher"
    },
    ship: "SHIP",
    pull: "PULL",
    push: "PUSH",
    tutorialStep: "Step {current} of {total}"
  },
  mobile: {
    controls: "Touch controls",
    moveZone: "Drag left or right to move",
    actionZone: "Tap to jump; touch the package to carry or throw",
    tutorialTitle: "Touch controls",
    move: "Drag the left side to move.",
    jump: "Tap the right side to jump.",
    package: "Tap the package to pick up or drop it.",
    throw: "Hold the package, aim, and release to throw.",
    polarity: "Use the N/S button to flip polarity.",
    dismiss: "Got it"
  },
  tutorials: {
    training_pickup: [
      { id: "move", text: "Move to the package.", key: "A / D" },
      { id: "pickup", text: "Press E to pick up the package.", key: "E" },
      { id: "carry", text: "Carry the package to the green SHIP chute.", key: "D" },
      { id: "deliver", text: "Enter the chute with both robot and package.", key: "SHIP" }
    ],
    first_flip: [
      { id: "drop", text: "Drop the package near the magnet.", key: "E" },
      { id: "flip", text: "Press F to flip polarity.", key: "F" },
      { id: "watch", text: "Watch PUSH become PULL and follow the arrow.", key: "PUSH/PULL" },
      { id: "deliver", text: "Deliver both robot and package.", key: "SHIP" }
    ]
  },
  levels: {
    training_pickup: { name: "Pick Up And Ship", hint: "Walk to the package. Press E to carry it. Bring it into the green SHIP chute." },
    first_flip: { name: "First Flip", hint: "Drop the package near the red magnet. Press F: red pushes it away, blue pulls it back." },
    magnet_lift: { name: "Magnet Lift", hint: "Blue polarity pulls metal toward red magnets. Use F to lift the package onto the ledge." },
    soft_spikes: { name: "Spike Detour", hint: "Spikes hurt the package. Flip polarity to slide the loose package over safe metal platforms." },
    polarity_door: { name: "Door Switch", hint: "Doors show the color that opens them. Flip to blue to open this door." },
    moving_bridge: { name: "Moving Bridge", hint: "Some platforms are magnetic. Flip to move the bridge into place, then cross." },
    plate_gate: { name: "Plate Gate", hint: "Drop the package or a box on green plates to open linked gates." },
    moving_charge: { name: "Moving Charge", hint: "Moving hazards are readable and slow at first. Time the run, then flip to move the package." },
    throw_lane: { name: "Throw Lane", hint: "Tap E while carrying to toss the package. Magnets help catch and redirect it." },
    crusher_intro: { name: "Crusher Intro", hint: "Crushers damage the package. Wait for the downbeat, then move both robot and package through." },
    electric_choice: { name: "Electric Choice", hint: "Electric barriers turn on by polarity. The dim barrier is safe; the bright one hurts." },
    box_button: { name: "Box Button", hint: "Metal boxes react to magnets too. Flip polarity to shove the box onto the plate." },
    combo_bridge: { name: "Combo Bridge", hint: "Combine the tricks: move the bridge, protect the package, and choose safe polarity." },
    combo_gate: { name: "Combo Gate", hint: "Use the box for the plate, then flip polarity to ferry the package through the gate." },
    final_sort: { name: "Final Sort", hint: "Final delivery: every flip should move something. Watch the arrows and take it one room at a time." }
  },
  expansions: {
    base_game: { name: "Base Game", description: "Fifteen short factory deliveries that teach polarity flipping, package handling, hazards, and compact puzzle routes." },
    factory_after_dark: { name: "Factory After Dark", description: "Night-shift routes with shutters, searchlights, and stronger magnetic pulses." },
    frozen_warehouse: { name: "Frozen Warehouse", description: "Slippery floors and chilly conveyor puzzles for careful package control." },
    zero_gravity_shipping: { name: "Zero-Gravity Shipping", description: "Orbital shipping bays where polarity nudges everything through low gravity." },
    robot_recycling_center: { name: "Robot Recycling Center", description: "Compressed scrap mazes with crushers, plates, and magnetic box chains." },
    future_pack_slot_01: { name: "Future Pack Slot", description: "Reserved for a later delivery district." }
  }
};

export function text(path, values = {}) {
  const value = path.split(".").reduce((current, key) => current?.[key], STRINGS);
  if (typeof value !== "string") return path;
  return value.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
}

export function applyDocumentText(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = text(element.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-aria]").forEach((element) => {
    element.setAttribute("aria-label", text(element.dataset.i18nAria));
  });
  document.title = STRINGS.meta.title;
}

export const levelText = (id) => STRINGS.levels[id];
export const expansionText = (id) => STRINGS.expansions[id];
