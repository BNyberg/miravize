export function requestCode(taskNumber, idCode) {
    return `R-${idCode}${String(taskNumber).padStart(2, '0')}`;
}
