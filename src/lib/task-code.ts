export function taskCode(taskNumber: number, idCode: string) {
  return `T-${idCode}${String(taskNumber).padStart(2, '0')}`
}
