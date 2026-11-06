import { Zap, type LucideProps } from "lucide-react"
import { cn } from "@/lib/utils"
import { PROJECT_ICONS } from "@/lib/projectIcons"

const ICON_MAP = Object.fromEntries(PROJECT_ICONS.map(i => [i.key, i.Icon]))

interface ProjectIconProps extends Omit<LucideProps, "ref"> {
  iconKey: string
}

export function ProjectIcon({ iconKey, className, ...props }: ProjectIconProps) {
  const Icon = ICON_MAP[iconKey] ?? Zap
  return <Icon className={cn("shrink-0", className)} {...props} />
}
