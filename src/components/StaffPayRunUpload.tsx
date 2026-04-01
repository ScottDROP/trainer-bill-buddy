import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, FileText, Loader2 } from "lucide-react";

interface StaffPayRunUploadProps {
  payRunId: string;
  onSuccess?: () => void;
}

export function StaffPayRunUpload({ payRunId, onSuccess }: StaffPayRunUploadProps) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.toLowerCase().endsWith(".pdf")) setFile(f);
    else toast.error("Please upload a PDF file");
  }, []);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("pay_run_id", payRunId);

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/parse-payroll-pdf`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Upload failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast.success(`Parsed ${data.totals.count} staff members from payroll PDF`);
      queryClient.invalidateQueries({ queryKey: ["staff-pay-run", payRunId] });
      setFile(null);
      onSuccess?.();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Upload Staff Payroll PDF</CardTitle>
        <CardDescription>Upload an IRIS payroll summary PDF to add full-time staff costs.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
            dragOver
              ? "border-primary bg-primary/5"
              : file
              ? "border-primary/50 bg-primary/5"
              : "border-border hover:border-muted-foreground"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".pdf";
            input.onchange = (e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) setFile(f);
            };
            input.click();
          }}
        >
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <FileText className="h-8 w-8 text-primary" />
              <p className="text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
              >
                Remove
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Drop payroll PDF here</p>
              <p className="text-xs text-muted-foreground">or click to browse</p>
            </div>
          )}
        </div>

        <Button
          className="w-full"
          disabled={!file || uploadMutation.isPending}
          onClick={() => uploadMutation.mutate()}
        >
          {uploadMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Parsing PDF...
            </>
          ) : (
            "Upload & Parse"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
