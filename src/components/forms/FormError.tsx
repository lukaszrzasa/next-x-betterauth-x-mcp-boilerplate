import { Alert, AlertDescription } from "@/src/components/ui/alert";

export function FormError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
