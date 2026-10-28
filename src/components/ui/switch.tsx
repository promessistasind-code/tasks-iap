import type { ComponentProps } from "react"
export function Switch({
  checked,
  onCheckedChange,
  ...props
}: Omit<ComponentProps<"input">, "type" | "onChange"> & {
  checked: boolean
  onCheckedChange: (value: boolean) => void
}) {
  return (
    <input
      {...props}
      type="checkbox"
      role="switch"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      className="h-5 w-9 accent-primary"
    />
  )
}
