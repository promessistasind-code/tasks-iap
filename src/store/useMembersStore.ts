import { useState } from "react"
import type { Member } from "@/types/task"
import { supabase } from "@/lib/supabase"

function mapMember(row: Record<string, unknown>): Member {
  return {
    id: row.id as string,
    name: row.name as string,
    color: row.color as string,
    initials: row.initials as string,
    isAdmin: !!row.is_admin,
  }
}

export function useMembersStore() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)

  async function fetchMembers() {
    setLoading(true)
    try {
      const { data } = await supabase.from("profiles").select("id,name,color,initials,is_admin,created_at").order("created_at")
      setMembers((data ?? []).map(mapMember))
    } finally {
      setLoading(false)
    }
  }

  return { members, loading, fetchMembers }
}
