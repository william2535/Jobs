/** Shared choices for creating and editing a visit; drawing discipline stays separate. */
export const DISCIPLINES = ["Fire", "Security", "Intruder", "CCTV", "Access control", "Custom"];
export const JOB_TYPES = ["Maintenance", "Small works", "Install", "Take over visit", "Call out", "Custom"];
export const LEGACY_JOB_TYPES = ["Fire alarm maintenance", "General fault or repair work"];

export function validateJobClassification(value, { required = false, allowLegacy = true } = {}) {
  const text = (key, label) => {
    const input = value?.[key] ?? "";
    if (typeof input !== "string" || input.length > 120)
      throw Error(`${label} must be text of at most 120 characters.`);
    return input.trim();
  };
  const discipline = text("discipline", "Discipline");
  const workType = text("workType", "Job type");
  if ((required || discipline) && !DISCIPLINES.includes(discipline))
    throw Error("Choose a discipline.");
  const types = allowLegacy ? [...JOB_TYPES, ...LEGACY_JOB_TYPES] : JOB_TYPES;
  if ((required || workType) && !types.includes(workType))
    throw Error("Choose a job type.");
  const customDiscipline = text("customDiscipline", "Custom discipline");
  const customWorkType = text("customWorkType", "Custom job type");
  if (discipline === "Custom" && !customDiscipline) throw Error("Enter the custom discipline.");
  if (workType === "Custom" && !customWorkType) throw Error("Enter the custom job type.");
  return {
    discipline,
    workType,
    customDiscipline: discipline === "Custom" ? customDiscipline : "",
    customWorkType: workType === "Custom" ? customWorkType : "",
  };
}

export const disciplineLabel = (job) => job.discipline === "Custom" ? job.customDiscipline || "Custom" : job.discipline || "";
export const jobTypeLabel = (job) => job.workType === "Custom" ? job.customWorkType || "Custom" : job.workType || "";
