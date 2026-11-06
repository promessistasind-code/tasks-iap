import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Note, NoteColor } from "@/types/note"
import { NOTE_COLORS } from "@/types/note"
import { Pin, PinOff, Trash2, X, Tag } from "lucide-react"
import { formatDistanceToNow, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { showConfirm } from "@/lib/confirm"
import { toast } from "sonner"

interface Props {
  note: Note | null
  allTags: string[]
  onClose: () => void
  onUpdate: (id: string, patch: Partial<Pick<Note, "title" | "content" | "color" | "pinned" | "tags">>) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
  onTogglePin: (id: string) => Promise<void>
}

export function NoteEditor(props: Props) {
  return props.note ? <NoteDraft key={props.note.id} {...props} note={props.note} /> : null
}

function NoteDraft({ note, allTags, onClose, onUpdate, onDelete, onTogglePin }: Props & {note: Note}) {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [tagInput, setTagInput] = useState("")
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  const focusOnOpen = useRef(!note.title)
  useEffect(() => {
    if (!focusOnOpen.current) return
    const timer = setTimeout(() => contentRef.current?.focus(), 100)
    return () => clearTimeout(timer)
  }, [])

  function scheduleAutoSave(newTitle: string, newContent: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (!note) return
      setSaving(true)
      await onUpdate(note.id, { title: newTitle, content: newContent })
      setSaving(false)
    }, 800)
  }

  function handleTitleChange(v: string) { setTitle(v); scheduleAutoSave(v, content) }
  function handleContentChange(v: string) {
    setContent(v); scheduleAutoSave(title, v)
    if (contentRef.current) {
      contentRef.current.style.height = "auto"
      contentRef.current.style.height = contentRef.current.scrollHeight + "px"
    }
  }

  async function handleColorChange(color: NoteColor) {
    if (!note) return
    await onUpdate(note.id, { color })
  }

  async function addTag(tag: string) {
    if (!note) return
    const t = tag.trim().toLowerCase().replace(/\s+/g, "-")
    if (!t || note.tags.includes(t)) { setTagInput(""); return }
    const newTags = [...note.tags, t]
    await onUpdate(note.id, { tags: newTags })
    setTagInput("")
  }

  async function removeTag(tag: string) {
    if (!note) return
    await onUpdate(note.id, { tags: note.tags.filter(t => t !== tag) })
  }

  async function handleDelete() {
    if (!note) return
    const ok = await showConfirm({ title: "Excluir esta nota?", description: "Esta ação não pode ser desfeita.", confirmLabel: "Excluir", variant: "destructive" })
    if (!ok) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const deleted = await onDelete(note.id)
    if (!deleted) return
    toast.success("Nota excluída")
    onClose()
  }

  if (!note) return null
  const colorCfg = NOTE_COLORS[note.color] || NOTE_COLORS.default
  const suggestions = allTags.filter(t => !note.tags.includes(t) && t.includes(tagInput.toLowerCase()))

  return (
    <Dialog open={!!note} onOpenChange={v => !v && onClose()}>
      {/* [&>[data-slot='dialog-close']]:hidden remove o X auto do shadcn — usamos o nosso */}
      <DialogContent className={cn(
        "max-w-2xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden [&>[data-slot='dialog-close']]:hidden",
        colorCfg.bg, colorCfg.border
      )}>
        <DialogTitle className="sr-only">Editar nota</DialogTitle>

        {/* Header com título + botão X único */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <input
            className="text-xl font-bold bg-transparent outline-none flex-1 placeholder:text-muted-foreground/50"
            placeholder="Título..."
            value={title}
            onChange={e => handleTitleChange(e.target.value)}
            onKeyDown={e => e.key === "Enter" && contentRef.current?.focus()}
          />
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {saving && <span className="text-[10px] text-muted-foreground animate-pulse">salvando...</span>}
            <Button variant="ghost" size="icon" className="size-8 rounded-full" onClick={onClose} title="Fechar">
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Tags */}
        <div className="px-5 pb-2 shrink-0 flex flex-wrap items-center gap-1.5">
          {note.tags.map(tag => (
            <span key={tag} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              <Tag className="size-2.5" />
              {tag}
              <button onClick={() => removeTag(tag)} className="ml-0.5 hover:text-destructive transition-colors">
                <X className="size-2.5" />
              </button>
            </span>
          ))}
          {/* Tag input */}
          <div className="relative">
            <input
              ref={tagInputRef}
              className="text-xs bg-transparent outline-none border-b border-dashed border-muted-foreground/30 focus:border-primary placeholder:text-muted-foreground/40 w-20"
              placeholder="+ tag"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput) }
                if (e.key === "Escape") setTagInput("")
              }}
            />
            {/* Autocomplete dropdown */}
            {tagInput && suggestions.length > 0 && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg py-1 min-w-[120px]">
                {suggestions.slice(0, 5).map(t => (
                  <button key={t} onClick={() => addTag(t)} className="flex items-center gap-1.5 w-full px-3 py-1 text-xs hover:bg-muted text-left">
                    <Tag className="size-3 text-muted-foreground" /> {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-5 overflow-y-auto">
          <textarea
            ref={contentRef}
            className="w-full bg-transparent outline-none resize-none text-sm leading-relaxed placeholder:text-muted-foreground/40 min-h-[200px]"
            placeholder="Escreva aqui... use listas com - ou * e títulos com #"
            value={content}
            onChange={e => handleContentChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Escape") onClose()
              if (e.key === "Enter") {
                const lines = content.slice(0, e.currentTarget.selectionStart).split("\n")
                const lastLine = lines[lines.length - 1]
                const listMatch = lastLine.match(/^(\s*[-*]\s)/)
                if (listMatch) {
                  e.preventDefault()
                  const cursor = e.currentTarget.selectionStart
                  const insert = "\n" + listMatch[1]
                  handleContentChange(content.slice(0, cursor) + insert + content.slice(cursor))
                  setTimeout(() => {
                    if (contentRef.current) contentRef.current.selectionStart = contentRef.current.selectionEnd = cursor + insert.length
                  }, 0)
                }
              }
            }}
            style={{ minHeight: "200px" }}
          />
        </div>

        {/* Footer */}
        <div className={cn("flex items-center justify-between px-4 py-2 border-t shrink-0", colorCfg.border)}>
          <div className="flex items-center gap-1">
            {(Object.entries(NOTE_COLORS) as [NoteColor, typeof NOTE_COLORS[NoteColor]][]).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => handleColorChange(key)}
                className={cn("size-5 rounded-full border-2 transition-transform hover:scale-110", cfg.bg.split(" ")[0], note.color === key ? "border-primary scale-110" : "border-transparent")}
                title={cfg.label}
                style={key === "default" ? { background: "var(--card)" } : undefined}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              {content.length} chars · {formatDistanceToNow(parseISO(note.updatedAt), { addSuffix: true, locale: ptBR })}
            </span>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => onTogglePin(note.id)} title={note.pinned ? "Desafixar" : "Fixar"}>
              {note.pinned ? <PinOff className="size-3.5 text-primary" /> : <Pin className="size-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="size-7 hover:text-destructive" onClick={handleDelete}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
