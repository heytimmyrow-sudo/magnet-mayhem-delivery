const W = 960;
const H = 540;
const floor = { x: 0, y: 500, w: W, h: 40 };
const wall = (x, y, w, h) => ({ x, y, w, h });
const mag = (x, y, polarity = 1, strength = 940, r = 320) => ({ x, y, r, polarity, strength });
const spike = (x, y, w = 54) => ({ x, y, w, h: 18, type: "spikes" });
const electric = (x, y, w, h, polarity = 1) => ({ x, y, w, h, type: "electric", activePolarity: polarity });
const crusher = (x, y, w, h, axis = "y", distance = 90, speed = 1) => ({ x, y, w, h, type: "crusher", axis, distance, speed });
const platform = (x, y, w, h, dx, dy, polarity = 1) => ({ x, y, w, h, dx, dy, polarity });
const door = (x, y, w, h, openPolarity = 1) => ({ x, y, w, h, openPolarity });
const box = (x, y) => ({ x, y, w: 40, h: 40 });
const plate = (x, y, id) => ({ x, y, w: 64, h: 12, id });

export const baseGameLevels = [
  {
    id: "training_pickup", name: "Pick Up And Ship", targetTime: 22,
    hint: "Walk to the package. Press E to carry it. Bring it into the green SHIP chute.",
    spawn: { x: 60, y: 430 }, package: { x: 210, y: 452 }, delivery: { x: 790, y: 432, w: 104, h: 68 },
    walls: [floor, wall(0, 0, 20, H), wall(940, 0, 20, H)]
  },
  {
    id: "first_flip", name: "First Flip", targetTime: 28,
    hint: "Drop the package near the red magnet. Press F: red pushes it away, blue pulls it back.",
    spawn: { x: 56, y: 430 }, package: { x: 260, y: 452 }, delivery: { x: 810, y: 432, w: 92, h: 68 },
    walls: [floor],
    magnets: [mag(470, 452, 1, 1060, 405)]
  },
  {
    id: "magnet_lift", name: "Magnet Lift", targetTime: 34,
    hint: "Blue polarity pulls metal toward red magnets. Use F to lift the package onto the ledge.",
    spawn: { x: 52, y: 430 }, package: { x: 126, y: 452 }, delivery: { x: 794, y: 302, w: 104, h: 68 },
    walls: [floor, wall(242, 426, 130, 18), wall(470, 366, 150, 18), wall(720, 370, 214, 18)],
    magnets: [mag(476, 315, 1, 1120, 370), mag(738, 310, -1, 820, 285)]
  },
  {
    id: "soft_spikes", name: "Spike Detour", targetTime: 34,
    hint: "Spikes hurt the package. Flip polarity to move the metal bridge over the spikes before sending the package.",
    spawn: { x: 54, y: 430 }, package: { x: 120, y: 452 }, delivery: { x: 810, y: 432, w: 92, h: 68 },
    walls: [floor, wall(252, 432, 128, 18), wall(690, 430, 226, 18)],
    platforms: [platform(402, 446, 170, 18, 118, 0, 1)],
    magnets: [mag(506, 398, 1, 780, 304)],
    hazards: [spike(568, 482, 76)]
  },
  {
    id: "polarity_door", name: "Door Switch", targetTime: 36,
    hint: "Doors show the color that opens them. Flip to blue to open this door.",
    spawn: { x: 56, y: 430 }, package: { x: 134, y: 452 }, delivery: { x: 800, y: 432, w: 98, h: 68 },
    walls: [floor, wall(260, 420, 120, 18), wall(650, 430, 250, 18)],
    doors: [door(574, 378, 38, 122, -1)],
    magnets: [mag(380, 370, 1, 880, 310)]
  },
  {
    id: "moving_bridge", name: "Moving Bridge", targetTime: 40,
    hint: "Some platforms are magnetic. Flip to move the bridge into place, then cross.",
    spawn: { x: 54, y: 430 }, package: { x: 120, y: 452 }, delivery: { x: 800, y: 258, w: 98, h: 68 },
    walls: [floor, wall(248, 418, 132, 18), wall(682, 326, 238, 18)],
    platforms: [platform(430, 420, 154, 18, 126, -90, 1)],
    magnets: [mag(520, 332, 1, 760, 300)]
  },
  {
    id: "plate_gate", name: "Plate Gate", targetTime: 42,
    hint: "Drop the package or a box on green plates to open linked gates.",
    spawn: { x: 56, y: 430 }, package: { x: 126, y: 452 }, delivery: { x: 806, y: 432, w: 92, h: 68 },
    walls: [floor, wall(228, 420, 120, 18), wall(700, 430, 210, 18)],
    plates: [plate(430, 488, "gate")],
    doors: [door(614, 378, 36, 122, "gate")],
    magnets: [mag(432, 420, 1, 820, 275)]
  },
  {
    id: "moving_charge", name: "Moving Charge", targetTime: 44,
    hint: "Moving hazards are readable and slow at first. Time the run, then flip to move the package.",
    spawn: { x: 54, y: 430 }, package: { x: 122, y: 452 }, delivery: { x: 806, y: 432, w: 92, h: 68 },
    walls: [floor, wall(272, 420, 136, 18), wall(650, 420, 140, 18)],
    movingHazards: [crusher(492, 456, 38, 38, "x", 130, .75)],
    magnets: [mag(350, 365, 1, 840, 300), mag(700, 365, -1, 840, 300)]
  },
  {
    id: "throw_lane", name: "Throw Lane", targetTime: 46,
    hint: "Tap E while carrying to toss the package. Magnets help catch and redirect it.",
    spawn: { x: 54, y: 430 }, package: { x: 124, y: 452 }, delivery: { x: 800, y: 270, w: 100, h: 68 },
    walls: [floor, wall(252, 430, 90, 18), wall(442, 360, 126, 18), wall(700, 340, 220, 18)],
    magnets: [mag(500, 300, 1, 1160, 370), mag(760, 288, -1, 780, 265)],
    hazards: [spike(590, 482, 94)]
  },
  {
    id: "crusher_intro", name: "Crusher Intro", targetTime: 46,
    hint: "Crushers damage the package. Wait for the downbeat, then move both robot and package through.",
    spawn: { x: 54, y: 430 }, package: { x: 122, y: 452 }, delivery: { x: 806, y: 432, w: 92, h: 68 },
    walls: [floor, wall(250, 420, 120, 18), wall(632, 420, 150, 18)],
    hazards: [crusher(455, 350, 76, 40, "y", 96, .8)],
    magnets: [mag(330, 366, 1, 860, 310), mag(690, 366, -1, 860, 310)]
  },
  {
    id: "electric_choice", name: "Electric Choice", targetTime: 48,
    hint: "Electric barriers turn on by polarity. The dim barrier is safe; the bright one hurts.",
    spawn: { x: 54, y: 430 }, package: { x: 126, y: 452 }, delivery: { x: 806, y: 432, w: 92, h: 68 },
    walls: [floor, wall(280, 430, 150, 18), wall(634, 430, 150, 18)],
    hazards: [electric(486, 405, 24, 95, 1), electric(552, 405, 24, 95, -1)],
    magnets: [mag(350, 360, 1, 840, 300), mag(700, 360, -1, 840, 300)]
  },
  {
    id: "box_button", name: "Box Button", targetTime: 50,
    hint: "Metal boxes react to magnets too. Flip polarity to shove the box onto the plate.",
    spawn: { x: 54, y: 430 }, package: { x: 110, y: 452 }, delivery: { x: 806, y: 432, w: 92, h: 68 },
    walls: [floor, wall(220, 438, 118, 18), wall(700, 430, 210, 18)],
    boxes: [box(372, 452)],
    plates: [plate(552, 488, "boxgate")],
    doors: [door(646, 378, 36, 122, "boxgate")],
    magnets: [mag(496, 412, 1, 820, 318)],
    hazards: [spike(464, 482, 50)]
  },
  {
    id: "combo_bridge", name: "Combo Bridge", targetTime: 54,
    hint: "Combine the tricks: move the bridge, protect the package, and choose safe polarity.",
    spawn: { x: 52, y: 430 }, package: { x: 118, y: 452 }, delivery: { x: 798, y: 238, w: 102, h: 70 },
    walls: [floor, wall(230, 430, 120, 18), wall(478, 368, 136, 18), wall(710, 308, 218, 18)],
    platforms: [platform(362, 430, 108, 18, 102, -58, 1)],
    hazards: [spike(620, 482, 78), electric(660, 326, 24, 92, -1)],
    magnets: [mag(438, 330, 1, 980, 345), mag(744, 260, -1, 860, 305)]
  },
  {
    id: "combo_gate", name: "Combo Gate", targetTime: 56,
    hint: "Use the box for the plate, then flip polarity to ferry the package through the gate.",
    spawn: { x: 54, y: 430 }, package: { x: 122, y: 452 }, delivery: { x: 806, y: 432, w: 92, h: 68 },
    walls: [floor, wall(220, 418, 90, 18), wall(718, 430, 190, 18)],
    boxes: [box(382, 452)],
    plates: [plate(510, 488, "finalgate")],
    doors: [door(630, 378, 36, 122, "finalgate")],
    hazards: [crusher(462, 358, 72, 38, "y", 90, .9), spike(318, 482, 64)],
    magnets: [mag(420, 360, 1, 1020, 355), mag(720, 360, -1, 840, 315)]
  },
  {
    id: "final_sort", name: "Final Sort", targetTime: 62,
    hint: "Final delivery: every flip should move something. Watch the arrows and take it one room at a time.",
    spawn: { x: 54, y: 430 }, package: { x: 122, y: 452 }, delivery: { x: 800, y: 230, w: 100, h: 70 },
    walls: [floor, wall(208, 430, 100, 18), wall(390, 366, 118, 18), wall(606, 310, 126, 18), wall(760, 310, 168, 18)],
    platforms: [platform(512, 430, 110, 18, 0, -118, -1)],
    boxes: [box(338, 452)],
    plates: [plate(650, 298, "last")],
    doors: [door(744, 310, 32, 116, "last")],
    hazards: [spike(282, 482, 66), electric(566, 326, 24, 104, 1), crusher(690, 188, 58, 36, "y", 78, .85)],
    magnets: [mag(426, 306, 1, 980, 345), mag(612, 242, -1, 980, 345), mag(822, 236, 1, 780, 285)]
  }
];
