import { useState, useMemo } from "react"
import { useApp } from "@/context/AppContext"
import { NoteEditor } from "@/components/NoteEditor"
import { NoteTaskExtractor } from "@/components/NoteTaskExtractor"
import { NOTE_COLORS, NOTE_TEMPLATES } from "@/types/note"
import type { Note, NoteColor } from "@/types/note"
import { extractTasksFromNote, countListItems } from "@/lib/noteTaskExtractor"
import type { ExtractedTask } from "@/lib/noteTaskExtractor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  Plus,
  Search,
  Pin,
  PinOff,
  Trash2,
  Tag,
  X,
  Sparkles,
  StickyNote,
  Grid3x3,
  Rows3,
} from "lucide-react"
import { formatDistanceToNow, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { showConfirm } from "@/lib/confirm"
import { toast } from "sonner"

// Mapeamento de cor da nota para cor CSS (borda esquerda)
const COLOR_BORDER: Record<NoteColor, string> = {
  default: "border-l-muted-foreground/30",
  yellow: "border-l-yellow-400",
  blue: "border-l-blue-400",
  green: "border-l-green-400",
  pink: "border-l-pink-400",
  purple: "border-l-purple-400",
  orange: "border-l-orange-400",
}

// Preview simples do conteúdo (sem markdown bruto)
function renderPreview(content: string): string {
  return content
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^[-*•]\s+/gm, "• ")
    .replace(/^\d+[.)]\s+/gm, "→ ")
    .replace(/^- \[[ x]\] /gm, "☐ ")
    .trim()
}

export function NotesPage() {
  const { notes, notesLoading: loading, noteTags: allTags, createNote, updateNote, deleteNote, toggleNotePin: togglePin } =
    useApp()
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [extractorNote, setExtractorNote] = useState<Note | null>(null)
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[]>([])
  const [search, setSearch] = useState("")
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"masonry" | "list">("masonry")

  const filtered = useMemo(() => {
    return notes.filter(n => {
      const matchSearch =
        !search ||
        n.title.toLowerCase().includes(search.toLowerCase()) ||
        n.content.toLowerCase().includes(search.toLowerCase()) ||
        n.tags.some(t => t.includes(search.toLowerCase()))
      const matchTag = !activeTag || n.tags.includes(activeTag)
      return matchSearch && matchTag
    })
  }, [notes, search, activeTag])

  const pinned = filtered.filter(n => n.pinned)
  const others = filtered.filter(n => !n.pinned)

  const currentNote = editingNote ? notes.find(n => n.id === editingNote.id) ?? editingNote : null

  async function handleNew(template?: string) {
    const note = await createNote(template)
    if (note) setEditingNote(note)
  }

  function openExtractor(note: Note, e: React.MouseEvent) {
    e.stopPropagation()
    const tasks = extractTasksFromNote(note.content)
    setExtractedTasks(tasks)
    setExtractorNote(note)
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    const ok = await showConfirm({
      title: "Excluir nota?",
      description: "Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      variant: "destructive",
    })
    if (!ok) return
    const deleted = await deleteNote(id)
    if (deleted) toast.success("Nota excluída")
  }

  function renderNoteCard(note: Note) {
    const colorCfg = NOTE_COLORS[note.color] || NOTE_COLORS.default
    const listCount = countListItems(note.content)
    const preview = renderPreview(note.content)
    const previewLines = preview
      .split("\n")
      .filter(Boolean)
      .slice(0, 8)
      .join("\n")

    return (
      <div key={note.id}
        className={cn(
          "group relative rounded-xl border border-l-4 p-4 cursor-pointer",
          "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
          "mb-3 break-inside-avoid",
          colorCfg.bg,
          colorCfg.border,
          COLOR_BORDER[note.color],
          viewMode === "list" && "mb-2 flex gap-4 items-start"
        )}
        onClick={() => setEditingNote(note)}
      >
        {/* Pin indicator */}
        {note.pinned && (
          <div className="absolute top-2.5 right-2.5 size-5 rounded-full bg-primary/10 flex items-center justify-center">
            <Pin className="size-2.5 text-primary" />
          </div>
        )}

        {/* List view: left color dot */}
        {viewMode === "list" && (
          <div
            className={cn("w-1 self-stretch rounded-full shrink-0 -ml-4 mr-3 rounded-l-none", {
              "bg-yellow-400": note.color === "yellow",
              "bg-blue-400": note.color === "blue",
              "bg-green-400": note.color === "green",
              "bg-pink-400": note.color === "pink",
              "bg-purple-400": note.color === "purple",
              "bg-orange-400": note.color === "orange",
              "bg-muted-foreground/20": note.color === "default",
            })}
          />
        )}

        <div className={cn("min-w-0 flex-1", viewMode === "list" && "flex items-center gap-4")}>
          {/* Title */}
          {note.title && (
            <h3
              className={cn(
                "font-semibold text-sm leading-snug mb-1.5 pr-5",
                viewMode === "list" && "mb-0 min-w-[180px] shrink-0 text-base"
              )}
            >
              {note.title}
            </h3>
          )}

          {/* Preview */}
          {previewLines && (
            <p
              className={cn(
                "text-xs text-muted-foreground leading-relaxed whitespace-pre-line flex-1",
                viewMode === "masonry" ? "line-clamp-6" : "line-clamp-1"
              )}
            >
              {previewLines}
            </p>
          )}

          {!note.title && !note.content && (
            <p className="text-xs text-muted-foreground/50 italic">Nota vazia</p>
          )}
        </div>

        {/* Footer: tags + meta */}
        <div
          className={cn(
            "mt-2.5 flex flex-wrap items-center gap-1.5",
            viewMode === "list" && "mt-0 shrink-0 ml-auto pl-4 flex-col items-end gap-1"
          )}
        >
          {/* Tags */}
          {note.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 flex-1">
              {note.tags.slice(0, 3).map(tag => (
                <span
                  key={tag}
                  onClick={e => {
                    e.stopPropagation()
                    setActiveTag(activeTag === tag ? null : tag)
                  }}
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full border transition-colors",
                    activeTag === tag
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-primary/5 text-primary/70 border-primary/15 hover:bg-primary/10"
                  )}
                >
                  #{tag}
                </span>
              ))}
              {note.tags.length > 3 && (
                <span className="text-[10px] text-muted-foreground">+{note.tags.length - 3}</span>
              )}
            </div>
          )}

          {/* Timestamp */}
          <span className="text-[10px] text-muted-foreground/60 italic shrink-0">
            {formatDistanceToNow(parseISO(note.updatedAt), {
              addSuffix: true,
              locale: ptBR,
            })}
          </span>
        </div>

        {/* Hover actions */}
        <div
          className={cn(
            "absolute bottom-3 right-3 flex items-center gap-1",
            "opacity-0 group-hover:opacity-100 transition-all duration-150",
            "translate-y-1 group-hover:translate-y-0"
          )}
        >
          {/* Extract tasks badge */}
          {listCount > 0 && (
            <button
              onClick={e => openExtractor(note, e)}
              className={cn(
                "flex items-center gap-1 text-[10px] px-2 py-1 rounded-full",
                "bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300",
                "hover:bg-violet-200 dark:hover:bg-violet-800/50 transition-colors border border-violet-200 dark:border-violet-800"
              )}
              title="Extrair tarefas desta nota"
            >
              <Sparkles className="size-3" />
              {listCount} tarefa{listCount !== 1 ? "s" : ""}
            </button>
          )}

          <button
            onClick={e => {
              e.stopPropagation()
              togglePin(note.id)
            }}
            className="size-6 flex items-center justify-center rounded-full bg-background/80 border shadow-sm hover:bg-muted transition-colors"
            title={note.pinned ? "Desafixar" : "Fixar"}
          >
            {note.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
          </button>

          <button
            onClick={e => handleDelete(note.id, e)}
            className="size-6 flex items-center justify-center rounded-full bg-background/80 border shadow-sm hover:bg-red-50 hover:text-red-500 transition-colors text-muted-foreground"
            title="Excluir"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>
    )
  }

  function renderNotesGrid(items: Note[]) {
    if (viewMode === "list") {
      return (
        <div className="flex flex-col">
          {items.map(renderNoteCard)}
        </div>
      )
    }
    return (
      <div className="columns-1 sm:columns-2 lg:columns-3 gap-3">
        {items.map(renderNoteCard)}
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-6 pb-20 md:pb-0 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <StickyNote className="size-5 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">Notas</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              {notes.length} nota{notes.length !== 1 ? "s" : ""}
              {allTags.length > 0 && (
                <span className="ml-2 text-xs">
                  · {allTags.length} tag{allTags.length !== 1 ? "s" : ""}
                </span>
              )}
            </p>
          </div>
          <Button onClick={() => handleNew()} className="gap-2 shadow-sm" size="sm">
            <Plus className="size-4" />
            <span className="hidden sm:inline">Nova nota</span>
          </Button>
        </div>

        {/* Search + view toggle */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, conteúdo ou tag..."
                className="pl-9 h-9 bg-background"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center border rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode("masonry")}
                className={cn(
                  "px-2.5 py-1.5 transition-colors",
                  viewMode === "masonry"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
                title="Grid"
              >
                <Grid3x3 className="size-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "px-2.5 py-1.5 transition-colors",
                  viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
                title="Lista"
              >
                <Rows3 className="size-4" />
              </button>
            </div>
          </div>

          {/* Tag filters */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Tag className="size-3 text-muted-foreground/60 shrink-0" />
              {activeTag && (
                <button
                  onClick={() => setActiveTag(null)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary text-primary-foreground"
                >
                  #{activeTag} <X className="size-3" />
                </button>
              )}
              {allTags
                .filter(t => t !== activeTag)
                .map(tag => (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(tag)}
                    className="text-xs px-2.5 py-1 rounded-full border text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                  >
                    #{tag}
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Loading skeletons */}
        {loading && (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-3">
            {[140, 200, 100, 180, 120, 160].map((h, i) => (
              <Skeleton
                key={i}
                className="rounded-xl mb-3 break-inside-avoid"
                style={{ height: h }}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && notes.length === 0 && (
          <div className="flex flex-col items-center gap-8 py-20">
            <div className="relative">
              <div className="size-24 rounded-3xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30 flex items-center justify-center">
                <StickyNote className="size-10 text-violet-400" />
              </div>
              <div className="absolute -top-1 -right-1 size-8 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center rotate-12">
                <span className="text-base">✨</span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-xl font-semibold mb-2">Nenhuma nota ainda</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Capture ideias, faça pautas de reunião ou anote insights importantes
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-xl">
              {NOTE_TEMPLATES.map(t => (
                <button
                  key={t.label}
                  onClick={() => handleNew(t.content)}
                  className={cn(
                    "flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 border-dashed",
                    "hover:border-primary/40 hover:bg-primary/5 transition-all",
                    "text-center group"
                  )}
                >
                  <span className="text-2xl group-hover:scale-110 transition-transform">
                    {t.icon}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground">
                    {t.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* No search results */}
        {!loading && notes.length > 0 && filtered.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-sm">
              Nenhuma nota encontrada para "{search}
              {activeTag ? ` #${activeTag}` : ""}"
            </p>
            <button
              onClick={() => {
                setSearch("")
                setActiveTag(null)
              }}
              className="text-xs text-primary mt-2 hover:underline"
            >
              Limpar filtros
            </button>
          </div>
        )}

        {/* Pinned notes */}
        {pinned.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Pin className="size-3.5 text-primary" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Fixadas
              </h2>
              <span className="text-xs text-muted-foreground">({pinned.length})</span>
            </div>
            {renderNotesGrid(pinned)}
          </section>
        )}

        {/* Other notes */}
        {others.length > 0 && (
          <section>
            {pinned.length > 0 && (
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Outras
                </h2>
                <span className="text-xs text-muted-foreground">({others.length})</span>
              </div>
            )}
            {renderNotesGrid(others)}
          </section>
        )}

        {/* Quick templates strip */}
        {!loading && notes.length > 0 && !search && !activeTag && (
          <div className="flex gap-2 flex-wrap items-center pt-2 border-t">
            <span className="text-xs text-muted-foreground">Novo com template:</span>
            {NOTE_TEMPLATES.map(t => (
              <button
                key={t.label}
                onClick={() => handleNew(t.content)}
                className="text-xs px-3 py-1.5 rounded-full border hover:bg-primary/5 hover:border-primary/30 transition-colors flex items-center gap-1.5"
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Note editor */}
      <NoteEditor
        note={currentNote}
        allTags={allTags}
        onClose={() => setEditingNote(null)}
        onUpdate={updateNote}
        onDelete={deleteNote}
        onTogglePin={togglePin}
      />

      {/* Task extractor */}
      <NoteTaskExtractor
        open={!!extractorNote}
        onClose={() => setExtractorNote(null)}
        noteTitle={extractorNote?.title || ""}
        tasks={extractedTasks}
        onTasksChange={setExtractedTasks}
      />
    </>
  )
}
