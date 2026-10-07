import { InstanceAddonsTab } from "./InstanceAddonsTab";
import type { Theme } from "../theme";
import type { Instance, MinecraftVersion } from "../instance";

export function InstanceModsTab(props: {
  theme: Theme;
  instance: Instance;
  instances: Instance[];
  versions: MinecraftVersion[];
  onOpenFolder: () => Promise<void>;
}) {
  return <InstanceAddonsTab {...props} category="mods" />;
}
