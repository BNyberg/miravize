export function taskCode(taskNumber, idCode) {
    return `T-${idCode}${String(taskNumber).padStart(2, '0')}`;
}
