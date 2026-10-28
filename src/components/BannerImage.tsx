import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
export function BannerImage({
  path,
  alt,
  className,
}: {
  path: string
  alt: string
  className?: string
}) {
  const [source, setSource] = useState<{ path: string; url: string } | null>(
    null
  )
  useEffect(() => {
    let active = true
    let objectUrl: string | undefined
    void supabase.storage
      .from("announcement-images")
      .download(path)
      .then(({ data, error }) => {
        if (active && data && !error) {
          objectUrl = URL.createObjectURL(data)
          setSource({ path, url: objectUrl })
        }
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path])
  return source?.path === path ? (
    <img src={source.url} alt={alt} className={className} />
  ) : (
    <div className={className} role="img" aria-label={alt}>
      <span className="sr-only">{alt}</span>
    </div>
  )
}
