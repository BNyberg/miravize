export function taskCode(taskNumber: number) {
  return `T-${String(taskNumber).padStart(2, '0')}`
}
