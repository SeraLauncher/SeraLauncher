import anvil from "./assets/images/blocks/anvil.png";
import beacon from "./assets/images/blocks/beacon.png";
import blastFurnace from "./assets/images/blocks/blast_furnace.png";
import bookshelf from "./assets/images/blocks/bookshelf.png";
import chest from "./assets/images/blocks/chest.png";
import commandBlock from "./assets/images/blocks/command_block.png";
import copperBlock from "./assets/images/blocks/copper_block.png";
import craftingTable from "./assets/images/blocks/crafting_table.png";
import creeperHead from "./assets/images/blocks/creeper_head.png";
import diamondBlock from "./assets/images/blocks/diamond_block.png";
import dragonHead from "./assets/images/blocks/dragon_head.png";
import emeraldBlock from "./assets/images/blocks/emerald_block.png";
import enchantingTable from "./assets/images/blocks/enchanting_table.png";
import enderChest from "./assets/images/blocks/ender_chest.png";
import furnace from "./assets/images/blocks/furnace.png";
import goldBlock from "./assets/images/blocks/gold_block.png";
import grassBlock from "./assets/images/blocks/grass_block.png";
import ironBlock from "./assets/images/blocks/iron_block.png";
import lodestone from "./assets/images/blocks/lodestone.png";
import netheriteBlock from "./assets/images/blocks/netherite_block.png";
import noteBlock from "./assets/images/blocks/note_block.png";
import piglinHead from "./assets/images/blocks/piglin_head.png";
import playerHead from "./assets/images/blocks/player_head.png";
import slimeBlock from "./assets/images/blocks/slime_block.png";
import stick from "./assets/images/blocks/stick.png";
import tnt from "./assets/images/blocks/tnt.png";
import zombieHead from "./assets/images/blocks/zombie_head.png";

export const BLOCK_ICONS: Record<string, string> = {
  grass_block: grassBlock,
  crafting_table: craftingTable,
  furnace: furnace,
  blast_furnace: blastFurnace,
  chest: chest,
  ender_chest: enderChest,
  bookshelf: bookshelf,
  enchanting_table: enchantingTable,
  anvil: anvil,
  beacon: beacon,
  lodestone: lodestone,
  diamond_block: diamondBlock,
  emerald_block: emeraldBlock,
  gold_block: goldBlock,
  iron_block: ironBlock,
  copper_block: copperBlock,
  netherite_block: netheriteBlock,
  slime_block: slimeBlock,
  tnt: tnt,
  command_block: commandBlock,
  note_block: noteBlock,
  creeper_head: creeperHead,
  dragon_head: dragonHead,
  piglin_head: piglinHead,
  player_head: playerHead,
  zombie_head: zombieHead,
  stick: stick,
};

export const BLOCK_ICON_KEYS = Object.keys(BLOCK_ICONS);

export function getRandomBlockIconKey(): string {
  const index = Math.floor(Math.random() * BLOCK_ICON_KEYS.length);
  return BLOCK_ICON_KEYS[index] ?? "grass_block";
}

export function getBlockIconSrc(key?: string | null): string {
  if (!key) return BLOCK_ICONS.grass_block;
  // If icon is formatted as "blockKey:gradientName", extract the block key
  const blockKey = key.includes(":") ? key.split(":")[0] : key;
  if (blockKey && BLOCK_ICONS[blockKey]) {
    return BLOCK_ICONS[blockKey];
  }
  return BLOCK_ICONS.grass_block;
}

export interface PastelGradient {
  name: string;
  top: string;
  bottom: string;
}

export const PASTEL_GRADIENTS: PastelGradient[] = [
  { name: "blush", top: "#E8D0CE", bottom: "#C4A5A2" },
  { name: "sage", top: "#D5DEC9", bottom: "#A8B896" },
  { name: "apricot", top: "#ECD8C3", bottom: "#CDB296" },
  { name: "lavender", top: "#DDD2E5", bottom: "#B1A1BC" },
  { name: "sky", top: "#D1E2EC", bottom: "#9EBAC9" },
  { name: "butter", top: "#EFE6C4", bottom: "#CFC194" },
  { name: "rose", top: "#EACCD7", bottom: "#C19EAD" },
  { name: "mint", top: "#CEE5D8", bottom: "#9EBEAD" },
];

export function getRandomPastelGradientName(): string {
  const index = Math.floor(Math.random() * PASTEL_GRADIENTS.length);
  return PASTEL_GRADIENTS[index]?.name ?? "blush";
}

export function getPastelGradientByName(name?: string | null): PastelGradient {
  if (name) {
    const found = PASTEL_GRADIENTS.find((g) => g.name.toLowerCase() === name.toLowerCase());
    if (found) return found;
  }
  return PASTEL_GRADIENTS[0];
}

/**
 * Resolves the pastel gradient for an instance.
 * If the instance icon encodes a gradient name (e.g. "grass_block:lavender"),
 * that gradient is used. Otherwise it deterministically hashes the seed.
 */
export function getPastelGradientForInstance(
  seed: string,
  iconKey?: string | null,
): PastelGradient {
  if (iconKey && iconKey.includes(":")) {
    const gradientName = iconKey.split(":")[1];
    if (gradientName) {
      const found = PASTEL_GRADIENTS.find(
        (g) => g.name.toLowerCase() === gradientName.toLowerCase(),
      );
      if (found) return found;
    }
  }

  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PASTEL_GRADIENTS.length;
  return PASTEL_GRADIENTS[index] ?? PASTEL_GRADIENTS[0];
}

export function parseInstanceIcon(
  rawIcon?: string | null,
  seedFallback = "default",
): {
  blockKey: string;
  gradientName: string;
} {
  if (!rawIcon) {
    return {
      blockKey: "grass_block",
      gradientName: getPastelGradientForInstance(seedFallback).name,
    };
  }
  if (rawIcon.includes(":")) {
    const [b, g] = rawIcon.split(":");
    return {
      blockKey: b || "grass_block",
      gradientName: g || "blush",
    };
  }
  return {
    blockKey: rawIcon,
    gradientName: getPastelGradientForInstance(seedFallback).name,
  };
}

export function encodeInstanceIcon(blockKey: string, gradientName: string): string {
  return `${blockKey}:${gradientName}`;
}
