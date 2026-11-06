import { closeConfirmation as close, getConfirmation, subscribeConfirmation } from "@/lib/confirm"
import { useSyncExternalStore } from "react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/buttonVariants"
import { cn } from "@/lib/utils"

/** Mount once inside App root */
export function ConfirmDialogProvider() {
  const state = useSyncExternalStore(subscribeConfirmation, getConfirmation)
  if (!state) return null

  return (
    <AlertDialog open={state.open} onOpenChange={open => !open && close(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.title}</AlertDialogTitle>
          {state.description && (
            <AlertDialogDescription>{state.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className={cn(state.variant === "destructive" && buttonVariants({ variant: "destructive" }))}
          >
            {state.confirmLabel ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
