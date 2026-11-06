import { AppContext } from "./AppContext"
import { useState, useEffect, type ReactNode } from "react"
import { useTaskStore } from "@/store/useTaskStore"
import { useMembersStore } from "@/store/useMembersStore"
import { useNotificationsStore } from "@/store/useNotificationsStore"
import { useNotesStore } from "@/store/useNotesStore"
import { useMinistriesStore } from "@/store/useMinistriesStore"
import { useAuth } from "@/context/AuthContext"

export function AppProvider({ children }: { children: ReactNode }) {
  const { session, isAdmin } = useAuth()
  const store = useTaskStore({id: session?.user.id, isAdmin})
  const ministriesStore = useMinistriesStore(isAdmin)
  const membersStore = useMembersStore()
  const notificationsStore = useNotificationsStore(session?.user?.id ?? null)
  const notesStore = useNotesStore(session?.user?.id ?? null)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)

  const { fetchMembers } = membersStore
  useEffect(() => { void fetchMembers() }, [fetchMembers])

  return (
    <AppContext.Provider value={{
      ...store,
      ...ministriesStore,
      activeProjectId, setActiveProjectId,
      members: membersStore.members,
      membersLoading: membersStore.loading,
      refetchMembers: membersStore.fetchMembers,
      ...notificationsStore,
      notes: notesStore.notes,
      notesLoading: notesStore.loading,
      noteTags: notesStore.allTags,
      createNote: notesStore.createNote,
      updateNote: notesStore.updateNote,
      deleteNote: notesStore.deleteNote,
      toggleNotePin: notesStore.togglePin,
    }}>
      {children}
    </AppContext.Provider>
  )
}
