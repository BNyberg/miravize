export function requestCode(taskNumber: number, idCode: string) {
  return `R-${idCode}${String(taskNumber).padStart(2, '0')}`
}
