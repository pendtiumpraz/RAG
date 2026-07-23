/** Deklarasi tipe utk paket tanpa @types. */
declare module 'pdf-parse' {
  interface PdfParseResult { text: string; numpages: number; info: unknown }
  function pdfParse(data: Buffer | Uint8Array): Promise<PdfParseResult>;
  export default pdfParse;
}
