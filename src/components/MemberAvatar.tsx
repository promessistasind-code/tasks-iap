import { useMedia } from "@/context/MediaContext"
import { useState } from "react"
import type { Member } from "@/types/task"
import { cn } from "@/lib/utils"

interface Props {
  member: Member
  size?: "xs" | "sm" | "md"
  className?: string
}

const SIZE = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
}

export function MemberAvatar({ member, size = "sm", className }: Props) {
  const {avatars,urls}=useMedia()
  const [failed,setFailed]=useState<string|null>(null)
  const src=urls[avatars[member.id]]
  if(src && failed!==src) return <img src={src} alt={member.name} title={member.name} onError={()=>setFailed(src)} className={cn("rounded-full object-cover shrink-0",SIZE[size],className)}/>
  return (
    <span
      className={cn("rounded-full flex items-center justify-center font-semibold text-white shrink-0", SIZE[size], className)}
      style={{ background: member.color }}
      title={member.name}
    >
      {member.initials}
    </span>
  )
}
