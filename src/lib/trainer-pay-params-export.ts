function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export interface TrainerPayParamsExportRow {
  id: string;
  full_name: string;
  aliases: string[] | null;
  email: string | null;
  company_name?: string | null;
  default_hourly_rate: number | null;
  payment_terms?: string | null;
  guarantee_amount: number | null;
  guarantee_sessions: number | null;
  management_fee: number | null;
}

export function downloadTrainerPayParamsJSON(trainers: TrainerPayParamsExportRow[]) {
  const payload = {
    exported_at: new Date().toISOString(),
    trainer_count: trainers.length,
    trainers: trainers.map((trainer) => ({
      id: trainer.id,
      full_name: trainer.full_name,
      aliases: trainer.aliases ?? [],
      email: trainer.email ?? "",
      company_name: trainer.company_name ?? "",
      default_hourly_rate: Number(trainer.default_hourly_rate ?? 0),
      payment_terms: trainer.payment_terms ?? "",
      guarantee_amount: Number(trainer.guarantee_amount ?? 0),
      guarantee_sessions: Number(trainer.guarantee_sessions ?? 0),
      management_fee: Number(trainer.management_fee ?? 0),
    })),
  };

  const stamp = new Date().toISOString().slice(0, 10);
  downloadTextFile(
    JSON.stringify(payload, null, 2),
    `trainer-pay-parameters-${stamp}.json`,
    "application/json;charset=utf-8"
  );
}