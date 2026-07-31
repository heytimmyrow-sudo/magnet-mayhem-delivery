import { baseGameLevels } from "../levels/base-game.js";
import { expansionText } from "../localization/en.js";

export const expansionRegistry = [
  {
    id: "base_game",
    ...expansionText("base_game"),
    version: "1.0.0",
    cover: "M",
    availability: "installed",
    levels: baseGameLevels
  },
  {
    id: "factory_after_dark",
    ...expansionText("factory_after_dark"),
    version: "0.1.0",
    cover: "☾",
    availability: "locked",
    levels: []
  },
  {
    id: "frozen_warehouse",
    ...expansionText("frozen_warehouse"),
    version: "0.1.0",
    cover: "*",
    availability: "coming_soon",
    levels: []
  },
  {
    id: "zero_gravity_shipping",
    ...expansionText("zero_gravity_shipping"),
    version: "0.1.0",
    cover: "0G",
    availability: "coming_soon",
    levels: []
  },
  {
    id: "robot_recycling_center",
    ...expansionText("robot_recycling_center"),
    version: "0.1.0",
    cover: "R",
    availability: "locked",
    levels: []
  },
  {
    id: "future_pack_slot_01",
    ...expansionText("future_pack_slot_01"),
    version: "0.0.0",
    cover: "+",
    availability: "coming_soon",
    levels: []
  }
];
