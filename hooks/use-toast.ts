import { toast } from "sonner"

export { toast }

export function useToast() {
  return {
    toast,
    dismiss: (toastId?: string) => toast.dismiss(toastId),
  }
}
