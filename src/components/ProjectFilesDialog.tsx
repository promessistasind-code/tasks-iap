import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { useApp } from "@/context/AppContext"
import type { Project } from "@/types/task"
import type { ProjectFile } from "@/types/projectFile"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Upload, Download, Trash2, FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface Props {
  project: Project | null
  onClose: () => void
  /** Quando informado, restringe a arquivos anexados a essa tarefa específica em vez do projeto inteiro. */
  taskId?: string | null
  taskTitle?: string
}

function mapFile(row: Record<string, unknown>): ProjectFile {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    taskId: (row.task_id as string) ?? null,
    name: row.name as string,
    path: row.path as string,
    size: row.size as number,
    mimeType: row.mime_type as string,
    uploadedBy: (row.uploaded_by as string) ?? null,
    createdAt: row.created_at as string,
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const ACCEPTED = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.zip"

export function ProjectFilesDialog(props: Props) {
  return props.project ? <FileList key={props.project.id + "/" + (props.taskId ?? "")} {...props} /> : null
}

function FileList({ project, onClose, taskId, taskTitle }: Props) {
  const { members } = useApp()
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const projectId = project?.id
  useEffect(() => {
    if (!projectId) return
    let active = true
    let query = supabase.from("lt_project_files").select("*").eq("project_id", projectId)
    query = taskId ? query.eq("task_id", taskId) : query.is("task_id", null)
    query.order("created_at", { ascending: false })
      .then(({ data, error }) => { if (active) { if (error) toast.error("Não foi possível carregar os arquivos"); setFiles((data ?? []).map(mapFile)); setLoading(false) } })
    return () => { active = false }
  }, [projectId, taskId])

  async function handleUpload(fileList: FileList | null) {
    if (!project || !fileList || fileList.length === 0) return
    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    for (const file of Array.from(fileList)) {
      const path = `${project.id}/${crypto.randomUUID()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from("project-files").upload(path, file)
      if (uploadError) { toast.error(`Erro ao enviar "${file.name}"`); continue }
      const { data, error } = await supabase.from("lt_project_files").insert({
        project_id: project.id, task_id: taskId ?? null, name: file.name, path,
        size: file.size, mime_type: file.type || "application/octet-stream",
        uploaded_by: user?.id ?? null,
      }).select().single()
      if (error || !data) { toast.error(`Erro ao salvar "${file.name}"`); continue }
      setFiles(prev => [mapFile(data), ...prev])
    }
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ""
  }

  async function handleDownload(file: ProjectFile) {
    const { data, error } = await supabase.storage.from("project-files").createSignedUrl(file.path, 60)
    if (error || !data) { toast.error("Erro ao gerar link de download"); return }
    const a = document.createElement("a")
    a.href = data.signedUrl
    a.download = file.name
    a.click()
  }

  async function handleDelete(file: ProjectFile) {
    const { error: storageError } = await supabase.storage.from("project-files").remove([file.path])
    if (storageError) { toast.error("Erro ao excluir arquivo"); return }
    const { error } = await supabase.from("lt_project_files").delete().eq("id", file.id)
    if (error) { toast.error("Erro ao excluir arquivo"); return }
    setFiles(prev => prev.filter(f => f.id !== file.id))
    toast.success("Arquivo excluído")
  }

  return (
    <Dialog open={!!project} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{taskId ? `Anexos de "${taskTitle}"` : `Arquivos de "${project?.name}"`}</DialogTitle>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={e => handleUpload(e.target.files)}
        />
        <Button variant="outline" className="gap-2" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {uploading ? "Enviando..." : "Enviar arquivo"}
        </Button>

        <div className="flex flex-col gap-1 max-h-80 overflow-y-auto">
          {loading && <p className="text-xs text-muted-foreground text-center py-4">Carregando...</p>}
          {!loading && files.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum arquivo ainda.</p>
          )}
          {files.map(file => {
            const uploader = members.find(m => m.id === file.uploadedBy)
            return (
              <div key={file.id} className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-muted/50 group">
                <FileText className="size-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{file.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatSize(file.size)} · {uploader?.name ?? "Alguém"}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => handleDownload(file)} title="Baixar">
                  <Download className="size-3.5" />
                </Button>
                <Button
                  variant="ghost" size="icon"
                  className="size-7 shrink-0 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                  onClick={() => handleDelete(file)}
                  title="Excluir"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
