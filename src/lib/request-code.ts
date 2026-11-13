export function requestCode(taskNumber: number) {
  return `R-${String(taskNumber).padStart(2, '0')}`
}
