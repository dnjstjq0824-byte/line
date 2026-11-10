declare module 'qrcode-generator' {
  interface QrCode {
    addData(data: string): void
    make(): void
    getModuleCount(): number
    isDark(row: number, col: number): boolean
    createSvgTag(cellSize?: number | { cellSize?: number; margin?: number; scalable?: boolean }, margin?: number): string
  }
  const qrcode: (typeNumber: number, errorCorrectionLevel: string) => QrCode
  export default qrcode
}
