import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, FileText } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseCSV(text: string): string[][] {
  const lines = text.split("\n").filter((l) => l.trim());
  return lines.map((line) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  });
}

function detectColumns(headers: string[]) {
  const trainerCol = headers.findIndex(
    (h) => h.toLowerCase() === "trainer" || h.toLowerCase() === "name"
  );
  const rateCol = headers.findIndex(
    (h) => h.toLowerCase().includes("hourly rate") || h.toLowerCase() === "rate"
  );
  const totalSessionsCol = headers.findIndex(
    (h) => h.toLowerCase() === "total sessions"
  );
  const totalCostCol = headers.findIndex(
    (h) => h.toLowerCase() === "total cost"
  );

  const locationColumns: { name: string; sessionsCol: number; costCol: number }[] = [];
  headers.forEach((h, i) => {
    const sessMatch = h.match(/^(.+?)\s+Sessions$/i);
    if (sessMatch) {
      const locName = sessMatch[1];
      const costCol = headers.findIndex(
        (ch) => ch.toLowerCase() === `${locName.toLowerCase()} cost`
      );
      if (costCol !== -1) {
        locationColumns.push({ name: locName, sessionsCol: i, costCol });
      }
    }
  });

  return { trainerCol, rateCol, totalSessionsCol, totalCostCol, locationColumns };
}

export default function UploadPayRun() {
  const navigate = useNavigate();
  const now = new Date();
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  const [month, setMonth] = useState(prevMonth.toString());
  const [year, setYear] = useState(prevYear.toString());
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith(".csv")) setFile(f);
    else toast.error("Please upload a CSV file");
  }, []);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");

      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error("CSV must have a header row and data rows");

      const headers = rows[0];
      const cols = detectColumns(headers);

      if (cols.trainerCol === -1) throw new Error("Could not find 'Trainer' column in CSV");
      if (cols.totalSessionsCol === -1) throw new Error("Could not find 'Total Sessions' column");
      if (cols.totalCostCol === -1) throw new Error("Could not find 'Total Cost' column");

      // Create pay run
      const { data: payRun, error: prError } = await supabase
        .from("pay_runs")
        .insert({
          month: parseInt(month),
          year: parseInt(year),
          status: "uploaded" as const,
        })
        .select()
        .single();
      if (prError) throw prError;

      // Upload CSV to storage
      const filePath = `${payRun.id}/${file.name}`;
      await supabase.storage.from("csv-uploads").upload(filePath, file);
      await supabase
        .from("pay_runs")
        .update({ csv_file_path: filePath })
        .eq("id", payRun.id);

      // Fetch trainers for matching
      const { data: trainers } = await supabase.from("trainers").select("*");
      const trainerList = trainers || [];

      // Process data rows
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const trainerName = row[cols.trainerCol];
        if (!trainerName || trainerName.toUpperCase() === "TOTAL") continue;

        const hourlyRate = cols.rateCol !== -1 ? parseFloat(row[cols.rateCol]) || 0 : 0;
        const totalSessions = parseFloat(row[cols.totalSessionsCol]) || 0;
        const totalCost = parseFloat(row[cols.totalCostCol]) || 0;

        // Match trainer using multi-strategy matching
        let matchedTrainer: any = null;
        let matchStatus: 'auto_matched' | 'alias_matched' | 'unmatched' = "unmatched";

        const csvLower = trainerName.toLowerCase().trim();
        const csvWords = csvLower.split(/\s+/);

        // 1. Exact full_name match
        matchedTrainer = trainerList.find(
          (t: any) => t.full_name.toLowerCase().trim() === csvLower
        );
        if (matchedTrainer) {
          matchStatus = "auto_matched";
        }

        // 2. Exact alias match
        if (!matchedTrainer) {
          matchedTrainer = trainerList.find((t: any) =>
            (t.aliases || []).some((a: string) => a.toLowerCase().trim() === csvLower)
          );
          if (matchedTrainer) matchStatus = "alias_matched";
        }

        // 3. Fuzzy: all CSV words appear in full_name (handles "Denisa Ardelean" → "Denisa Maria Ardelean")
        if (!matchedTrainer) {
          matchedTrainer = trainerList.find((t: any) => {
            const nameWords = t.full_name.toLowerCase().split(/\s+/);
            return csvWords.every((w: string) => nameWords.some((nw: string) => nw === w));
          });
          if (matchedTrainer) matchStatus = "auto_matched";
        }

        // 4. Fuzzy: all full_name words appear in CSV name (handles "Cynthia Aguirre" in "Cynthia Aguirre Hernandez")
        if (!matchedTrainer) {
          matchedTrainer = trainerList.find((t: any) => {
            const nameWords = t.full_name.toLowerCase().split(/\s+/);
            return nameWords.every((nw: string) => csvWords.some((w: string) => w === nw));
          });
          if (matchedTrainer) matchStatus = "auto_matched";
        }

        // 5. Fuzzy: first name + any last name word overlap (handles "Maria Gomez" → "Maria Paula Gomez Fisco")
        if (!matchedTrainer && csvWords.length >= 2) {
          const csvFirst = csvWords[0];
          const csvLastWords = csvWords.slice(1);
          matchedTrainer = trainerList.find((t: any) => {
            const nameWords = t.full_name.toLowerCase().split(/\s+/);
            const nameFirst = nameWords[0];
            const nameLastWords = nameWords.slice(1);
            // First name matches and at least one last name word overlaps
            return (
              csvFirst === nameFirst &&
              csvLastWords.some((cw: string) => nameLastWords.some((nw: string) => nw === cw))
            );
          });
          if (matchedTrainer) matchStatus = "auto_matched";
        }

        // 6. Fuzzy: any alias word overlap with first name match
        if (!matchedTrainer && csvWords.length >= 1) {
          matchedTrainer = trainerList.find((t: any) =>
            (t.aliases || []).some((alias: string) => {
              const aliasWords = alias.toLowerCase().split(/\s+/);
              // Check if first word matches and any other word overlaps
              if (aliasWords[0] === csvWords[0]) {
                if (csvWords.length === 1 && aliasWords.length === 1) return true;
                const csvRest = csvWords.slice(1);
                const aliasRest = aliasWords.slice(1);
                return csvRest.some((cw: string) => aliasRest.some((aw: string) => aw === cw));
              }
              return false;
            })
          );
          if (matchedTrainer) matchStatus = "alias_matched";
        }

        // If matched, auto-save the CSV name as an alias for future exact matching
        if (matchedTrainer && matchStatus !== "unmatched") {
          const existingAliases: string[] = matchedTrainer.aliases || [];
          const alreadyHasAlias = existingAliases.some(
            (a: string) => a.toLowerCase() === csvLower
          );
          const nameAlreadyMatches = matchedTrainer.full_name.toLowerCase().trim() === csvLower;
          if (!alreadyHasAlias && !nameAlreadyMatches) {
            const updatedAliases = [...existingAliases, trainerName.trim()];
            await supabase
              .from("trainers")
              .update({ aliases: updatedAliases })
              .eq("id", matchedTrainer.id);
            // Update local list too
            matchedTrainer.aliases = updatedAliases;
          }
        }

        // Build validation warnings
        const warnings: string[] = [];
        if (matchedTrainer) {
          if (!matchedTrainer.email || !matchedTrainer.invoicing_address || !matchedTrainer.bank_account_number) {
            warnings.push("Trainer profile incomplete");
          }
          if (!matchedTrainer.email || !matchedTrainer.company_name || !matchedTrainer.invoicing_address) {
            warnings.push("Trainer profile incomplete");
          }
        }

        // Build line items
        const lineItems = cols.locationColumns
          .map((loc) => ({
            location_name: loc.name,
            sessions: parseFloat(row[loc.sessionsCol]) || 0,
            rate: hourlyRate,
            amount: parseFloat(row[loc.costCol]) || 0,
          }))
          .filter((li) => li.sessions > 0);

        // Validate totals
        const calcTotalSessions = lineItems.reduce((s, li) => s + li.sessions, 0);
        const calcTotalCost = lineItems.reduce((s, li) => s + li.amount, 0);
        if (Math.abs(calcTotalSessions - totalSessions) > 0.01) {
          warnings.push(`Sessions mismatch: sum ${calcTotalSessions} ≠ CSV total ${totalSessions}`);
        }
        if (Math.abs(calcTotalCost - totalCost) > 0.01) {
          warnings.push(`Cost mismatch: sum £${calcTotalCost.toFixed(2)} ≠ CSV total £${totalCost.toFixed(2)}`);
        }

        // Insert pay run row
        const { data: payRunRow, error: rowError } = await supabase
          .from("pay_run_rows")
          .insert({
            pay_run_id: payRun.id,
            trainer_name_csv: trainerName,
            matched_trainer_id: matchedTrainer?.id || null,
            hourly_rate_csv: hourlyRate,
            total_sessions: totalSessions,
            total_cost: totalCost,
            match_status: matchStatus as any,
            validation_warnings: warnings,
          })
          .select()
          .single();
        if (rowError) throw rowError;

        // Insert line items
        if (lineItems.length > 0) {
          const { error: liError } = await supabase
            .from("pay_run_line_items")
            .insert(
              lineItems.map((li) => ({
                pay_run_row_id: payRunRow.id,
                ...li,
              }))
            );
          if (liError) throw liError;
        }
      }

      return payRun.id;
    },
    onSuccess: (payRunId) => {
      toast.success("Pay run uploaded and parsed successfully");
      navigate(`/pay-runs/${payRunId}/review`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Upload Pay Run</h1>
        <p className="text-muted-foreground mt-1">
          Upload a monthly CSV pay run report to generate invoices.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pay Run Details</CardTitle>
          <CardDescription>Select the service period and upload the CSV file.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i} value={(i + 1).toString()}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Year</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                    <SelectItem key={y} value={y.toString()}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
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
              input.accept = ".csv";
              input.onchange = (e) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                if (f) setFile(f);
              };
              input.click();
            }}
          >
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileText className="h-10 w-10 text-primary" />
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
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
                <Upload className="h-10 w-10 text-muted-foreground" />
                <p className="font-medium">Drop your CSV file here</p>
                <p className="text-sm text-muted-foreground">
                  or click to browse
                </p>
              </div>
            )}
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={!file || uploadMutation.isPending}
            onClick={() => uploadMutation.mutate()}
          >
            {uploadMutation.isPending ? "Processing..." : "Upload & Process"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Expected CSV Format</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-2">
            The CSV should have columns like:
          </p>
          <code className="block text-xs bg-muted p-3 rounded-md overflow-x-auto">
            Trainer, Hourly Rate, Shoreditch Sessions, Shoreditch Cost, Camden Sessions, Camden Cost, Total Sessions, Total Cost
          </code>
        </CardContent>
      </Card>
    </div>
  );
}
